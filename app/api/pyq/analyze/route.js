// ============================================================
//  FILE: app/api/pyq/analyze/route.js
//  POST → analyze previous year paper against session concepts
//  Returns: question patterns + prioritized predictions + gaps
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callGeminiJson } from "@/lib/gemini";
import { sanitizeTextForPrompt } from "@/lib/sanitize";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { sessionId, pyqText, subject } = body;

  if (!sessionId || !String(pyqText ?? "").trim()) {
    return NextResponse.json(
      { error: "sessionId and pyqText are required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch session concepts for cross-referencing
  const { data: concepts, error: conceptsErr } = await admin
    .from("concepts")
    .select(
      "title, base_explanation, category, keywords, exam_probability, exam_question, comparison_pair",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("exam_probability", { ascending: false });

  if (conceptsErr || !concepts?.length) {
    return NextResponse.json(
      { error: "No concepts found for this session. Upload study notes first." },
      { status: 404 },
    );
  }

  const cleanPyq = sanitizeTextForPrompt(String(pyqText)).slice(0, 8000);

  const conceptSummary = concepts
    .map(
      (c) =>
        `[${c.category}] "${c.title}": ${String(c.base_explanation ?? "").slice(0, 120)}`,
    )
    .join("\n");

  const prompt = `
You are an expert ${subject ?? "engineering"} professor and exam analyst with 20 years of experience setting and predicting exam questions.

PREVIOUS YEAR QUESTION PAPER TEXT:
---
${cleanPyq}
---

STUDENT'S STUDIED CONCEPTS (cross-reference these):
${conceptSummary}

YOUR TASK:
1. Extract question patterns: what types appear, which topics repeat, marks distribution
2. Cross-reference with the student's studied concepts to rank prediction likelihood
3. Generate precise exam predictions with model answers that score full marks
4. Identify any topic gaps the student must quickly review

Return ONLY valid JSON, no markdown fences:
{
  "patterns": {
    "exam_style": "One sentence: e.g. 'Theory-heavy with mandatory comparison questions and one diagram question'",
    "question_types": ["10m descriptive theory", "5m short answer", "2m objective"],
    "hot_topics": [
      { "topic": "Topic name", "frequency": "Appeared 3 times", "note": "Always asked as comparison" }
    ],
    "mark_distribution": "e.g. 3×10m + 4×5m + 10×2m = 60 marks total"
  },
  "predictions": [
    {
      "question": "Exact question phrasing matching PYQ style — include marks in brackets if visible e.g. [10m]",
      "topic": "Exact concept title from student's studied concepts",
      "priority": 5,
      "marks": 10,
      "model_answer": "Complete exam-ready answer — dense, technical, 6-8 sentences. Use numbered points if the PYQ style suggests it. Must score full marks.",
      "key_points": ["Mandatory point 1 to write", "Mandatory point 2", "Mandatory point 3"],
      "reason": "Why predicted: e.g. 'Asked in 3 of last 5 years, always as 10m question'"
    }
  ],
  "coverage_gaps": [
    "Specific topic from PYQ NOT in student's notes — be precise about what's missing"
  ]
}

RULES:
- predictions: 8 to 12 total, sorted by priority descending (5 = certain, 4 = very likely, 3 = probable)
- model_answer: answer-sheet quality — specific technical terms, correct definitions, complete explanation
- If PYQ asks for diagrams, mention them in model_answer
- coverage_gaps: max 5 items, specific gaps only
- Match the question phrasing style exactly to what PYQ shows (long descriptive vs short crisp)
`;

  let result;
  try {
    result = await callGeminiJson(prompt, { temperature: 0.25, maxTokens: 4096 });
  } catch (err) {
    const msg = String(err?.message ?? "Analysis failed.");
    console.error("[pyq/analyze] Gemini error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    patterns: result.patterns ?? {},
    predictions: Array.isArray(result.predictions) ? result.predictions : [],
    coverage_gaps: Array.isArray(result.coverage_gaps) ? result.coverage_gaps : [],
  });
}
