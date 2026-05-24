// ============================================================
//  FILE: app/api/dashboard/route.js
//  GET → everything needed for the dashboard in one request
//  (due concepts + user stats + retention overview)
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();

  // Run all queries in parallel for speed
  const [
    profileRes,
    dueRes,
    sessionsRes,
    conceptsRes,
    sessionsCountRes,
    attemptsRes,
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
      .select("id, topic, filename, created_at, concept_count")
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
      .select("concept_id, score, quality_rating, attempted_at")
      .eq("user_id", userId)
      .order("attempted_at", { ascending: false }),
  ]);

  const profile = profileRes.data;
  const sessions = sessionsRes.data ?? [];
  const concepts = conceptsRes.data ?? [];
  const sessionsCount = sessionsCountRes.count ?? 0;
  const attempts = attemptsRes.data ?? [];

  const latestAttemptByConcept = new Map();
  const attemptCountByConcept = new Map();
  for (const attempt of attempts) {
    if (!latestAttemptByConcept.has(attempt.concept_id)) {
      latestAttemptByConcept.set(attempt.concept_id, attempt);
    }
    attemptCountByConcept.set(
      attempt.concept_id,
      (attemptCountByConcept.get(attempt.concept_id) ?? 0) + 1,
    );
  }

  const conceptsById = new Map();
  for (const concept of concepts) {
    if (concept?.id) conceptsById.set(concept.id, concept);
  }

  const dueConcepts = (dueRes.data ?? []).map((concept) => {
    const conceptId = concept?.id ?? concept?.concept_id ?? concept?.conceptId;
    const fullConcept = conceptId ? conceptsById.get(conceptId) : null;
    const merged = fullConcept ? { ...fullConcept, ...concept } : concept;
    const attemptCount = attemptCountByConcept.get(conceptId) ?? 0;
    return {
      ...merged,
      has_quiz_attempt: Boolean(
        conceptId ? latestAttemptByConcept.has(conceptId) : false,
      ),
      quiz_attempt_count: attemptCount,
      is_mastered: attemptCount >= 4,
      last_quiz_at:
        conceptId && latestAttemptByConcept.has(conceptId)
          ? latestAttemptByConcept.get(conceptId).attempted_at
          : null,
    };
  });

  const reviewedDueConcepts = dueConcepts.filter(
    (concept) => concept.has_quiz_attempt && !concept.is_mastered,
  );

  const hasAnyQuizzes = latestAttemptByConcept.size > 0;

  const conceptsBySession = new Map();
  for (const concept of concepts) {
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

  const globalRetentionValues = concepts
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
      dueCount: reviewedDueConcepts.length,
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
    dueConcepts: reviewedDueConcepts,
    sessionRetentionOverview,
    // notifications removed: browser push replaces in-app reminders
  });
}
