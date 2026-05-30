"use client";

import { useEffect, useMemo, useState } from "react";
import Skeleton from "react-loading-skeleton";

import {
  badgeForRetention,
  dueLabel,
  greeting,
  normalizeConcept,
  Ring,
  SessionRetentionRow,
} from "./dashboardShared";

function DashboardSkeleton() {
  return (
    <div>
      <div className="page-header">
        <Skeleton height={46} width="52%" />
        <div style={{ marginTop: 8 }}>
          <Skeleton height={18} width="68%" />
        </div>
      </div>

      <div className="grid-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="card" key={index}>
            <Skeleton height={12} width="42%" />
            <div style={{ marginTop: 16 }}>
              <Skeleton height={34} width="62%" />
            </div>
            <div style={{ marginTop: 10 }}>
              <Skeleton height={14} width="74%" />
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">Due for Review</div>
      <div className="stack">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="row-card" key={index} style={{ cursor: "default" }}>
            <Skeleton circle width={38} height={38} />
            <div className="row-main">
              <Skeleton height={16} width="48%" />
              <div style={{ marginTop: 8 }}>
                <Skeleton height={12} width="72%" />
              </div>
            </div>
            <Skeleton height={28} width={84} borderRadius={999} />
          </div>
        ))}
      </div>

      <div className="section-title">Retention Overview (Session-Based)</div>
      <div className="card">
        <div className="stack">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 2fr auto",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
              }}
            >
              <div>
                <Skeleton height={16} width="56%" />
                <div style={{ marginTop: 8 }}>
                  <Skeleton height={12} width="82%" />
                </div>
              </div>
              <Skeleton height={8} />
              <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                <Skeleton height={14} width={92} />
                <Skeleton height={12} width={116} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardView({
  dashboard,
  loading,
  onOpenConcept,
  onOpenUpload,
  onOpenSessions,
  nowMs,
}) {
  const pageSize = 5;
  const dueConcepts = dashboard?.dueConcepts ?? [];
  const sessionRetentionOverview = dashboard?.sessionRetentionOverview ?? [];
  const stats = dashboard?.stats ?? {};
  const profile = dashboard?.profile;
  const [duePage, setDuePage] = useState(1);

  useEffect(() => {
    setDuePage(1);
  }, [dueConcepts.length]);

  const totalDuePages = Math.max(1, Math.ceil(dueConcepts.length / pageSize));
  const safeDuePage = Math.min(duePage, totalDuePages);
  const pagedDueConcepts = useMemo(() => {
    const startIndex = (safeDuePage - 1) * pageSize;
    return dueConcepts.slice(startIndex, startIndex + pageSize);
  }, [dueConcepts, safeDuePage]);

  if (loading) return <DashboardSkeleton />;

  if (!dashboard) {
    return (
      <div className="empty card">
        <div className="empty-title">No dashboard data yet</div>
        <div className="empty-sub">
          Upload notes to generate concepts, session stats, and review queues
          from the backend.
        </div>
        <button className="btn btn-primary" onClick={onOpenUpload}>
          Upload Notes
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          {greeting()}, {profile?.display_name ?? "student"}.
        </h1>
        <div className="page-subtitle">
          {(stats.dueCount ?? 0) > 0
            ? `${stats.dueCount} concept${stats.dueCount === 1 ? "" : "s"} need review today.`
            : "You're all caught up for now."}{" "}
          {stats.totalSessionConcepts ?? 0} concepts across{" "}
          {stats.totalSessions ?? 0} session
          {(stats.totalSessions ?? 0) === 1 ? "" : "s"}.
        </div>
      </div>

      <div className="grid-4">
        <div className="card">
          <div className="stat-label">Streak</div>
          <div className="stat-value accent-amber">
            {stats.currentStreak ?? 0}
          </div>
          <div className="stat-sub">
            {(stats.currentStreak ?? 0) === 0
              ? "Quiz a concept to start"
              : "Quiz at least once daily to keep it"}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Concepts</div>
          <div className="stat-value">
            {stats.learnedConcepts ?? stats.totalConcepts ?? 0}
          </div>
          <div className="stat-sub">Concepts learned so far</div>
        </div>
        <div className="card">
          <div className="stat-label">Avg Retention</div>
          <div className="stat-value accent-teal">
            {stats.avgRetention !== null && stats.avgRetention !== undefined
              ? `${Math.round(Number(stats.avgRetention))}%`
              : "—"}
          </div>
          <div className="stat-sub">Avg memory across all concepts</div>
        </div>
        <div className="card">
          <div className="stat-label">Due Now</div>
          <div className="stat-value accent-rose">{stats.dueCount ?? 0}</div>
          <div className="stat-sub">Ready to review</div>
        </div>
      </div>

      <div className="section-title">Due for Review</div>
      <div className="stack">
        {dueConcepts.length === 0 ? (
          <div className="empty card">
            <div className="empty-title">Nothing due right now</div>
            <div className="empty-sub">
              Upload a new file or open your sessions to keep building your
              memory graph.
            </div>
            <button className="btn btn-secondary" onClick={onOpenSessions}>
              View Sessions
            </button>
          </div>
        ) : (
          pagedDueConcepts.map((raw, index) => {
            const concept = normalizeConcept(raw);
            const hasQuizAttempt = Boolean(concept.hasQuizAttempt);
            const isMastered = Boolean(concept.isMastered);
            const badge = isMastered
              ? { label: "✓", className: "badge-good" }
              : hasQuizAttempt
                ? badgeForRetention(concept.retentionPct)
                : { label: "New", className: "badge-today" };
            const rowKey =
              concept.id ??
              raw.id ??
              raw.concept_id ??
              `${concept.title}-${concept.category}-${index}`;
            return (
              <div
                key={rowKey}
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
                  label={
                    isMastered
                      ? "✓"
                      : hasQuizAttempt
                        ? `${Math.round(concept.retentionPct)}%`
                        : "New"
                  }
                  icon={isMastered ? "tick" : null}
                />
                <div className="row-main">
                  <div className="row-title">{concept.title}</div>
                  <div className="row-meta">
                    {concept.category} ·{" "}
                    {concept.subject ?? dueLabel(concept.nextReviewAt, nowMs)}
                  </div>
                  {concept.review_in_future === false &&
                    concept.due_by_exam_priority && (
                      <div className="row-meta" style={{ marginTop: 4 }}>
                        Exam-priority review · based on retention and exam
                        signal
                      </div>
                    )}
                  <div className="row-meta" style={{ marginTop: 4 }}>
                    {isMastered ? (
                      <>Mastered ✓ · Spaced reviews complete</>
                    ) : hasQuizAttempt ? (
                      <>
                        {concept.isDueReview
                          ? "Due Today"
                          : dueLabel(concept.nextReviewAt, nowMs)}
                      </>
                    ) : (
                      "New concept · Quiz once to estimate retention"
                    )}
                  </div>
                </div>
                <span className={`badge ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
            );
          })
        )}
      </div>

      {dueConcepts.length > pageSize && (
        <div
          className="card"
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="muted">
            Showing{" "}
            {Math.min((safeDuePage - 1) * pageSize + 1, dueConcepts.length)}-
            {Math.min(safeDuePage * pageSize, dueConcepts.length)} of{" "}
            {dueConcepts.length}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {safeDuePage > 1 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setDuePage((current) => Math.max(1, current - 1))
                }
              >
                Prev
              </button>
            )}
            {safeDuePage < totalDuePages && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setDuePage((current) => Math.min(totalDuePages, current + 1))
                }
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      <div className="section-title">Retention Overview (Session-Based)</div>
      <div className="card">
        {sessionRetentionOverview.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No sessions yet</div>
            <div className="empty-sub">
              Upload your first set of notes and OneShot will track session
              retention and quiz coverage from here.
            </div>
            <button className="btn btn-primary" onClick={onOpenUpload}>
              Upload Notes
            </button>
          </div>
        ) : !dashboard?.hasAnyQuizzes ? (
          <>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(196,125,14,0.2)",
                marginBottom: 16,
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ display: "block", marginBottom: 4 }}>
                Session retention uses the memory model, quiz coverage starts at
                zero.
              </strong>
              Bars show retention only. Quiz attempted shows how much of each
              session has been tested.
            </div>
            <div className="stack">
              {sessionRetentionOverview.map((item) => (
                <SessionRetentionRow
                  key={item.id}
                  item={item}
                  onOpenSessions={onOpenSessions}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="stack">
            {sessionRetentionOverview.map((item) => (
              <SessionRetentionRow
                key={item.id}
                item={item}
                onOpenSessions={onOpenSessions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
