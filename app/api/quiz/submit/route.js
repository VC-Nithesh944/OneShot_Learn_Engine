// ============================================================
//  FILE: app/api/quiz/submit/route.js
//  POST → save quiz result, update SM-2 schedule, return next review date
//
//  Body: {
//    conceptId, quizType, score, qualityRating,
//    timeTakenMs, wasCorrect, bloomLevel, sessionId?
//  }
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIstDateKey } from "@/lib/istDate";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateEstimatedRetention({
  score,
  qualityRating,
  timeTakenMs,
  attemptCount,
  reviewFuture,
  examProbability,
}) {
  const accuracy = clamp(Number(score) || 0, 0, 100) / 100;
  const avgSecondsPerQuestion =
    Number(timeTakenMs) > 0 ? Number(timeTakenMs) / 5 / 1000 : 0;

  const paceFactor =
    avgSecondsPerQuestion <= 12
      ? 1.05
      : avgSecondsPerQuestion <= 20
        ? 1.02
        : avgSecondsPerQuestion <= 35
          ? 0.97
          : 0.9;

  const qualityFactor =
    qualityRating >= 5
      ? 1.08
      : qualityRating >= 4
        ? 1.04
        : qualityRating >= 3
          ? 1
          : qualityRating >= 2
            ? 0.93
            : 0.86;

  const repetitionFactor =
    attemptCount >= 5
      ? 1.08
      : attemptCount >= 3
        ? 1.05
        : attemptCount >= 2
          ? 1.02
          : 0.98;

  const examFactor =
    examProbability >= 5
      ? 1.06
      : examProbability >= 4
        ? 1.03
        : examProbability >= 3
          ? 1.01
          : 0.98;

  const intentFactor = reviewFuture ? 1.03 : 0.97;

  const blended =
    (18 + accuracy * 48) *
    paceFactor *
    qualityFactor *
    repetitionFactor *
    examFactor *
    intentFactor;
  return Math.round(clamp(blended, 12, 98));
}

function computeSimpleNextReview(score, qualityRating) {
  const days =
    qualityRating >= 5
      ? 7
      : qualityRating >= 4
        ? 4
        : qualityRating >= 3
          ? 2
          : 1;

  return {
    interval_days: days,
    retention_pct: Math.max(10, Math.min(100, Math.round(score))),
    next_review_date: new Date(Date.now() + days * 86400000).toISOString(),
    failed: qualityRating <= 1,
  };
}

