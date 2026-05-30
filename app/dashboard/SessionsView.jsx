"use client";

import Skeleton from "react-loading-skeleton";

import {
  normalizeConcept,
  normalizeExamSummary,
  relativeTime,
  Ring,
} from "./dashboardShared";

function SessionsSkeleton() {
  return (
    <div>
      <div className="page-header">
        <Skeleton height={46} width="38%" />
        <div style={{ marginTop: 8 }}>
          <Skeleton height={18} width="62%" />
        </div>
      </div>

      <div className="section-title">Sessions</div>
      <div className="stack">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="row-card" key={index} style={{ cursor: "default" }}>
            <Skeleton circle width={34} height={34} />
            <div className="row-main">
              <Skeleton height={16} width="52%" />
              <div style={{ marginTop: 8 }}>
                <Skeleton height={12} width="68%" />
              </div>
            </div>
            <Skeleton height={16} width={16} />
          </div>
        ))}
      </div>

      <div className="section-title">Concepts in session</div>
      <div className="card">
        <div className="kicker">Exam summary</div>
        <Skeleton height={20} width="46%" />
        <div style={{ marginTop: 14 }} className="exam-summary-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="exam-summary-item" key={index}>
              <Skeleton height={16} width="58%" />
              <div style={{ marginTop: 8 }}>
                <Skeleton height={12} count={2} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="row-card" key={index} style={{ cursor: "default" }}>
            <Skeleton circle width={38} height={38} />
            <div className="row-main">
              <Skeleton height={16} width="46%" />
              <div style={{ marginTop: 8 }}>
                <Skeleton height={12} width="74%" />
              </div>
            </div>
            <Skeleton height={28} width={84} borderRadius={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SessionsView({
  sessions,
  selectedSession,
  concepts,
  loadingSessions,
  loadingConcepts,
  onSelectSession,
  onOpenConcept,
}) {
  const examSummary = normalizeExamSummary(
    selectedSession?.exam_summary ?? selectedSession?.examSummary,
  );

  return (
    <div>
      <div className="page-header">
        <h1>My Sessions</h1>
        <div className="page-subtitle">
          Your study sessions are ready to review!
        </div>
      </div>

      <div className="section-title">Sessions</div>
      <div className="stack">
        {loadingSessions ? (
          <SessionsSkeleton />
        ) : sessions.length === 0 ? (
          <div className="empty card">
            <div className="empty-title">No sessions yet</div>
            <div className="empty-sub">
              Upload notes to create your first processed session.
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="row-card"
              onClick={() => onSelectSession(session)}
            >
              <div className="avatar" style={{ flex: "0 0 auto" }}>
                📘
              </div>
              <div className="row-main">
                <div className="row-title">
                  {session.topic ?? session.filename ?? "Untitled session"}
                </div>
                <div className="row-meta">
                  {session.subject ?? session.subject_code ?? "Unknown"} ·{" "}
                  {session.concept_count ?? 0} concepts ·{" "}
                  {relativeTime(session.created_at)}
                </div>
              </div>
              <div className="muted">→</div>
            </div>
          ))
        )}
      </div>

      {selectedSession && (
        <>
          <div className="section-title">
            Concepts in {selectedSession.topic ?? selectedSession.filename}
          </div>
          {examSummary && (
            <div className="exam-summary">
              <div className="kicker">Exam summary</div>
              <div className="row-title">
                Most likely exam targets from this session
              </div>
              <div className="exam-summary-grid">
                {(examSummary.top_exam_concepts ?? [])
                  .slice(0, 5)
                  .map((item, index) => (
                    <div
                      className="exam-summary-item"
                      key={`${item.title ?? "exam-item"}-${index}`}
                    >
                      <strong>{item.title}</strong>
                      <div className="muted">{item.reason}</div>
                    </div>
                  ))}
                {(examSummary.common_exam_patterns ?? []).length > 0 && (
                  <div className="exam-summary-item">
                    <strong>Common exam patterns</strong>
                    <div className="muted">
                      {examSummary.common_exam_patterns.join(" • ")}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {loadingConcepts ? (
            <div className="stack">
              <Skeleton height={24} width="36%" />
              {selectedSession ? <Skeleton height={12} width="54%" /> : null}
              {selectedSession ? (
                <div className="card">
                  <Skeleton height={16} width="28%" />
                  <div style={{ marginTop: 12 }}>
                    <Skeleton height={18} width="42%" />
                  </div>
                  <div style={{ marginTop: 14 }} className="exam-summary-grid">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div className="exam-summary-item" key={index}>
                        <Skeleton height={16} width="58%" />
                        <div style={{ marginTop: 8 }}>
                          <Skeleton height={12} count={2} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="row-card"
                  key={index}
                  style={{ cursor: "default" }}
                >
                  <Skeleton circle width={38} height={38} />
                  <div className="row-main">
                    <Skeleton height={16} width="46%" />
                    <div style={{ marginTop: 8 }}>
                      <Skeleton height={12} width="70%" />
                    </div>
                  </div>
                  <Skeleton height={28} width={84} borderRadius={999} />
                </div>
              ))}
            </div>
          ) : (
            <div className="stack">
              {concepts.length === 0 ? (
                <div className="empty card">
                  <div className="empty-title">No concepts found</div>
                  <div className="empty-sub">
                    This session has no concept rows yet.
                  </div>
                </div>
              ) : (
                concepts.map((raw) => {
                  const concept = normalizeConcept(raw);
                  const hasQuizAttempt = Boolean(concept.hasQuizAttempt);
                  const isMastered = Boolean(concept.isMastered);
                  return (
                    <div
                      key={concept.id}
                      className="row-card"
                      onClick={() => onOpenConcept(concept)}
                    >
                      <Ring
                        pct={
                          isMastered
                            ? 100
                            : hasQuizAttempt
                              ? concept.retentionPct
                              : null
                        }
                        label={hasQuizAttempt ? null : "New"}
                        icon={isMastered ? "tick" : null}
                      />
                      <div className="row-main">
                        <div className="row-title">{concept.title}</div>
                        <div className="row-meta">
                          {concept.category} ·{" "}
                          {concept.keywords.slice(0, 3).join(", ")}
                        </div>
                        <div className="row-meta" style={{ marginTop: 4 }}>
                          {isMastered ? (
                            <>Mastered ✓ · Spaced reviews complete</>
                          ) : hasQuizAttempt ? (
                            <>
                              Retention {Math.round(concept.retentionPct)}%.
                              Quiz again to boost retention.
                            </>
                          ) : (
                            "New concept · Quiz once to estimate retention"
                          )}
                        </div>
                      </div>
                      <span
                        className={`badge ${isMastered ? "badge-good" : (concept.examPriority?.className ?? "badge-exam")}`}
                      >
                        {isMastered
                          ? "✓"
                          : (concept.examPriority?.label ?? "Exam")}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
