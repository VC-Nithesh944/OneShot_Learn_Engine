"use client";

import Skeleton from "react-loading-skeleton";

import { dueLabel, reviewTimingLabelFromDays } from "./dashboardShared";
import {
  getRecommendedLearnMode,
  getRetentionCurve,
  getSpacedReviewSchedule,
} from "@/lib/memorySignals";

export default function LearnView({
  concept,
  mode,
  onModeChange,
  learningStyle,
  transform,
  loading,
  onBack,
  onStartQuiz,
  nowMs,
}) {
  if (!concept) {
    return (
      <div className="card">
        Pick a concept from Dashboard or Sessions to start learning.
      </div>
    );
  }

  const modes = [
    { id: "analogy", label: "Analogy" },
    { id: "visual", label: "Visual" },
    { id: "story", label: "Story" },
    { id: "simplified", label: "Simplified" },
    ...(concept.category === "comparison"
      ? [{ id: "comparison", label: "Compare" }]
      : []),
    ...(concept.category === "advantage_disadvantage"
      ? [{ id: "advantage_disadvantage", label: "Pros & Cons" }]
      : []),
  ];

  const content = transform ?? {};
  const examPriority = concept.examPriority;
  const hasQuizAttempt = Boolean(concept.hasQuizAttempt);
  const isMastered = Boolean(concept.isMastered);
  const retentionCurve =
    hasQuizAttempt && !isMastered ? getRetentionCurve(concept) : null;
  const quizRetentionPct = Number.isFinite(Number(concept.retentionPct))
    ? Math.round(Number(concept.retentionPct))
    : null;
  const spacedSchedule = getSpacedReviewSchedule(concept.quizAttemptCount ?? 0);
  const recommendedMode = getRecommendedLearnMode(concept, learningStyle);
  const recommendedLabel =
    modes.find((item) => item.id === recommendedMode)?.label ?? recommendedMode;
  const activeLabel = modes.find((item) => item.id === mode)?.label ?? mode;

  return (
    <div>
      <div className="page-header">
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back to Sessions
          </button>
        </div>
        <h1>{concept.title}</h1>
        <div className="page-subtitle">{concept.category}</div>
      </div>

      <div className="two-col">
        <div className="card concept-hero">
          <div className="kicker">Concept detail</div>
          <h2 className="title">{concept.title}</h2>
          <div className="body">
            {concept.baseExplanation || "No base explanation returned yet."}
          </div>
          <div className="chips">
            <span className="chip">Complexity {concept.complexity}/5</span>
          </div>
          <div className="kw-row">
            {concept.keywords.map((keyword) => (
              <span className="kw" key={keyword}>
                {keyword}
              </span>
            ))}
          </div>
          {concept.examQuestion && (
            <div className="callout">
              <strong>Likely exam question:</strong> {concept.examQuestion}
            </div>
          )}
          {concept.comparisonPair && (
            <div className="callout">
              <strong>Comparison focus:</strong> {concept.comparisonPair}
            </div>
          )}
          {concept.whyForgettable && (
            <div className="callout">{concept.whyForgettable}</div>
          )}
          {isMastered ? (
            <div className="exam-summary">
              <div className="kicker">Mastered ✓</div>
              <div className="row-title">Spaced reviews complete</div>
              <div className="muted" style={{ marginTop: 6 }}>
                You can still quiz this concept anytime, but it no longer has an
                active review schedule.
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-amber" onClick={onStartQuiz}>
                  Test My Recall →
                </button>
              </div>
            </div>
          ) : hasQuizAttempt ? (
            <div className="exam-summary">
              <div className="kicker">Memory curve</div>
              <div className="row-title">{quizRetentionPct ?? 0}% retained</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {isMastered
                  ? "Concept mastered — no active spaced reviews."
                  : concept.nextReviewAt
                    ? `Next Review ${dueLabel(concept.nextReviewAt, nowMs)}`
                    : spacedSchedule.intervalDays
                      ? `Next Review ${reviewTimingLabelFromDays(spacedSchedule.intervalDays)}`
                      : "Due Today"}
              </div>
              {retentionCurve && (
                <div className="muted" style={{ marginTop: 8 }}>
                  This Concept is added for Spaced Review.
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-amber" onClick={onStartQuiz}>
                  Test My Recall →
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-amber" onClick={onStartQuiz}>
                Test My Recall →
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="kicker">Choose how to learn</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Auto-selected based on your learning profile: {recommendedLabel}.
            Active mode: {activeLabel}.
          </div>
          <div className="tabs" style={{ marginTop: 10 }}>
            {modes.map((item) => (
              <button
                key={item.id}
                className={`tab ${mode === item.id ? "active" : ""}`}
                onClick={() => onModeChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }} className="body">
            {loading ? (
              <Skeleton height={16} count={5} />
            ) : (
              content.transformed_explanation ||
              concept.baseExplanation ||
              "No transformed explanation yet."
            )}
          </div>
          {content.analogy_or_visual && (
            <div className="pre" style={{ marginTop: 12 }}>
              {content.analogy_or_visual}
            </div>
          )}
          {content.memory_hook && (
            <div className="callout">
              <strong>Memory hook:</strong> {content.memory_hook}
            </div>
          )}
          {content.example && (
            <div className="muted" style={{ marginTop: 10 }}>
              {content.example}
            </div>
          )}
          {examPriority && (
            <div className="muted" style={{ marginTop: 10 }}>
              Exam priority: {examPriority.label}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="empty" style={{ minHeight: 200 }}>
          <div className="kicker" style={{ fontSize: 14 }}>
            Explain It Back
          </div>
          <div className="empty-title" style={{ marginTop: 10 }}>
            Feynman Practice Mode
          </div>
          <div className="empty-sub" style={{ marginTop: 14 }}>
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}