function computeCumulativeNextReview(attemptCount, now = Date.now()) {
  const count = Math.max(0, Math.floor(Number(attemptCount ?? 0)));

  if (count >= 4) {
    return {
      interval_days: null,
      next_review_date: null,
      failed: false,
      is_mastered: true,
    };
  }

  const stageIntervals = [1, 3, 7];
  const intervalDays = stageIntervals
    .slice(0, Math.max(1, count))
    .reduce((total, days) => total + days, 0);

  return {
    interval_days: intervalDays,
    next_review_date: new Date(now + intervalDays * 86400000).toISOString(),
    failed: false,
    is_mastered: false,
  };
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    conceptId,
    score,
    qualityRating,
    timeTakenMs,
    wasCorrect,
    bloomLevel = "remember",
    sessionId = null,
    reviewFuture = false,
  } = body;

  if (!conceptId || score === undefined || qualityRating === undefined) {
    return NextResponse.json(
      { error: "conceptId, score, qualityRating required" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminClient();

  // ── 1. Save the quiz attempt (immutable insert)
  const { data: attemptRow, error: attemptErr } = await admin
    .from("quiz_attempts")
    .insert({
      concept_id: conceptId,
      user_id: userId,
      session_id: sessionId,
      quiz_type: "mcq",
      bloom_level: bloomLevel,
      score: Math.round(score),
      quality_rating: qualityRating,
      time_taken_ms: timeTakenMs,
      was_correct: wasCorrect,
      review_in_future: Boolean(reviewFuture),
    })
    .select("id")
    .single();

  if (attemptErr)
    return NextResponse.json({ error: attemptErr.message }, { status: 500 });
  // NOTE: retrieval_scores recalculation is triggered automatically by DB trigger

  // ── Update streak ──────────────────────────────────────────────────────
  const { data: userProfile } = await admin
    .from("user_profiles")
    .select("current_streak, longest_streak, last_active_at, learning_style")
    .eq("clerk_user_id", userId)
    .single();

  const today = new Date();
  const todayKey = getIstDateKey(today);

  if (userProfile) {
    const lastActive = userProfile.last_active_at
      ? new Date(userProfile.last_active_at)
      : null;
    const lastActiveDay = lastActive ? getIstDateKey(lastActive) : null;
    const yesterdayKey = getIstDateKey(new Date(today.getTime() - 86400000));

    let newStreak = userProfile.current_streak ?? 0;

    if (lastActiveDay === todayKey) {
      // Already studied today — keep the streak, but initialize day 1 if needed.
      if (newStreak === 0) newStreak = 1;
    } else if (lastActiveDay === yesterdayKey) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    const newLongest = Math.max(newStreak, userProfile.longest_streak ?? 0);

    await admin
      .from("user_profiles")
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_active_at: today.toISOString(),
      })
      .eq("clerk_user_id", userId);
  } else {
    await admin.from("user_profiles").insert({
      clerk_user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_at: today.toISOString(),
    });
  }

  // 2. Run SM-2 via the DB function
  let smResult = null;

  try {
    const { data, error } = await supabase.rpc("update_review_after_quiz", {
      p_concept_id: conceptId,
      p_user_id: userId,
      p_quality: qualityRating,
    });
    if (!error && data) smResult = data;
  } catch (error) {
    console.error("[quiz/submit] SM-2 rpc failed:", error?.message ?? error);
  }

  if (!smResult) {
    smResult = computeSimpleNextReview(score, qualityRating);
  }

  const { count: quizAttemptCount } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("concept_id", conceptId)
    .eq("user_id", userId);

  const { data: conceptRow } = await admin
    .from("concepts")
    .select("title, exam_probability")
    .eq("id", conceptId)
    .eq("user_id", userId)
    .maybeSingle();

  const estimatedRetentionPct = calculateEstimatedRetention({
    score,
    qualityRating,
    timeTakenMs,
    attemptCount: quizAttemptCount ?? 0,
    reviewFuture: Boolean(reviewFuture),
    examProbability: Number(conceptRow?.exam_probability ?? 3),
  });

  const cumulativeSchedule = computeCumulativeNextReview(quizAttemptCount ?? 0);

  smResult = {
    ...smResult,
    ...cumulativeSchedule,
  };

  const nextReviewDate = cumulativeSchedule.next_review_date;

  const { error: conceptUpdateError } = await admin
    .from("concepts")
    .update({
      next_review_at: nextReviewDate,
    })
    .eq("id", conceptId)
    .eq("user_id", userId);

  if (conceptUpdateError) {
    console.error(
      "[quiz/submit] concept schedule update failed:",
      conceptUpdateError.message,
    );
  }

  if (attemptRow?.id) {
    const { error: attemptUpdateError } = await admin
      .from("quiz_attempts")
      .update({
        estimated_retention_pct: estimatedRetentionPct,
        next_review_at: nextReviewDate,
      })
      .eq("id", attemptRow.id);

    if (attemptUpdateError) {
      console.error(
        "[quiz/submit] attempt retention update failed:",
        attemptUpdateError.message,
      );
    }
  }

  let masteredMilestone = null;
  if ((quizAttemptCount ?? 0) >= 4 && !smResult.failed) {
    masteredMilestone = {
      conceptId,
      title: conceptRow?.title ?? "Concept",
      quizAttemptCount: quizAttemptCount ?? 4,
    };
  }

  // estimated_retention_pct and next_review_at are persisted on quiz_attempts.
  // concepts.next_review_at remains synced as a fallback.
  return NextResponse.json({
    success: true,
    schedule: smResult,
    nextReviewDate:
      nextReviewDate ?? smResult.next_review_date ?? smResult.nextReviewDate,
    retentionPct: estimatedRetentionPct,
    estimatedRetentionPct,
    masteredMilestone,
    reviewFuture: Boolean(reviewFuture),
    message: masteredMilestone
      ? "Concept mastered - you can keep practicing anytime."
      : `Next review in ${smResult.interval_days ?? smResult.intervalDays ?? 1} day(s). Estimated retention: ${estimatedRetentionPct}%`,
  });
}
