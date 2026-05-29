// ============================================================
//  FILE: app/api/dashboard/route.js
//  GET → everything needed for the dashboard in one request
//  (due concepts + user stats + retention overview)
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function shouldSurfaceExamPriority(concept) {
  const retentionValue = Number(
    concept?.retention_pct ?? concept?.retentionPct ?? 0,
  );
  const examProbability = Number(
    concept?.exam_probability ?? concept?.examProbability ?? 0,
  );
  const examSummary = String(
    concept?.session_exam_summary ?? concept?.exam_summary ?? "",
  ).toLowerCase();

  if (retentionValue <= 70) return true;
  if (examProbability >= 4) return true;
  return /compare|difference|process|steps|architecture|formula|algorithm|advantage|disadvantage|vs\.?/.test(
    examSummary,
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const FREE_DAILY_UPLOAD_LIMIT = 2;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  // Run all queries in parallel for speed
  const [
    profileRes,
    dueRes,
    sessionsRes,
    conceptsRes,
    sessionsCountRes,
    attemptsRes,
    uploadsTodayRes,
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "display_name, current_streak, total_concepts, last_active_at, learning_style",
      )
      .eq("clerk_user_id", userId)
      .single(),

    // Due concepts via our helper function
    supabase.rpc("get_due_concepts_for_user", { p_user_id: userId }),

    // All processed sessions for session-level retention overview
    supabase
      .from("study_sessions")
      .select("id, topic, filename, created_at, concept_count, exam_summary")
      .eq("user_id", userId)
      .eq("is_processed", true)
      .order("created_at", { ascending: false })
      .limit(60),

    // Concept retention values grouped by session
    supabase.from("concepts").select("*").eq("user_id", userId),

    // Count total sessions
    supabase
      .from("study_sessions")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .eq("is_processed", true),

    supabase
      .from("quiz_attempts")
      .select(
        "concept_id, score, quality_rating, attempted_at, review_in_future, estimated_retention_pct",
      )
      .eq("user_id", userId)
      .order("attempted_at", { ascending: false }),

    supabase
      .from("study_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString()),
  ]);

  const profile = profileRes.data;
  const sessions = sessionsRes.data ?? [];
  const concepts = conceptsRes.data ?? [];
  const sessionsCount = sessionsCountRes.count ?? 0;
  const attempts = attemptsRes.data ?? [];
  const uploadsUsedToday = uploadsTodayRes.count ?? 0;
  const uploadsRemaining = Math.max(
    0,
    FREE_DAILY_UPLOAD_LIMIT - uploadsUsedToday,
  );

  const latestAttemptByConcept = new Map();
  const attemptCountByConcept = new Map();
  const latestRetentionByConcept = new Map();
  for (const attempt of attempts) {
    if (!latestAttemptByConcept.has(attempt.concept_id)) {
      latestAttemptByConcept.set(attempt.concept_id, attempt);
    }
    if (!latestRetentionByConcept.has(attempt.concept_id)) {
      const attemptRetention = Number(attempt.estimated_retention_pct);
      if (Number.isFinite(attemptRetention)) {
        latestRetentionByConcept.set(attempt.concept_id, attemptRetention);
      }
    }
    attemptCountByConcept.set(
      attempt.concept_id,
      (attemptCountByConcept.get(attempt.concept_id) ?? 0) + 1,
    );
  }

  const conceptsWithLatestRetention = concepts.map((concept) => {
    const latestRetention = latestRetentionByConcept.get(concept.id);
    return Number.isFinite(latestRetention)
      ? { ...concept, retention_pct: latestRetention }
      : concept;
  });

  const conceptsById = new Map();
  for (const concept of conceptsWithLatestRetention) {
    if (concept?.id) conceptsById.set(concept.id, concept);
  }

  const sessionsById = new Map();
  for (const session of sessions) {
    if (session?.id) sessionsById.set(session.id, session);
  }

  const dueConcepts = (dueRes.data ?? []).map((concept) => {
    const conceptId = concept?.id ?? concept?.concept_id ?? concept?.conceptId;
    const fullConcept = conceptId ? conceptsById.get(conceptId) : null;
    const merged = fullConcept ? { ...fullConcept, ...concept } : concept;
    const attemptCount = attemptCountByConcept.get(conceptId) ?? 0;
    const latestAttempt = conceptId
      ? latestAttemptByConcept.get(conceptId)
      : null;
    const session = merged.session_id
      ? sessionsById.get(merged.session_id)
      : null;
    const reviewInFuture = latestAttempt?.review_in_future;
    const examPriorityDue =
      reviewInFuture === false
        ? shouldSurfaceExamPriority({
            ...merged,
            session_exam_summary: session?.exam_summary ?? null,
          })
        : true;
    return {
      ...merged,
      review_in_future: reviewInFuture,
      session_exam_summary: session?.exam_summary ?? null,
      has_quiz_attempt: Boolean(
        conceptId ? latestAttemptByConcept.has(conceptId) : false,
      ),
      quiz_attempt_count: attemptCount,
      is_mastered: attemptCount >= 4,
      due_by_exam_priority: reviewInFuture === false ? examPriorityDue : false,
      last_quiz_at:
        conceptId && latestAttemptByConcept.has(conceptId)
          ? latestAttemptByConcept.get(conceptId).attempted_at
          : null,
    };
  });

  const reviewedDueConcepts = dueConcepts.filter(
    (concept) =>
      concept.has_quiz_attempt &&
      !concept.is_mastered &&
      (concept.review_in_future !== false || concept.due_by_exam_priority),
  );

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const dueTodayConcepts = reviewedDueConcepts.filter((concept) => {
    const nextReviewAt = concept?.next_review_at ?? concept?.nextReviewAt;
    if (!nextReviewAt) return true;
    const nextReviewTime = new Date(nextReviewAt).getTime();
    if (!Number.isFinite(nextReviewTime)) return true;
    return nextReviewTime < todayEnd.getTime();
  });

  const hasAnyQuizzes = latestAttemptByConcept.size > 0;

  const conceptsBySession = new Map();
  for (const concept of conceptsWithLatestRetention) {
    const sessionId = concept.session_id;
    if (!sessionId) continue;
    if (!conceptsBySession.has(sessionId)) conceptsBySession.set(sessionId, []);
    conceptsBySession.get(sessionId).push(concept);
  }

  const sessionRetentionOverview = sessions
    .map((session) => {
      const sessionConcepts = conceptsBySession.get(session.id) ?? [];
      const totalConcepts =
        Number(session.concept_count ?? 0) > 0
          ? Number(session.concept_count)
          : sessionConcepts.length;

      let attemptedConcepts = 0;
      let latestQuizTimestamp = null;
      const latestScores = [];
      const modelRetentionValues = [];

      for (const concept of sessionConcepts) {
        const latestAttempt = latestAttemptByConcept.get(concept.id);
        if (latestAttempt) {
          attemptedConcepts += 1;
          const retentionValue = Number(concept.retention_pct);
          if (Number.isFinite(retentionValue)) {
            modelRetentionValues.push(
              Math.max(0, Math.min(100, Math.round(retentionValue))),
            );
          }

          const latestScore = Number(latestAttempt.score);
          if (Number.isFinite(latestScore)) {
            latestScores.push(
              Math.max(0, Math.min(100, Math.round(latestScore))),
            );
          }

          const ts = new Date(latestAttempt.attempted_at ?? 0).getTime();
          if (Number.isFinite(ts)) {
            latestQuizTimestamp =
              latestQuizTimestamp === null
                ? ts
                : Math.max(latestQuizTimestamp, ts);
          }
        }
      }

      const modelRetentionPct =
        modelRetentionValues.length > 0
          ? Math.round(
              modelRetentionValues.reduce((sum, val) => sum + val, 0) /
                modelRetentionValues.length,
            )
          : null;

      const quizAttemptPct =
        totalConcepts > 0
          ? Math.round((attemptedConcepts / totalConcepts) * 100)
          : 0;

      const quizAccuracyPct =
        latestScores.length > 0
          ? Math.round(
              latestScores.reduce((sum, val) => sum + val, 0) /
                latestScores.length,
            )
          : null;

      return {
        id: session.id,
        title: session.topic ?? session.filename ?? "Untitled session",
        created_at: session.created_at,
        total_concepts: totalConcepts,
        attempted_concepts: attemptedConcepts,
        quiz_attempt_pct: quizAttemptPct,
        quiz_accuracy_pct: quizAccuracyPct,
        model_retention_pct: modelRetentionPct,
        last_quiz_at:
          latestQuizTimestamp === null
            ? null
            : new Date(latestQuizTimestamp).toISOString(),
      };
    })
    .sort((left, right) => {
      if (left.quiz_attempt_pct !== right.quiz_attempt_pct) {
        return right.quiz_attempt_pct - left.quiz_attempt_pct;
      }
      const leftRetention = Number.isFinite(left.model_retention_pct)
        ? left.model_retention_pct
        : 101;
      const rightRetention = Number.isFinite(right.model_retention_pct)
        ? right.model_retention_pct
        : 101;
      return leftRetention - rightRetention;
    });

  const globalRetentionValues = conceptsWithLatestRetention
    .filter((concept) => (attemptCountByConcept.get(concept.id) ?? 0) > 0)
    .map((concept) => {
      const storedRetention = Number(concept.retention_pct);
      return Number.isFinite(storedRetention) ? storedRetention : null;
    })
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, Math.min(100, value)));

  const attemptedConceptCount = latestAttemptByConcept.size;
  const totalSessionConcepts = sessionRetentionOverview.reduce(
    (sum, session) => sum + Number(session.total_concepts ?? 0),
    0,
  );

  // If new user with no data
  const isNewUser =
    !profile || (profile.total_concepts === 0 && sessionsCount === 0);

  return NextResponse.json({
    isNewUser,
    profile,
    stats: {
      dueCount: dueTodayConcepts.length,
      totalConcepts: attemptedConceptCount,
      learnedConcepts: attemptedConceptCount,
      totalSessionConcepts,
      currentStreak: profile?.current_streak ?? 0,
      totalSessions: sessionsCount,
      avgRetention:
        globalRetentionValues.length > 0
          ? Math.round(
              globalRetentionValues.reduce((sum, value) => sum + value, 0) /
                globalRetentionValues.length,
            )
          : null,
    },
    hasAnyQuizzes,
    uploadQuota: {
      plan: "free",
      dailyLimit: FREE_DAILY_UPLOAD_LIMIT,
      usedToday: uploadsUsedToday,
      remainingToday: uploadsRemaining,
      resetAt: tomorrowStart.toISOString(),
    },
    dueConcepts: dueTodayConcepts.map((concept) => ({
      ...concept,
      is_due_review: true,
    })),
    sessionRetentionOverview,
    // notifications removed: browser push replaces in-app reminders
  });
}
