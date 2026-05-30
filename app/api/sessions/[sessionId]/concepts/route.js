// ============================================================
//  FILE: app/api/sessions/[sessionId]/concepts/route.js
//  GET → all concepts for a specific session
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function GET(request, { params }) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolvedParams = await params;
  const sessionId = resolvedParams?.sessionId;
  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Valid sessionId required" },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("v_concept_full")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("display_order", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const conceptIds = (data ?? []).map((concept) => concept.id).filter(Boolean);
  const { data: attempts, error: attemptsError } = conceptIds.length
    ? await supabase
        .from("quiz_attempts")
        .select(
          "concept_id, attempted_at, estimated_retention_pct, review_in_future, next_review_at",
        )
        .eq("user_id", userId)
        .order("attempted_at", { ascending: false })
        .in("concept_id", conceptIds)
    : { data: [], error: null };

  if (attemptsError)
    return NextResponse.json({ error: attemptsError.message }, { status: 500 });

  const attemptedConceptIds = new Set(
    (attempts ?? []).map((item) => item.concept_id),
  );
  const latestAttemptByConceptId = new Map();
  const attemptCountByConceptId = new Map();
  const latestRetentionByConceptId = new Map();
  const latestReviewFutureByConceptId = new Map();
  const latestNextReviewByConceptId = new Map();
  for (const attempt of attempts ?? []) {
    attemptCountByConceptId.set(
      attempt.concept_id,
      (attemptCountByConceptId.get(attempt.concept_id) ?? 0) + 1,
    );
    if (!latestAttemptByConceptId.has(attempt.concept_id)) {
      latestAttemptByConceptId.set(attempt.concept_id, attempt.attempted_at);
    }
    if (!latestRetentionByConceptId.has(attempt.concept_id)) {
      const attemptRetention = Number(attempt.estimated_retention_pct);
      if (Number.isFinite(attemptRetention)) {
        latestRetentionByConceptId.set(attempt.concept_id, attemptRetention);
      }
    }
    if (!latestReviewFutureByConceptId.has(attempt.concept_id)) {
      latestReviewFutureByConceptId.set(
        attempt.concept_id,
        Boolean(attempt.review_in_future),
      );
    }
    if (!latestNextReviewByConceptId.has(attempt.concept_id)) {
      latestNextReviewByConceptId.set(
        attempt.concept_id,
        attempt.next_review_at ?? null,
      );
    }
  }
  const concepts = (data ?? []).map((concept) => ({
    ...concept,
    retention_pct: Number.isFinite(latestRetentionByConceptId.get(concept.id))
      ? latestRetentionByConceptId.get(concept.id)
      : concept.retention_pct,
    retentionPct: Number.isFinite(latestRetentionByConceptId.get(concept.id))
      ? latestRetentionByConceptId.get(concept.id)
      : concept.retention_pct,
    has_quiz_attempt: attemptedConceptIds.has(concept.id),
    quiz_attempt_count: attemptCountByConceptId.get(concept.id) ?? 0,
    is_mastered: (attemptCountByConceptId.get(concept.id) ?? 0) >= 4,
    review_in_future: latestReviewFutureByConceptId.get(concept.id),
    reviewInFuture: latestReviewFutureByConceptId.get(concept.id),
    last_quiz_at: latestAttemptByConceptId.get(concept.id) ?? null,
    next_review_at:
      latestNextReviewByConceptId.get(concept.id) ??
      concept.next_review_at ??
      null,
    nextReviewAt:
      latestNextReviewByConceptId.get(concept.id) ??
      concept.next_review_at ??
      null,
  }));

  return NextResponse.json({ concepts });
}
