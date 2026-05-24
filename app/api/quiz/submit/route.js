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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    conceptId,
    transformStyle = null,
    score,
    qualityRating,
    timeTakenMs,
    wasCorrect,
    bloomLevel = "remember",
    sessionId = null,
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
  const { error: attemptErr } = await admin.from("quiz_attempts").insert({
    concept_id: conceptId,
    user_id: userId,
    session_id: sessionId,
    quiz_type: "mcq",
    bloom_level: bloomLevel,
    score: Math.round(score),
    quality_rating: qualityRating,
    time_taken_ms: timeTakenMs,
    was_correct: wasCorrect,
  });

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
  const todayIso = today.toISOString();

  if (userProfile) {
    const lastActive = userProfile.last_active_at
      ? new Date(userProfile.last_active_at)
      : null;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastActiveDay = lastActive
      ? lastActive.toISOString().slice(0, 10)
      : null;
    const todayStr = today.toISOString().slice(0, 10);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = userProfile.current_streak ?? 0;

    if (lastActiveDay === todayStr) {
      // Already studied today — keep the streak, but initialize day 1 if needed.
      if (newStreak === 0) newStreak = 1;
    } else if (lastActiveDay === yesterdayStr) {
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
        last_active_at: todayIso,
      })
      .eq("clerk_user_id", userId);
  } else {
    await admin.from("user_profiles").insert({
      clerk_user_id: userId,
      current_streak: 1,
      longest_streak: 1,
      last_active_at: todayIso,
    });
  }

  const normalizedTransformStyle = String(transformStyle ?? "").toLowerCase();
  if (
    userProfile?.learning_style === "balanced" &&
    ["visual", "story", "analogy", "simplified"].includes(
      normalizedTransformStyle,
    ) &&
    score >= 70
  ) {
    await admin
      .from("user_profiles")
      .update({ learning_style: normalizedTransformStyle })
      .eq("clerk_user_id", userId);
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

  let masteredMilestone = null;
  if ((quizAttemptCount ?? 0) >= 4 && !smResult.failed) {
    const { data: conceptRow } = await admin
      .from("concepts")
      .select("title")
      .eq("id", conceptId)
      .eq("user_id", userId)
      .maybeSingle();

    masteredMilestone = {
      conceptId,
      title: conceptRow?.title ?? "Concept",
      quizAttemptCount: quizAttemptCount ?? 4,
    };
  }

  // concepts.retention_pct and next_review_at are synced by the review_schedule trigger.
  return NextResponse.json({
    success: true,
    schedule: smResult,
    nextReviewDate: smResult.next_review_date ?? smResult.nextReviewDate,
    retentionPct: smResult.retention_pct,
    masteredMilestone,
    message: masteredMilestone
      ? "Concept mastered - you can keep practicing anytime."
      : `Next review in ${smResult.interval_days ?? smResult.intervalDays ?? 1} day(s). Retention: ${smResult.retention_pct}%`,
  });
}
