// ============================================================
//  FILE: lib/generateQuiz.js
//  Generates adaptive micro-quizzes based on performance history.
// ============================================================

import { callGeminiJson } from "./gemini";

export function getAdaptiveBloomLevel(previousAttempts = []) {
  const avgScore =
    previousAttempts.length > 0
      ? previousAttempts.reduce(
          (sum, attempt) => sum + Number(attempt.score ?? 0),
          0,
        ) / previousAttempts.length
      : 50;

  return avgScore >= 80 ? "apply" : avgScore >= 55 ? "understand" : "remember";
}

function buildFallbackQuestion(concept, keyword, index) {
  return {
    id: `q${index + 1}`,
    type: "mcq",
    question: `Which option best describes ${keyword}?`,
    options: [
      `It is unrelated to ${concept.title}`,
      `It is a core part of ${concept.title}`,
      `It is only used as a metaphor`,
      `It has no role in this topic`,
    ],
    correct_option_index: 1,
    explanation: `${keyword} is a core part of ${concept.title}.`,
  };
}

function buildFallbackQuiz(concept, bloomLevel, questionCount = 8) {
  const keywords =
    concept.keywords?.length > 0 ? concept.keywords : [concept.title];
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const keyword = keywords[index % keywords.length];
    return buildFallbackQuestion(concept, keyword, index);
  });

  return {
    bloom_level: bloomLevel,
    estimated_time_seconds: 90,
    questions,
  };
}

function normalizeQuiz(concept, quiz, bloomLevel, questionCount = 8) {
  const normalizedQuestions = Array.isArray(quiz?.questions)
    ? quiz.questions
        .filter((question) => question?.type === "mcq")
        .map((question, index) => ({
          id: question.id ?? `q${index + 1}`,
          type: "mcq",
          question: String(question.question ?? "").trim(),
          options: Array.isArray(question.options)
            ? question.options.slice(0, 4)
            : [],
          correct_option_index: Number.isInteger(question.correct_option_index)
            ? question.correct_option_index
            : 0,
          explanation: String(question.explanation ?? "").trim(),
        }))
        .filter(
          (question) => question.question && question.options.length === 4,
        )
        .slice(0, questionCount)
    : [];

  const keywords =
    concept.keywords?.length > 0 ? concept.keywords : [concept.title];
  const paddedQuestions = [...normalizedQuestions];

  while (paddedQuestions.length < questionCount) {
    const index = paddedQuestions.length;
    const keyword = keywords[index % keywords.length];
    paddedQuestions.push(buildFallbackQuestion(concept, keyword, index));
  }

  return {
    bloom_level: bloomLevel,
    estimated_time_seconds: 90,
    questions: paddedQuestions.slice(0, questionCount),
  };
}

export async function generateQuiz(
  concept,
  previousAttempts = [],
  questionCount = 8,
) {
  const bloomLevel = getAdaptiveBloomLevel(previousAttempts);

  const bloomInstructions = {
    remember:
      "Test direct recall of definitions, names, and component identification.",
    understand:
      'Test explanation in own words, comparison between concepts, or asking "why".',
    apply:
      "Give a scenario or problem and ask the student to apply the concept to solve it.",
  };

  const prompt = `
You are an expert quiz designer trained in Bloom's Taxonomy.
Generate exactly ${questionCount} multiple-choice questions for this concept at level: ${bloomLevel.toUpperCase()}
 
Concept: "${concept.title}"
Explanation: "${concept.base_explanation}"
Keywords to test: ${concept.keywords.slice(0, 5).join(", ")}
Complexity: ${concept.complexity}/5
 
Question design rule: ${bloomInstructions[bloomLevel]}
 
Return ONLY this JSON:
{
  "bloom_level": "${bloomLevel}",
  "estimated_time_seconds": 90,
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "Question text here?",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_option_index": 1,
      "explanation": "Why B is correct and others are wrong — 2 sentences."
    }
  ]
}`;

  try {
    const quiz = await callGeminiJson(prompt, { temperature: 0.5 });
    return normalizeQuiz(concept, quiz, bloomLevel, questionCount);
  } catch {
    return buildFallbackQuiz(concept, bloomLevel, questionCount);
  }
}
