// ============================================================
//  FILE: lib/transformConcept.js
//  Generates the 4 learning style transforms for a concept.
//  Results are cached in concept_transforms table.
// ============================================================

import { callGeminiJson } from './gemini'

function getComparisonLabels(concept) {
  const [left, right] = String(concept?.comparison_pair ?? "")
    .split(" vs ")
    .map((part) => part.trim());

  return {
    left: left || "Option A",
    right: right || "Option B",
  };
}

const STYLE_PROMPTS = {
  analogy: `
    Create a concrete real-world analogy that maps EVERY part of the concept
    to something the student encounters daily (household objects, food, buildings,
    city infrastructure — never tech analogies for tech concepts).
    Format: Start with the mapping sentence, then explain why each part maps.
    End with ONE punchy line that captures the whole idea.`,

  visual: `
    Describe this as a visual ASCII diagram or structured layout.
    Use boxes, arrows (→, ←, ↔), indentation, and labels.
    Show relationships, hierarchy, and data flow clearly.
    A student should be able to redraw this from memory.`,

  story: `
    Write a 5-7 sentence mini-story. Use a relatable character facing a real
    problem. The concept must be the SOLUTION to that problem.
    Use cause-and-effect. End with what would happen WITHOUT this concept.
    Avoid tech jargon — explain through actions and consequences.`,

  simplified: `
    Break this down for someone who just started:
    Step 1: List exactly 2 prerequisite mini-ideas they must know first (one sentence each).
    Step 2: Explain the main concept using ONLY those building blocks.
    Step 3: Write ONE sentence summary they could say to a friend.
    Use the simplest possible words.`,

  comparison: `
    This is a comparison concept. Structure the explanation as a clear head-to-head breakdown:
    1. One sentence on what each thing IS (don't assume the student knows)
    2. A comparison table in this format (ASCII):
       Feature     | left option | right option
       -----------|-----------|----------
       [feature1] | [value]   | [value]
    3. The "choose X when..." rule — one line each
    4. The single most important difference (what exams love to ask)
  `,

  advantage_disadvantage: `
    Structure this as a balanced pros/cons analysis:
    ADVANTAGES (why it exists / what problem it solves):
    → [point 1]
    → [point 2]
    DISADVANTAGES (when it fails / what it costs):
    → [point 1]
    → [point 2]
    VERDICT: One sentence — when should a student recommend this in an exam answer?
    COMMON EXAM TRAP: What wrong assumption do students make about this?
  `,
};

export async function transformConcept(concept, style) {
  if (!STYLE_PROMPTS[style]) {
    throw new Error(`Unknown transform style: ${style}`);
  }

  const comparisonLabels = getComparisonLabels(concept);
  const stylePrompt =
    style === "comparison"
      ? STYLE_PROMPTS.comparison
          .replace("left option", comparisonLabels.left)
          .replace("right option", comparisonLabels.right)
      : STYLE_PROMPTS[style];

  const prompt = `
You are an educational AI specializing in making abstract engineering concepts memorable.
 
Concept: "${concept.title}"
Base explanation: "${concept.base_explanation}"
Why students forget this: "${concept.why_forgettable}"
Category: ${concept.category}
Keywords: ${concept.keywords.join(", ")}
Complexity: ${concept.complexity}/5
 
Transform this concept using this approach:
${stylePrompt}
 
Return ONLY this JSON:
{
  "transformed_explanation": "The main transformed content (2-4 sentences)",
  "analogy_or_visual": "The analogy mapping / ascii diagram / story / step breakdown",
  "memory_hook": "One sticky phrase under 10 words the student will remember",
  "example": "One concrete real-world example (1-2 sentences)"
}`;

  return await callGeminiJson(prompt, { temperature: 0.8 })
}
