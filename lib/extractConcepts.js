// lib/extractConcepts.js

import { callGeminiJson } from "./gemini";
import { sanitizeTextForPrompt } from "./sanitize";

// ── Text chunking ─────────────────────────────────────────────────────────────
// Overlap ensures concepts that span chunk boundaries are not missed
function chunkText(text, chunkSize = 3500, overlap = 400) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

// ── Deduplication ─────────────────────────────────────────────────────────────
// Two concepts are duplicates when one title contains the other and lengths are close
function deduplicateConcepts(concepts) {
  const seen = [];
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const concept of concepts) {
    const norm = normalize(concept.title);
    const isDup = seen.some((s) => {
      const sn = normalize(s.title);
      return (
        (sn.includes(norm) || norm.includes(sn)) &&
        Math.abs(norm.length - sn.length) < 10
      );
    });
    if (!isDup) seen.push(concept);
  }
  return seen;
}

// ── Category reference for Gemini ────────────────────────────────────────────
const EXAM_CATEGORIES = `
CATEGORY — use exactly one per concept:
"definition"             → What is X? Define X.
"comparison"             → Difference between X and Y. X vs Y.
"advantage_disadvantage" → Pros/cons. Merits/demerits. When to use/avoid.
"process"                → How does X work? Steps in X.
"architecture"           → Components of X. Structure/layers of X.
"formula_rule"           → Algorithms, theorems, equations, rules.
"use_case"               → Applications. Where is X used?
"relationship"           → How X and Y relate. Role of X in Y.
`;

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildChunkPrompt(chunk, subject, chunkIndex, totalChunks) {
  return `
You are a ${subject} professor preparing students for university exams.
This is chunk ${chunkIndex + 1} of ${totalChunks} from the uploaded study material.

TASK: Extract ONLY high-exam-probability concepts (score 4 or 5).

EXTRACT (probability 4–5):
- Direct comparisons between two or more technologies/concepts
- Advantages and disadvantages of a system or approach
- Step-by-step processes professors ask students to explain
- Key definitions that appear in every exam
- Architectural components and their roles
- Algorithms, rules, or formulas
- Decision criteria: "when to use X vs Y"

SKIP (probability 1–3):
- Historical background and timeline information
- Vague introductory or motivational paragraphs
- Examples that merely illustrate an already-listed concept
- Repetitions of concepts already defined earlier

${EXAM_CATEGORIES}

Return ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "concepts": [
    {
      "temp_id": "c1",
      "title": "Concise title, max 8 words",
      "exam_question": "The single most likely exam question for this concept",
      "base_explanation": "3–4 sentence student-friendly explanation",
      "why_forgettable": "Specific reason this is hard to retain",
      "complexity": 3,
      "exam_probability": 5,
      "keywords": ["term1", "term2", "term3"],
      "category": "comparison",
      "visualizable": true,
      "comparison_pair": "X vs Y — fill only for comparison category, else null",
      "prerequisite_temp_ids": []
    }
  ]
}

TEXT:
---
${chunk}
---`;
}

// ── Exam summary prompt ───────────────────────────────────────────────────────
function buildSummaryPrompt(concepts, subject) {
  const list = concepts
    .map((c, i) => `${i + 1}. [${c.category}] ${c.title}`)
    .join("\n");
  return `
You are a ${subject} professor reviewing a student's concept list.

Concepts:
${list}

Return ONLY valid JSON:
{
  "top_exam_concepts": [
    { "title": "exact title from list", "reason": "one sentence — why professors test this" }
  ],
  "common_exam_patterns": [
    "Compare X and Y — appears in 80% of papers",
    "Explain working of Z with a diagram"
  ],
  "study_priority_order": ["title1", "title2", "title3"]
}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function extractConcepts(rawText, subject) {
  const cleanText = sanitizeTextForPrompt(rawText);
  const chunks = chunkText(cleanText, 3500, 400);

  console.log(
    `[extractConcepts] ${chunks.length} chunk(s) for subject: ${subject}`,
  );

  const allConcepts = [];
  let tempIdCounter = 1;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[extractConcepts] chunk ${i + 1}/${chunks.length}`);
    try {
      const prompt = buildChunkPrompt(chunks[i], subject, i, chunks.length);
      const parsed = await callGeminiJson(prompt, {
        temperature: 0.2,
        maxTokens: 4096,
      });

      const chunkConcepts = (parsed.concepts ?? []).map((c) => ({
        ...c,
        temp_id: `c${tempIdCounter++}`,
        chunk_index: i,
      }));

      allConcepts.push(...chunkConcepts);
    } catch (err) {
      console.error(`[extractConcepts] chunk ${i + 1} failed:`, err.message);
      // Continue — partial extraction is better than total failure
    }

    // Respect free-tier RPM limit. Use 5s spacing to avoid bursting
    // against stricter free tiers (7–15 RPM) and provide a safety margin.
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  if (allConcepts.length === 0) {
    throw new Error(
      "No concepts could be extracted from any chunk. The PDF may be image-only or the content may be unrecognised.",
    );
  }

  const deduplicated = deduplicateConcepts(allConcepts);
  deduplicated.sort(
    (a, b) => (b.exam_probability ?? 3) - (a.exam_probability ?? 3),
  );

  console.log(
    `[extractConcepts] ${allConcepts.length} raw → ${deduplicated.length} after dedup`,
  );

  // Exam summary — non-critical, never let it fail the whole request
  let exam_summary = null;
  try {
    // Wait before the summary call as well to avoid making the
    // last chunk and the summary call too close together.
    await new Promise((r) => setTimeout(r, 5000));
    exam_summary = await callGeminiJson(
      buildSummaryPrompt(deduplicated, subject),
      { temperature: 0.3, maxTokens: 1500 },
    );
  } catch (err) {
    console.warn("[extractConcepts] exam summary skipped:", err.message);
  }

  const avgComplexity =
    deduplicated.reduce((s, c) => s + (c.complexity || 3), 0) /
    deduplicated.length;
  const reading_level =
    avgComplexity <= 2
      ? "beginner"
      : avgComplexity <= 3.5
        ? "intermediate"
        : "advanced";

  return {
    topic: `${subject} — Exam Concepts`,
    reading_level,
    concept_count: deduplicated.length,
    concepts: deduplicated,
    exam_summary,
  };
}
