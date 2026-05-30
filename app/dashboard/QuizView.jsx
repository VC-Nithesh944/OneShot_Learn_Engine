"use client";

import Skeleton from "react-loading-skeleton";

import { evaluateQuestion } from "./dashboardShared";

function QuizSkeleton() {
  return (
    <div>
      <div className="quiz-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="q-card" key={index}>
            <Skeleton height={12} width="32%" />
            <div style={{ marginTop: 10 }}>
              <Skeleton height={18} width="84%" />
            </div>
            <div className="option-list">
              {Array.from({ length: 4 }).map((__, optionIndex) => (
                <Skeleton key={optionIndex} height={44} borderRadius={14} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuizView({
  concept,
  quiz,
  answers,
  reviewFuture,
  showReviewQuestion,
  onReviewFutureChange,
  onAnswer,
  onBack,
  onSubmit,
  submitting,
  result,
  loading,
}) {
  if (!concept) {
    return <div className="card">Pick a concept first to generate a quiz.</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ marginBottom: 10 }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back to Learn
          </button>
        </div>
        <h1>{concept.title} Quiz</h1>
        <div className="page-subtitle">
          Answer these 5 MCQs to get or boost your retention for this concept.
        </div>
      </div>

      {loading && <QuizSkeleton />}

      <div className="quiz-grid">
        {quiz?.questions?.map((question, index) => {
          const answer = answers[question.id];
          const submitted = result?.submitted;
          const correct = evaluateQuestion(question, answer);

          return (
            <div key={question.id} className="q-card">
              <div className="kicker">
                Question {index + 1} · {question.type.replace(/-/g, " ")}
              </div>
              <div className="q-title">{question.question}</div>

              {question.type === "mcq" && (
                <div className="option-list">
                  {question.options.map((option, optionIndex) => {
                    const selected = Number(answer) === optionIndex;
                    const isCorrect =
                      submitted &&
                      optionIndex === question.correct_option_index;
                    const isWrong = submitted && selected && !isCorrect;
                    return (
                      <div
                        key={option}
                        className={`option ${selected ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                        onClick={() => onAnswer(question.id, optionIndex)}
                      >
                        {option}
                      </div>
                    );
                  })}
                </div>
              )}

              {submitted && (
                <div
                  className="callout"
                  style={{
                    marginTop: 12,
                    background: correct
                      ? "var(--teal-soft)"
                      : "var(--rose-soft)",
                    borderLeftColor: correct ? "var(--teal)" : "var(--rose)",
                  }}
                >
                  {question.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showReviewQuestion && !concept.isMastered && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="kicker">Future Review</div>
          <div className="row-title" style={{ marginTop: 6 }}>
            Do you want to review this concept in future?
          </div>
          <div
            className="option-list"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          >
            <button
              type="button"
              className={`option ${reviewFuture === false ? "select" : ""}`}
              onClick={() => onReviewFutureChange(false)}
            >
              X
            </button>
            <button
              type="button"
              className={`option ${reviewFuture === true ? "select" : ""}`}
              onClick={() => onReviewFutureChange(true)}
            >
              ✓
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Tick keeps the concept in the normal spaced-review flow. X lets the
            app decide based on retention and exam priority.
          </div>
        </div>
      )}

      {result?.submitted ? (
        <div className="score-box">
          <div className="row-title">{result.message ?? "Quiz saved."}</div>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <div className="card" style={{ padding: 12, boxShadow: "none" }}>
              <div className="stat-label">Quiz Score</div>
              <div className="row-title">{result.score ?? 0}%</div>
            </div>
            <div className="card" style={{ padding: 12, boxShadow: "none" }}>
              <div className="stat-label">Your Retention</div>
              <div className="row-title">
                {Math.round(Number(result.estimatedRetentionPct ?? 0))}%
              </div>
            </div>
          </div>
          {result.masteredMilestone && (
            <div className="callout" style={{ marginTop: 12 }}>
              {result.masteredMilestone.title}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button
            className="btn btn-amber"
            onClick={onSubmit}
            disabled={submitting}
          >
            {submitting ? "Saving..." : "Submit Quiz"}
          </button>
        </div>
      )}
    </div>
  );
}
