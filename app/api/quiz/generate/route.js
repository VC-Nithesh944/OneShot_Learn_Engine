// ============================================================
//  FILE: app/api/quiz/generate/route.js
//  GET → generate a quiz for a concept
//  Query params: ?conceptId=xxx
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateQuiz, getAdaptiveBloomLevel } from "@/lib/generateQuiz";
import { NextResponse } from "next/server";

function shuffleQuestions(questions) {
  const shuffled = [...questions];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function pickQuizQuestions(questionPool, count = 5) {
  const normalizedPool = Array.isArray(questionPool)
    ? questionPool.filter(Boolean)
    : [];
  if (normalizedPool.length <= count) return normalizedPool;
  return shuffleQuestions(normalizedPool).slice(0, count);
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("conceptId");
  if (!conceptId)
    return NextResponse.json({ error: "conceptId required" }, { status: 400 });

  const supabase = createAdminClient();
  const questionCount = 8;
  const displayCount = 5;

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("score, quality_rating, time_taken_ms")
    .eq("concept_id", conceptId)
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false })
    .limit(5);

  const desiredBloomLevel = getAdaptiveBloomLevel(attempts ?? []);

  const { data: cachedPool, error: poolReadError } = await supabase
    .from("quiz_question_pools")
    .select("*")
    .eq("concept_id", conceptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (poolReadError) {
    return NextResponse.json({ error: poolReadError.message }, { status: 500 });
  }

  if (
    cachedPool?.question_pool &&
    Array.isArray(cachedPool.question_pool) &&
    cachedPool.question_pool.length >= displayCount &&
    (cachedPool.bloom_level ?? "remember") === desiredBloomLevel
  ) {
    const questions = pickQuizQuestions(cachedPool.question_pool, displayCount);
    return NextResponse.json({
      quiz: {
        bloom_level: cachedPool.bloom_level ?? desiredBloomLevel,
        estimated_time_seconds: 90,
        questions,
      },
      concept: { id: conceptId },
      cached: true,
      poolSize: cachedPool.question_pool.length,
    });
  }

  // Fetch concept
  const { data: concept, error } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", conceptId)
    .eq("user_id", userId)
    .single();

  if (error || !concept)
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });

  const generatedPool = await generateQuiz(
    concept,
    attempts ?? [],
    questionCount,
  );

  const { data: savedPool, error: saveError } = await supabase
    .from("quiz_question_pools")
    .upsert(
      {
        user_id: userId,
        concept_id: conceptId,
        bloom_level: generatedPool.bloom_level ?? "remember",
        question_pool: generatedPool.questions ?? [],
        question_count: generatedPool.questions?.length ?? questionCount,
      },
      { onConflict: "user_id,concept_id" },
    )
    .select("*")
    .single();

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  const questions = pickQuizQuestions(
    savedPool.question_pool ?? generatedPool.questions ?? [],
    displayCount,
  );

  return NextResponse.json({
    quiz: {
      bloom_level: savedPool.bloom_level ?? generatedPool.bloom_level,
      estimated_time_seconds: generatedPool.estimated_time_seconds ?? 90,
      questions,
    },
    concept: { id: concept.id, title: concept.title },
    cached: false,
    poolSize:
      savedPool.question_pool?.length ?? generatedPool.questions?.length ?? 0,
  });
}
