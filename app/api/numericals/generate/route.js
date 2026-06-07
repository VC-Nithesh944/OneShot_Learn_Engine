// ============================================================
//  FILE: app/api/numericals/generate/route.js
//  GET  → generate numerical/application practice problems
//  Query: ?conceptId=xxx
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callGeminiJson } from "@/lib/gemini";
import { NextResponse } from "next/server";

export const maxDuration = 120;

export async function GET(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const conceptId = searchParams.get("conceptId");
  if (!conceptId)
    return NextResponse.json({ error: "conceptId required." }, { status: 400 });

  const admin = createAdminClient();

  const { data: concept, error } = await admin
    .from("concepts")
    .select("*")
    .eq("id", conceptId)
    .eq("user_id", userId)
    .single();

  if (error || !concept)
    return NextResponse.json({ error: "Concept not found." }, { status: 404 });

  const isQuantitative = ["formula_rule", "process", "architecture"].includes(
    concept.category,
  );

  const problemTypeInstructions = isQuantitative
    ? "Generate numerical calculation problems with real values. Students must calculate, not just describe."
    : "Generate scenario-based application problems where students choose and apply the correct concept/approach. Use realistic case studies.";

  const prompt = `
You are an experienced ${concept.title} exam problem setter for engineering university exams.

Concept: "${concept.title}"
Category: ${concept.category}
Explanation: "${concept.base_explanation}"
Keywords: ${concept.keywords?.join(", ") ?? ""}
Complexity: ${concept.complexity ?? 3}/5

Problem type instruction: ${problemTypeInstructions}

Generate exactly 5 problems: 2 easy (5m each), 2 medium (10m each), 1 hard (15m).
Return ONLY valid JSON:
{
  "has_numericals": true,
  "disclaimer": "These are AI-generated practice problems. Verify solutions against your textbook for exam-critical questions.",
  "problems": [
    {
      "id": "p1",
      "difficulty": "easy",
      "marks": 5,
      "type": "numerical",
      "problem": "Full problem statement — include ALL given values, units, and exactly what to find. Be specific and realistic.",
      "given": ["Given: Value1 = X unit", "Given: Value2 = Y unit"],
      "find": "What must be calculated or determined",
      "solution_steps": [
        {
          "step": 1,
          "action": "Brief description of this step (e.g. 'Apply FCFS scheduling formula')",
          "work": "Actual calculation or reasoning — show all math",
          "result": "Result of this step with units"
        }
      ],
      "final_answer": "Final answer with correct value, units, and format",
      "formula_used": "Primary formula or rule applied",
      "common_mistake": "The most common error students make — be specific to this problem type"
    }
  ]
}

RULES:
- Use realistic engineering values, NOT trivial 1/2/3 values
- Each problem must be independently solvable from the given values
- solution_steps: show complete working — a student following these steps must reach the answer
- For pure theory concepts: make scenario-based problems where students explain which approach to use and why, then apply it
- common_mistake must be specific to THIS problem type, not generic
- hard problem must require 2-3 concepts working together
`;

  let result;
  try {
    result = await callGeminiJson(prompt, {
      temperature: 0.45,
      maxTokens: 3500,
    });
  } catch (err) {
    const msg = String(err?.message ?? "Generation failed.");
    console.error("[numericals/generate] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    problems: Array.isArray(result.problems) ? result.problems : [],
    has_numericals: result.has_numericals ?? true,
    disclaimer:
      result.disclaimer ??
      "AI-generated practice problems. Verify against your textbook.",
    conceptTitle: concept.title,
    category: concept.category,
  });
}
