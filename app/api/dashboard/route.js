// ============================================================
//  FILE: app/api/dashboard/route.js
//  GET → everything needed for the dashboard in one request
//  (due concepts + user stats + retention overview)
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { FREE_DAILY_UPLOAD_LIMIT } from "@/lib/constants";
import { addIstDays, startOfIstDay } from "@/lib/istDate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const todayStart = startOfIstDay();
  const tomorrowStart = addIstDays(todayStart, 1);

  // Run all queries in parallel for speed
  const [
    profileRes,
    conceptsRes,
    sessionsRes,
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

    // All concepts for the user; due state is derived from latest attempts.
    supabase
      .from("concepts")
      .select(
        "id, title, session_id, complexity, category, keywords, base_explanation, why_forgettable, exam_question, comparison_pair, retention_pct, exam_probability, next_review_at",
      )
      .eq("user_id", userId),

    // All processed sessions for session-level retention overview
    supabase
      .from("study_sessions")
      .select("id, topic, filename, created_at, concept_count, exam_summary")
      .eq("user_id", userId)
      .eq("is_processed", true)
      .order("created_at", { ascending: false })
      .limit(60),

    // Count total sessions
    supabase
      .from("study_sessions")
      .select("id", { count: "exact" })
      .eq("user_id", userId)
      .eq("is_processed", true),

    supabase
      .from("quiz_attempts")
      .select(
        "concept_id, session_id, score, quality_rating, attempted_at, review_in_future, estimated_retention_pct",
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
  const concepts = conceptsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
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
  const attemptedConceptIdsBySession = new Map();
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

    if (!attemptedConceptIdsBySession.has(attempt.session_id)) {
      attemptedConceptIdsBySession.set(attempt.session_id, new Set());
    }
    attemptedConceptIdsBySession
      .get(attempt.session_id)
      .add(attempt.concept_id);
  }

  const sessionsById = new Map();
  for (const session of sessions) {
    if (session?.id) sessionsById.set(session.id, session);
  }

  const dueConcepts = concepts
    .map((concept) => {
      const conceptId =
        concept?.id ?? concept?.concept_id ?? concept?.conceptId;
      const attemptCount = attemptCountByConcept.get(conceptId) ?? 0;
      const latestAttempt = conceptId
        ? latestAttemptByConcept.get(conceptId)
        : null;
      const latestRetentionPct = Number(latestAttempt?.estimated_retention_pct);
      const latestNextReviewAt =
        latestAttempt?.next_review_at ?? concept?.next_review_at ?? null;
      const reviewInFuture = latestAttempt?.review_in_future;
      return {
        ...concept,
        retention_pct: Number.isFinite(latestRetentionPct)
          ? latestRetentionPct
          : null,
        retentionPct: Number.isFinite(latestRetentionPct)
          ? latestRetentionPct
          : null,
        estimated_retention_pct: Number.isFinite(latestRetentionPct)
          ? latestRetentionPct
          : null,
        estimatedRetentionPct: Number.isFinite(latestRetentionPct)
          ? latestRetentionPct
          : null,
        review_in_future: reviewInFuture,
        reviewInFuture,
        has_quiz_attempt: Boolean(
          conceptId ? latestAttemptByConcept.has(conceptId) : false,
        ),
        quiz_attempt_count: attemptCount,
        is_mastered: attemptCount >= 4,
        last_quiz_at:
          conceptId && latestAttemptByConcept.has(conceptId)
            ? latestAttemptByConcept.get(conceptId).attempted_at
            : null,
        next_review_at: latestNextReviewAt,
        nextReviewAt: latestNextReviewAt,
      };
    })
    .filter((concept) => concept.has_quiz_attempt && !concept.is_mastered);

  const dueTodayConcepts = dueConcepts
    .filter((concept) => {
      const nextReviewAt = concept?.next_review_at ?? concept?.nextReviewAt;
      if (!nextReviewAt) return false;
      const nextReviewTime = new Date(nextReviewAt).getTime();
      if (!Number.isFinite(nextReviewTime)) return false;
      const retention = Number(
        concept?.estimatedRetentionPct ??
          concept?.estimated_retention_pct ??
          concept?.retentionPct ??
          concept?.retention_pct,
      );
      const optedOutWithHighRetention =
        concept?.review_in_future === false &&
        Number.isFinite(retention) &&
        retention > 65;
      if (optedOutWithHighRetention) return false;
      return nextReviewTime < tomorrowStart.getTime();
    })
    .sort((left, right) => {
      const leftRetention = Number.isFinite(left.estimatedRetentionPct)
        ? Number(left.estimatedRetentionPct)
        : Number.isFinite(left.estimated_retention_pct)
          ? Number(left.estimated_retention_pct)
          : Number(left.retentionPct ?? left.retention_pct ?? 101);
      const rightRetention = Number.isFinite(right.estimatedRetentionPct)
        ? Number(right.estimatedRetentionPct)
        : Number.isFinite(right.estimated_retention_pct)
          ? Number(right.estimated_retention_pct)
          : Number(right.retentionPct ?? right.retention_pct ?? 101);

      if (leftRetention !== rightRetention) {
        return leftRetention - rightRetention;
      }

      const leftNextReviewAt = left.next_review_at ?? left.nextReviewAt ?? null;
      const rightNextReviewAt =
        right.next_review_at ?? right.nextReviewAt ?? null;
      const leftNextReviewTime = new Date(leftNextReviewAt ?? 0).getTime();
      const rightNextReviewTime = new Date(rightNextReviewAt ?? 0).getTime();

      const leftTagRank = Number.isFinite(leftNextReviewTime)
        ? leftNextReviewTime < todayStart.getTime()
          ? 0
          : 1
        : 2;
      const rightTagRank = Number.isFinite(rightNextReviewTime)
        ? rightNextReviewTime < todayStart.getTime()
          ? 0
          : 1
        : 2;

      if (leftTagRank !== rightTagRank) {
        return leftTagRank - rightTagRank;
      }

      if (leftNextReviewTime !== rightNextReviewTime) {
        return leftNextReviewTime - rightNextReviewTime;
      }

      return String(left.title ?? "").localeCompare(String(right.title ?? ""));
    });

  const hasAnyQuizzes = latestAttemptByConcept.size > 0;

  const sessionRetentionOverview = sessions
    .map((session) => {
      const totalConcepts =
        Number(session.concept_count ?? 0) > 0
          ? Number(session.concept_count)
          : 0;

      const sessionConceptIds = Array.from(
        attemptedConceptIdsBySession.get(session.id) ?? [],
      );

      let attemptedConcepts = 0;
      let latestQuizTimestamp = null;
      const latestScores = [];
      const modelRetentionValues = [];

      for (const conceptId of sessionConceptIds) {
        const latestAttempt = latestAttemptByConcept.get(conceptId);
        if (!latestAttempt) continue;

        attemptedConcepts += 1;
        const retentionValue = Number(latestRetentionByConcept.get(conceptId));
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

  const globalRetentionValues = Array.from(latestRetentionByConcept.entries())
    .filter(([conceptId]) => (attemptCountByConcept.get(conceptId) ?? 0) > 0)
    .map(([, storedRetention]) => {
      const retentionValue = Number(storedRetention);
      return Number.isFinite(retentionValue) ? retentionValue : null;
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
