// ============================================================
//  FILE: app/api/cheatsheet/generate/route.js
//  POST → generate structured cheatsheet for a session
//  Returns: sections, formulas list, last-10-minutes bullets
// ============================================================
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callGeminiJson } from "@/lib/gemini";
import { NextResponse } from "next/server";

export const maxDuration = 120;

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

  const { sessionId } = body;
  if (!sessionId)
    return NextResponse.json({ error: "sessionId required." }, { status: 400 });

  const admin = createAdminClient();

  const [sessionRes, conceptsRes] = await Promise.all([
    admin
      .from("study_sessions")
      .select("topic, subject")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single(),
    admin
      .from("concepts")
      .select(
        "title, base_explanation, keywords, category, exam_probability, exam_question, comparison_pair, why_forgettable",
      )
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("exam_probability", { ascending: false })
      .limit(30),
  ]);

  if (!sessionRes.data)
    return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const concepts = conceptsRes.data ?? [];
  if (concepts.length === 0)
    return NextResponse.json(
      { error: "No concepts found for this session." },
      { status: 404 },
    );

  const { topic, subject } = sessionRes.data;

  const conceptList = concepts
    .map(
      (c) =>
        `CONCEPT: ${c.title}
TYPE: ${c.category}
DEFINITION: ${c.base_explanation}
KEYWORDS: ${c.keywords?.join(", ") ?? ""}
EXAM QUESTION: ${c.exam_question ?? ""}
COMPARISON: ${c.comparison_pair ?? ""}
WHY HARD: ${c.why_forgettable ?? ""}
PRIORITY: ${c.exam_probability}/5`,
    )
    .join("\n---\n");

  const prompt = `
You are creating a PREMIUM revision cheat sheet for a ${subject ?? "engineering"} exam.
Topic: "${topic}"

CONCEPTS TO COMPRESS:
${conceptList}

Create a dense, exam-ready cheat sheet a student can hold in their hand and use in the last 30 minutes before an exam. Return ONLY valid JSON:
{
  "title": "${topic}",
  "subject": "${subject ?? ""}",
  "sections": [
    {
      "heading": "Section name — group related concepts logically",
      "items": [
        {
          "concept": "Exact concept title",
          "one_liner": "Single dense exam-ready sentence — include all key technical terms — NOT vague",
          "formula_or_rule": "Exact formula, algorithm, or rule — null if none",
          "vs_point": "X vs Y: the single most testable difference — null if not comparison",
          "exam_tip": "One exam tip under 12 words",
          "priority": 5
        }
      ]
    }
  ],
  "formulas_list": [
    {
      "name": "Formula or algorithm name",
      "formula": "The exact formula / complexity / equation / rule",
      "used_when": "One line: when to apply"
    }
  ],
  "last_10_minutes": [
    "Single high-density exam-ready bullet — the single most critical thing — write as if reminding someone who already knows it"
  ]
}

STRICT RULES:
- 3 to 5 sections, each with 2-8 items
- one_liner: dense with technical specifics — bad example: 'It is a process that works in steps.' Good: 'CSMA/CD: detects collision during transmission, stops, waits random backoff (binary exponential), retransmits — used in 802.3 Ethernet'
- formulas_list: include EVERY formula, equation, Big-O complexity, algorithm step, key rule — even if mentioned in sections
- last_10_minutes: exactly 10 bullets — the top 10 highest-exam-probability facts
- Write for someone with 10 minutes before the exam who already studied this material
`;

  let cheatsheet;
  try {
    cheatsheet = await callGeminiJson(prompt, {
      temperature: 0.2,
      maxTokens: 4096,
    });
  } catch (err) {
    const msg = String(err?.message ?? "Generation failed.");
    console.error("[cheatsheet/generate] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    cheatsheet,
    topic,
    subject: subject ?? "",
    concept_count: concepts.length,
  });
}
