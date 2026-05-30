"use client";

import { useEffect, useRef, useState } from "react";
import { FaCheck } from "react-icons/fa";
import { FaCircleCheck } from "react-icons/fa6";
import dynamic from "next/dynamic";
import Skeleton from "react-loading-skeleton";
import { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useClerk } from "@clerk/nextjs";

import {
  estimateUploadSeconds,
  estimateUploadSecondsFromChunkCount,
  evaluateQuestion,
  formatCountdown,
  normalizeConcept,
  qualityForScore,
} from "./dashboardShared";
import {
  getRetentionCurve,
  getRecommendedLearnMode,
  getSpacedReviewSchedule,
} from "@/lib/memorySignals";

const NAV_ITEMS = [
  { id: "dashboard", icon: "◈", label: "Dashboard" },
  { id: "upload", icon: "↑", label: "Upload Notes" },
  { id: "sessions", icon: "≡", label: "My Sessions" },
  { id: "learn", icon: "◎", label: "Learn", requiresConcept: true },
  { id: "quiz", icon: "⬡", label: "Quiz", requiresConcept: true },
];
const DEFAULT_PREMIUM_MONTHLY_PRICE = "₹149/month";
const PAYMENT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_PREMIUM_CHECKOUT_URL ?? "/pricing?plan=premium";

const DashboardViewLazy = dynamic(() => import("./DashboardView"), {
  loading: () => <DashboardSkeleton />,
});

const UploadViewLazy = dynamic(() => import("./UploadView"), {
  loading: () => <div className="card">Loading upload view...</div>,
});

const SessionsViewLazy = dynamic(() => import("./SessionsView"), {
  loading: () => <SessionsSkeleton />,
});

const LearnViewLazy = dynamic(() => import("./LearnView"), {
  loading: () => <LearnSkeleton />,
});

const QuizViewLazy = dynamic(() => import("./QuizView"), {
  loading: () => <QuizSkeleton />,
});

function fetchJson(url, options = {}) {
  return fetch(url, { cache: "no-store", ...options }).then(
    async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const err = new Error(data?.error ?? "Request failed");
        err.status = response.status;
        err.body = data;
        throw err;
      }

      return data;
    },
  );
}

let browserPdfWorkerConfigured = false;

async function extractTextFromSelectedFile(file) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".txt")) {
    return file.text();
  }

  if (fileName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");

    if (!browserPdfWorkerConfigured) {
      PDFParse.setWorker(
        "https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf.worker.mjs",
      );
      browserPdfWorkerConfigured = true;
    }

    const parser = new PDFParse({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const result = await parser.getText();
    return result.text;
  }

  throw new Error(
    "DOCX is not supported yet. Please upload a PDF or TXT file.",
  );
}

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

function LearnSkeleton() {
  return (
    <div>
      <div className="page-header">
        <Skeleton height={22} width={144} />
        <div style={{ marginTop: 10 }}>
          <Skeleton height={42} width="44%" />
        </div>
        <div style={{ marginTop: 8 }}>
          <Skeleton height={18} width="70%" />
        </div>
      </div>

      <div className="two-col">
        <div className="card concept-hero">
          <Skeleton height={16} width={120} />
          <Skeleton height={30} width="58%" />
          <Skeleton height={16} count={4} />
          <div className="chips">
            <Skeleton height={32} width={96} borderRadius={999} />
            <Skeleton height={32} width={96} borderRadius={999} />
            <Skeleton height={32} width={112} borderRadius={999} />
          </div>
          <div className="kw-row">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} height={28} width={84} borderRadius={999} />
            ))}
          </div>
          <Skeleton height={62} />
          <Skeleton height={62} />
        </div>

        <div className="card">
          <Skeleton height={14} width={132} />
          <div className="tabs" style={{ marginTop: 10 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} height={34} width={88} borderRadius={999} />
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <Skeleton height={16} count={5} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Skeleton height={120} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Skeleton height={56} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Skeleton height={16} width="68%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuizSkeleton() {
  return (
    <div>
      <div className="page-header">
        <Skeleton height={22} width={108} />
        <div style={{ marginTop: 10 }}>
          <Skeleton height={42} width="40%" />
        </div>
        <div style={{ marginTop: 8 }}>
          <Skeleton height={18} width="64%" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <Skeleton height={18} width="36%" />
        <div style={{ marginTop: 8 }}>
          <Skeleton height={14} width="58%" />
        </div>
      </div>

      <div className="quiz-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="q-card" key={index}>
            <Skeleton height={12} width="34%" />
            <div style={{ marginTop: 10 }}>
              <Skeleton height={18} width="86%" />
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

function ProfileSkeleton() {
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <Skeleton circle width={72} height={72} />
          <div style={{ flex: 1 }}>
            <Skeleton height={26} width="38%" />
            <div style={{ marginTop: 10 }}>
              <Skeleton height={14} width="64%" />
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <Skeleton height={14} width={122} />
              <Skeleton height={14} width={88} />
              <Skeleton height={14} width={76} />
            </div>
          </div>
        </div>
      </div>

      <Skeleton height={12} width={110} />
      <div className="grid-4" style={{ marginTop: 12, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="card" key={index}>
            <Skeleton height={12} width={84} />
            <div style={{ marginTop: 10 }}>
              <Skeleton height={30} width="58%" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Skeleton height={12} width="72%" />
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <Skeleton height={12} width={120} />
        <div
          style={{ marginTop: 14, display: "flex", gap: 4, flexWrap: "wrap" }}
        >
          {Array.from({ length: 30 }).map((_, index) => (
            <Skeleton key={index} width={22} height={22} borderRadius={5} />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <Skeleton height={12} width={150} />
        <div className="stack" style={{ marginTop: 14 }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 60px",
                gap: 14,
                alignItems: "center",
              }}
            >
              <Skeleton height={14} width="90%" />
              <Skeleton height={8} />
              <Skeleton height={14} width={36} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <Skeleton height={12} width={160} />
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} height={112} borderRadius={14} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Ring({ pct = null, label = null, icon = null }) {
  const size = 38;
  const stroke = 3;
  const hasValue = Number.isFinite(Number(pct));
  const safePct = hasValue ? Math.max(0, Math.min(100, Number(pct) || 0)) : 0;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const color = !hasValue
    ? "#b8a890"
    : safePct >= 65
      ? "#2BA888"
      : safePct >= 40
        ? "#F0AA3A"
        : "#B84040";

  if (icon === "tick") {
    return (
      <div className="retention-ring-mastered">
        <MasteredCheckIcon size={18} />
      </div>
    );
  }

  return (
    <div className="retention-ring">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={hasValue ? circ * (1 - safePct / 100) : circ}
          strokeLinecap="round"
        />
      </svg>
      <span className="retention-ring-pct" style={{ color }}>
        {icon === "tick" ? (
          <FaCheck aria-hidden="true" size={12} />
        ) : (
          (label ?? (hasValue ? `${Math.round(safePct)}%` : "New"))
        )}
      </span>
    </div>
  );
}

function MasteredCheckIcon({ size = 16, className = "" }) {
  return (
    <span
      className={`mastered-check-badge ${className}`.trim()}
      aria-hidden="true"
    >
      <FaCircleCheck size={size} />
    </span>
  );
}

function SessionRetentionRow({ item, onOpenSessions }) {
  const modelPctRaw = Number(item.model_retention_pct);
  const hasModelRetention = Number.isFinite(modelPctRaw);
  const modelPct = hasModelRetention
    ? Math.max(0, Math.min(100, Math.round(modelPctRaw)))
    : 0;
  const quizAttemptPct = Math.max(
    0,
    Math.min(100, Math.round(Number(item.quiz_attempt_pct ?? 0))),
  );
  const color = hasModelRetention
    ? modelPct >= 65
      ? "#2BA888"
      : modelPct >= 40
        ? "#F0AA3A"
        : "#B84040"
    : "#b8a890";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 2fr auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 0",
      }}
    >
      <div
        style={{ cursor: "pointer" }}
        onClick={onOpenSessions}
        title={item.title}
      >
        <div className="row-title" style={{ fontSize: 14 }}>
          {item.title}
        </div>
        <div className="row-meta">
          {item.attempted_concepts ?? 0}/{item.total_concepts ?? 0} concepts
          quizzed ·{" "}
          {(item.attempted_concepts ?? 0) > 0
            ? relativeTime(item.last_quiz_at ?? item.created_at)
            : "Not started"}
        </div>
      </div>

      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--ring-bg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${hasModelRetention ? modelPct : 8}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            opacity: hasModelRetention ? 1 : 0.45,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      <div
        style={{
          minWidth: 170,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontSize: 12,
        }}
      >
        {hasModelRetention ? (
          <span style={{ color, fontWeight: 700, fontSize: 14 }}>
            Model {modelPct}%
          </span>
        ) : (
          <span style={{ color: "var(--muted)", fontWeight: 700 }}>
            Model pending
          </span>
        )}
        <span className="muted">Quiz attempted {quizAttemptPct}%</span>
      </div>
    </div>
  );
}

function Sidebar({
  active,
  activeConcept,
  profile,
  onNavigate,
  onLogout,
  theme,
  onToggleTheme,
  onClose,
  className = "",
}) {
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requiresConcept || activeConcept,
  );

  return (
    <aside className={`sidebar ${className}`.trim()}>
      <div className="brand">
        <div className="brand-name">OneShot</div>
        <div className="brand-sub">Learning Engine</div>
      </div>

      {visibleItems.map((item) => (
        <div
          key={item.id}
          className={`nav-item ${active === item.id ? "active" : ""}`}
          onClick={() => {
            onNavigate(item.id);
            onClose?.();
          }}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </div>
      ))}

      <div className="sidebar-bottom">
        <button
          type="button"
          className={`user-pill ${active === "profile" ? "active" : ""}`}
          onClick={() => {
            onNavigate("profile");
            onClose?.();
          }}
          style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
        >
          <div className="avatar">{profile?.display_name?.[0] ?? "S"}</div>
          <div>
            <div className="user-name">
              {profile?.display_name ?? "Student"}
            </div>
            <div className="user-plan">
              {profile?.learning_style ?? "Connected"}
            </div>
          </div>
        </button>
        <button
          className="btn btn-secondary sidebar-theme"
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </button>
        <button className="btn btn-secondary sidebar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

function DashboardView({
  dashboard,
  loading,
  onOpenConcept,
  onOpenUpload,
  onOpenSessions,
  nowMs,
}) {
  const dueConcepts = dashboard?.dueConcepts ?? [];
  const sessionRetentionOverview = dashboard?.sessionRetentionOverview ?? [];
  const stats = dashboard?.stats ?? {};
  const profile = dashboard?.profile;

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

      {/* Browser push notifications replace in-app reminders */}

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
          dueConcepts.map((raw, index) => {
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

function UploadView({
  onUpload,
  uploading,
  result,
  error,
  uploadQuota,
  onLimitReached,
}) {
  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [drag, setDrag] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const countdownRef = useRef(null);
  const remainingToday = Number(uploadQuota?.remainingToday ?? -1);
  const isQuotaExhausted = remainingToday === 0;
  const isProcessing = uploading;

  const guardFreeLimit = () => {
    if (!isQuotaExhausted) return false;
    onLimitReached?.();
    return true;
  };

  useEffect(() => {
    if (!uploading) {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return undefined;
    }

    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    countdownRef.current = window.setInterval(() => {
      setCountdownSeconds((current) => {
        if (current === null) return current;
        if (current <= 1) return 1;
        return current - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [uploading]);

  const startUpload = () => {
    if (isProcessing) return;
    if (guardFreeLimit()) return;
    const subjectName = subject.trim();
    if (!file || !subjectName) return;
    setCountdownSeconds(estimateUploadSeconds(file));
    onUpload(file, subjectName, setCountdownSeconds);
  };

  const uploadButtonLabel = isProcessing
    ? `Processing • ${formatCountdown(countdownSeconds ?? estimateUploadSeconds(file))} left`
    : "Analyze & Extract Concepts";

  return (
    <div>
      <div className="page-header">
        <div className="upload-header-row">
          <div>
            <h1>Upload Study Notes</h1>
            <div className="page-subtitle">
              Upload a PDF or TXT file to automatically extract key concepts.
              Subject or chapter name is required.
            </div>
          </div>
          <div className="upload-quota-pill">
            Uploads remaining today: {uploadQuota?.remainingToday ?? "-"}
          </div>
        </div>
      </div>

      {result && (
        <div className="card notice">
          <div className="stat-label">Upload complete</div>
          <div className="row-title">{result.topic ?? "Session created"}</div>
          <div className="stat-sub">
            {result.concept_count ?? 0} concepts extracted · Cognitive load:{" "}
            {result.cognitive_load?.level ?? "unknown"}
          </div>
        </div>
      )}

      {error && (
        <div
          className="card notice"
          style={{ borderColor: "rgba(184,64,64,0.25)", color: "var(--rose)" }}
        >
          {error}
        </div>
      )}

      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          if (guardFreeLimit()) return;
          setFile(event.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => {
          if (guardFreeLimit()) return;
          document.getElementById("upload-input")?.click();
        }}
      >
        <input
          id="upload-input"
          type="file"
          accept=".pdf,.docx,.txt"
          hidden
          onChange={(event) => {
            if (guardFreeLimit()) {
              event.target.value = "";
              return;
            }
            setFile(event.target.files?.[0] ?? null);
          }}
        />
        <div className="row-title">
          {file ? file.name : "Drop your notes here"}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          {file
            ? "File ready to upload"
            : "Click to browse or drag and drop a file"}
        </div>
      </div>

      <div className="section-title">Subject or Chapter Name</div>
      <input
        className="text-input"
        type="text"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="e.g., Operating Systems - Process Synchronization"
        required
      />

      <div style={{ marginTop: 14 }}>
        <button
          className="btn btn-primary"
          onClick={startUpload}
          disabled={!file || !subject.trim() || isProcessing}
        >
          {uploadButtonLabel}
        </button>
      </div>
    </div>
  );
}

function SessionsView({
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

function LearnView({
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
  if (!concept)
    return (
      <div className="card">
        Pick a concept from Dashboard or Sessions to start learning.
      </div>
    );

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
  const examPriority =
    concept.examPriority ?? examPriorityForProbability(concept.examProbability);
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
                  : spacedSchedule.intervalDays
                    ? `Next Review ${reviewTimingLabelFromDays(spacedSchedule.intervalDays)}`
                    : "Due Today"}
              </div>
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

function QuizView({
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
  if (!concept)
    return <div className="card">Pick a concept first to generate a quiz.</div>;

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

      {showReviewQuestion && !concept.isDueReview && (
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
            <div
              style={{
                border: "1px solid rgba(15,122,99,0.2)",
                borderRadius: 12,
                background: "var(--surface-strong)",
                padding: "10px 12px",
              }}
            >
              <div className="stat-label">Quiz Accuracy</div>
              <div className="row-title">{Math.round(result.score ?? 0)}%</div>
            </div>
            <div
              style={{
                border: "1px solid rgba(15,122,99,0.2)",
                borderRadius: 12,
                background: "var(--surface-strong)",
                padding: "10px 12px",
              }}
            >
              <div className="stat-label">Estimated Retention</div>
              <div className="row-title">
                {Number.isFinite(Number(result.retentionPct))
                  ? `${Math.round(Number(result.retentionPct))}%`
                  : "Pending"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary"
            onClick={onSubmit}
            disabled={submitting || !quiz}
          >
            {submitting ? "Saving..." : "Submit Quiz"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileView({ onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [selStyle, setSelStyle] = useState(null);
  const [pushSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return "serviceWorker" in navigator && "PushManager" in window;
  });
  const [pushPermission, setPushPermission] = useState(() => {
    if (typeof window === "undefined") return "default";
    return "Notification" in window ? Notification.permission : "default";
  });
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchJson("/api/profile")
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setNameInput(response.profile?.display_name ?? "");
        setSelStyle(response.profile?.learning_style ?? "balanced");
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    if (typeof window !== "undefined") {
      const supportsPush = pushSupported;
      if (supportsPush) {
        navigator.serviceWorker
          .register("/sw.js")
          .then(() => navigator.serviceWorker.ready)
          .then(async (registration) => {
            const subscription =
              await registration.pushManager.getSubscription();
            if (!cancelled) setPushSubscribed(Boolean(subscription));
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

  async function saveName() {
    if (!nameInput.trim()) return;

    setSaving(true);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: nameInput.trim() }),
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);

    if (response.ok) {
      setSaveMsg("Saved!");
      setEditingName(false);
      setData((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                display_name: json.updated.display_name,
              },
            }
          : current,
      );
      onUpdated?.();
      setTimeout(() => setSaveMsg(""), 2000);
    } else {
      setSaveMsg(json.error ?? "Failed to save.");
    }
  }

  async function saveStyle(style) {
    setSelStyle(style);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learning_style: style }),
    });
    setData((current) =>
      current
        ? {
            ...current,
            profile: { ...current.profile, learning_style: style },
          }
        : current,
    );
    onUpdated?.();
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
      outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
  }

  async function togglePushNotifications() {
    setPushLoading(true);

    try {
      await navigator.serviceWorker.register("/sw.js");
      const serviceWorkerRegistration = await navigator.serviceWorker.ready;

      if (pushSubscribed) {
        const currentSubscription =
          await serviceWorkerRegistration.pushManager.getSubscription();

        if (currentSubscription) {
          await currentSubscription.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: currentSubscription.endpoint }),
          });
        }

        setPushSubscribed(false);
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") return;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing.");
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey.trim());
      if (applicationServerKey.length !== 65) {
        throw new Error("VAPID public key is invalid.");
      }

      const subscription =
        await serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

      const p256dh = subscription.getKey("p256dh");
      const auth = subscription.getKey("auth");

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: p256dh
                ? btoa(String.fromCharCode(...new Uint8Array(p256dh)))
                : null,
              auth: auth
                ? btoa(String.fromCharCode(...new Uint8Array(auth)))
                : null,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error ?? "Failed to subscribe.");
      }

      setPushSubscribed(true);
    } catch (error) {
      console.error("[push] toggle error:", error);
    } finally {
      setPushLoading(false);
    }
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
        Could not load profile.
      </div>
    );
  }

  const { profile, memory, stats, activityData, subjectBreakdown, badges } =
    data;

  const initials = (profile.display_name ?? "S")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = profile.member_since
    ? new Date(profile.member_since).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      })
    : null;

  const maxActivity = Math.max(1, ...activityData.map((item) => item.count));

  const styleOptions = [
    { id: "analogy", icon: "◉", label: "Analogy", desc: "Real-world mappings" },
    { id: "visual", icon: "⬡", label: "Visual", desc: "Diagrams & flows" },
    { id: "story", icon: "◈", label: "Story", desc: "Narrative learning" },
    {
      id: "simplified",
      icon: "≡",
      label: "Simplified",
      desc: "Step-by-step basics",
    },
    { id: "balanced", icon: "✦", label: "Balanced", desc: "Let AI decide" },
  ];

  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: 20,
          display: "flex",
          alignItems: "flex-start",
          gap: 20,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            flexShrink: 0,
            background: "var(--amber-soft)",
            border: "2px solid var(--amber)",
            display: "grid",
            placeItems: "center",
            fontFamily: "Lora, serif",
            fontSize: 26,
            fontWeight: 600,
            color: "var(--amber)",
          }}
        >
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && saveName()}
                autoFocus
                maxLength={50}
                style={{
                  fontFamily: "Lora, serif",
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  border: "1.5px solid var(--amber)",
                  borderRadius: 10,
                  padding: "4px 10px",
                  background: "var(--amber-soft)",
                  color: "var(--text)",
                  outline: "none",
                  width: "100%",
                  maxWidth: 280,
                }}
              />
              <button
                className="btn btn-primary"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={saveName}
                disabled={saving}
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "6px 14px", fontSize: 13 }}
                onClick={() => {
                  setEditingName(false);
                  setNameInput(profile.display_name);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontFamily: "Lora, serif",
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                }}
              >
                {profile.display_name}
              </h1>
              <button
                onClick={() => setEditingName(true)}
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  background: "transparent",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "3px 10px",
                  cursor: "pointer",
                }}
              >
                Edit name
              </button>
              {saveMsg && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--teal)",
                    fontWeight: 500,
                  }}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              🔥 {profile.current_streak} day streak
              {profile.longest_streak > profile.current_streak &&
                ` · best: ${profile.longest_streak}`}
            </span>
            {memberSince && (
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Joined {memberSince}
              </span>
            )}
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {stats.totalSessions} session
              {stats.totalSessions !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="section-title">Memory Health</div>
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          {
            label: "Mastered",
            value: memory.mastered,
            color: "var(--teal)",
            desc: "≥90% retention",
          },
          {
            label: "Learned",
            value: memory.learning,
            color: "var(--amber)",
            desc: "45–89%",
          },
          {
            label: "At Risk",
            value: memory.atRisk,
            color: "var(--rose)",
            desc: "<45%",
          },
          {
            label: "Not Attempted",
            value: memory.notAttempted,
            color: "var(--muted)",
            desc: "Quiz to start",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="card"
            style={{ textAlign: "center" }}
          >
            <div className="stat-label">{item.label}</div>
            <div
              className="stat-value"
              style={{ color: item.color, fontSize: 34 }}
            >
              {item.value}
            </div>
            <div className="stat-sub">{item.desc}</div>
          </div>
        ))}
      </div>

      {memory.total > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div
            style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}
          >
            {memory.total} total concepts · {memory.mastered} mastered (
            {Math.round((memory.mastered / memory.total) * 100)}%)
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 99,
              background: "var(--line)",
              display: "flex",
              overflow: "hidden",
              gap: 2,
            }}
          >
            {memory.mastered > 0 && (
              <div
                style={{
                  width: `${(memory.mastered / memory.total) * 100}%`,
                  background: "var(--teal)",
                  borderRadius: "99px 0 0 99px",
                  transition: "width .5s ease",
                }}
              />
            )}
            {memory.learning > 0 && (
              <div
                style={{
                  width: `${(memory.learning / memory.total) * 100}%`,
                  background: "var(--amber)",
                }}
              />
            )}
            {memory.atRisk > 0 && (
              <div
                style={{
                  width: `${(memory.atRisk / memory.total) * 100}%`,
                  background: "var(--rose)",
                }}
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 18,
              marginTop: 8,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <span style={{ color: "var(--teal)" }}>■ Mastered</span>
            <span style={{ color: "var(--amber)" }}>■ Learning</span>
            <span style={{ color: "var(--rose)" }}>■ At Risk</span>
          </div>
        </div>
      )}

      <div
        className="grid-4"
        style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 20 }}
      >
        <div className="card">
          <div className="stat-label">Total Quizzes</div>
          <div className="stat-value accent-amber">{stats.totalAttempts}</div>
          <div className="stat-sub">across all concepts</div>
        </div>
        <div className="card">
          <div className="stat-label">Avg Accuracy</div>
          <div className="stat-value accent-teal">
            {stats.avgAccuracy !== null ? `${stats.avgAccuracy}%` : "—"}
          </div>
          <div className="stat-sub">across all quiz attempts</div>
        </div>
        <div className="card">
          <div className="stat-label">Best Streak</div>
          <div className="stat-value" style={{ color: "var(--rose)" }}>
            {profile.longest_streak}
          </div>
          <div className="stat-sub">days in a row</div>
        </div>
      </div>

      <div className="section-title">Study Activity — Last 30 Days</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {activityData.map(({ date, count }) => {
            const intensity =
              count === 0 ? 0 : Math.min(1, count / maxActivity);
            const bg =
              count === 0
                ? "var(--line)"
                : `rgba(240, 170, 58, ${0.2 + intensity * 0.8})`;
            const label = new Date(date).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
            });
            return (
              <div
                key={date}
                title={`${label}: ${count} quiz${count !== 1 ? "zes" : ""}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: bg,
                  cursor: "default",
                  transition: "transform .1s",
                }}
                onMouseEnter={(event) =>
                  (event.currentTarget.style.transform = "scale(1.2)")
                }
                onMouseLeave={(event) =>
                  (event.currentTarget.style.transform = "scale(1)")
                }
              />
            );
          })}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--muted)",
            display: "flex",
            gap: 10,
          }}
        >
          <span>Less</span>
          {[0.15, 0.4, 0.65, 0.9].map((opacity) => (
            <div
              key={opacity}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: `rgba(240, 170, 58, ${opacity})`,
                alignSelf: "center",
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {subjectBreakdown.length > 0 && (
        <>
          <div className="section-title">Subject Breakdown</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 60px",
                gap: 14,
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted)",
                marginBottom: 10,
              }}
            >
              <div>Subject</div>
              <div>Concept Coverage</div>
              <div style={{ textAlign: "right" }}>Quiz Avg</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {subjectBreakdown.map((subject) => (
                <div
                  key={subject.subject}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 1fr 60px",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {subject.subject}
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 99,
                      background: "var(--line)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 99,
                        transition: "width .5s",
                        width: `${subject.total > 0 ? Math.round((subject.attempted / subject.total) * 100) : 0}%`,
                        background:
                          subject.avgScore >= 70
                            ? "var(--teal)"
                            : subject.avgScore >= 45
                              ? "var(--amber)"
                              : "var(--rose)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      textAlign: "right",
                      fontWeight: 600,
                      color:
                        subject.avgScore === null
                          ? "var(--muted)"
                          : subject.avgScore >= 70
                            ? "var(--teal)"
                            : subject.avgScore >= 45
                              ? "var(--amber)"
                              : "var(--rose)",
                    }}
                  >
                    {subject.avgScore !== null
                      ? `Avg ${subject.avgScore}%`
                      : "No quiz"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {pushSupported && (
        <>
          <div className="section-title">Study Reminders</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                  Browser Notifications
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.65,
                    marginBottom: 10,
                  }}
                >
                  {pushSubscribed
                    ? "You'll receive a morning review digest, streak alerts, and upload confirmations in your browser."
                    : "Turn on browser notifications to get the morning digest, streak alerts, and upload confirmations."}
                </div>

                {pushPermission === "denied" ? (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "var(--rose-soft)",
                      color: "var(--rose)",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    Notifications are blocked in your browser. Open site
                    settings and allow notifications, then come back here.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 12,
                      color: "var(--muted)",
                    }}
                  >
                    <span>📚 Morning digest at 8 AM</span>
                    <span>·</span>
                    <span>🔥 Streak alert at 8 PM if you did not quiz</span>
                  </div>
                )}
              </div>

              {pushPermission !== "denied" && (
                <button
                  onClick={togglePushNotifications}
                  disabled={pushLoading}
                  style={{
                    flexShrink: 0,
                    padding: "10px 20px",
                    borderRadius: 12,
                    border: pushSubscribed
                      ? "1.5px solid var(--rose)"
                      : "1.5px solid var(--amber)",
                    background: pushSubscribed
                      ? "var(--rose-soft)"
                      : "var(--amber-soft)",
                    color: pushSubscribed ? "var(--rose)" : "var(--amber)",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: pushLoading ? "wait" : "pointer",
                    opacity: pushLoading ? 0.6 : 1,
                    transition: "all .15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pushLoading ? "…" : pushSubscribed ? "Turn off" : "Turn on"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="section-title">Preferred Learning Style</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          This sets the default transform mode shown first when you study a
          concept. Choose &quot;Balanced&quot; to let the app learn your
          preference automatically.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {styleOptions.map((style) => (
            <button
              key={style.id}
              onClick={() => saveStyle(style.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "12px 18px",
                borderRadius: 14,
                cursor: "pointer",
                border:
                  selStyle === style.id
                    ? "2px solid var(--amber)"
                    : "1.5px solid var(--line)",
                background:
                  selStyle === style.id ? "var(--amber-soft)" : "transparent",
                color: selStyle === style.id ? "var(--amber)" : "var(--muted)",
                transition: "all .15s",
                fontFamily: "DM Sans, sans-serif",
              }}
            >
              <span style={{ fontSize: 18 }}>{style.icon}</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: selStyle === style.id ? 600 : 400,
                }}
              >
                {style.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {style.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">Achievements</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {badges.map((badge) => (
            <div
              key={badge.id}
              style={{
                padding: "14px 12px",
                borderRadius: 14,
                textAlign: "center",
                border: badge.earned
                  ? "1.5px solid var(--amber)"
                  : "1.5px solid var(--line)",
                background: badge.earned ? "var(--amber-soft)" : "transparent",
                opacity: badge.earned ? 1 : 0.45,
                transition: "all .15s",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{badge.icon}</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: badge.earned ? "var(--amber)" : "var(--text)",
                  marginBottom: 3,
                }}
              >
                {badge.label}
              </div>
              <div
                style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}
              >
                {badge.desc}
              </div>
              {badge.earned && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--teal)",
                    marginTop: 6,
                    fontWeight: 500,
                  }}
                >
                  ✓ Earned
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { signOut } = useClerk();
  const [screen, setScreen] = useState("dashboard");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "dark";

    try {
      return window.localStorage.getItem("oneshot-theme") ?? "dark";
    } catch {
      return "dark";
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionConcepts, setSessionConcepts] = useState([]);
  const [activeConcept, setActiveConcept] = useState(null);
  const [learnMode, setLearnMode] = useState("simplified");
  const [transformCache, setTransformCache] = useState({});
  const [quiz, setQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [reviewFuture, setReviewFuture] = useState(null);
  const [showReviewQuestion, setShowReviewQuestion] = useState(true);
  const [quizResult, setQuizResult] = useState(null);
  const [quizStartedAt, setQuizStartedAt] = useState(null);
  const [masteryMoment, setMasteryMoment] = useState(null);
  const [premiumPopup, setPremiumPopup] = useState(null);
  const [premiumMonthlyPrice, setPremiumMonthlyPrice] = useState(
    DEFAULT_PREMIUM_MONTHLY_PRICE,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const freeDailyUploadLimit = Number(dashboard?.uploadQuota?.dailyLimit ?? 2);
  const dailyUploadLimitMessage = Number.isFinite(freeDailyUploadLimit)
    ? `You've used your ${freeDailyUploadLimit} free uploads for today. Upgrade to Premium for unlimited uploads.`
    : "You've reached your free upload limit for today. Upgrade to Premium for unlimited uploads.";

  const openUploadLimitPopup = () => {
    setPremiumPopup({
      title: "Daily upload limit reached",
      message: dailyUploadLimitMessage,
      price: premiumMonthlyPrice,
    });
  };
  const transformRequestsRef = useRef(new Map());
  const [loading, setLoading] = useState({
    overview: true,
    sessions: true,
    concepts: false,
    transform: false,
    quiz: false,
    upload: false,
    submit: false,
  });
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshData = () => setRefreshTick((tick) => tick + 1);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem("oneshot-theme", theme);
    } catch {
      // Ignore storage failures and keep the in-memory theme active.
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    fetchJson("/api/pricing")
      .then((response) => {
        if (cancelled) return;
        if (typeof response?.price === "string" && response.price.trim()) {
          setPremiumMonthlyPrice(response.price.trim());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPremiumMonthlyPrice(DEFAULT_PREMIUM_MONTHLY_PRICE);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!premiumPopup) return;
    setPremiumPopup((current) =>
      current ? { ...current, price: premiumMonthlyPrice } : current,
    );
  }, [premiumMonthlyPrice]);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  const loadTransformForMode = async (concept, style) => {
    if (!concept) return null;

    const cacheKey = `${concept.id}:${style}`;
    if (transformCache[cacheKey]) return transformCache[cacheKey];

    const existingRequest = transformRequestsRef.current.get(cacheKey);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      const data = await fetchJson("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId: concept.id,
          style,
        }),
      });

      const transform = data.transform ?? data;
      setTransformCache((current) =>
        current[cacheKey] ? current : { ...current, [cacheKey]: transform },
      );

      return transform;
    })().finally(() => {
      transformRequestsRef.current.delete(cacheKey);
    });

    transformRequestsRef.current.set(cacheKey, request);
    return request;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setLoading((current) => ({ ...current, overview: true, sessions: true }));
      setNotice("");

      try {
        await fetchJson("/api/profile");

        const [dashboardData, sessionsData] = await Promise.all([
          fetchJson("/api/dashboard"),
          fetchJson("/api/sessions"),
        ]);
        if (cancelled) return;
        setDashboard(dashboardData);
        setSessions(sessionsData.sessions ?? []);
        if (!activeConcept && dashboardData?.dueConcepts?.length > 0) {
          setActiveConcept(normalizeConcept(dashboardData.dueConcepts[0]));
        }
      } catch (error) {
        if (!cancelled) setNotice(error.message);
      } finally {
        if (!cancelled)
          setLoading((current) => ({
            ...current,
            overview: false,
            sessions: false,
          }));
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    if (screen !== "learn" || !activeConcept) return;

    let cancelled = false;

    async function loadTransform() {
      setLoading((current) => ({ ...current, transform: true }));
      try {
        await loadTransformForMode(activeConcept, learnMode);
      } catch (error) {
        if (!cancelled) setNotice(error.message);
      } finally {
        if (!cancelled)
          setLoading((current) => ({ ...current, transform: false }));
      }
    }

    loadTransform();

    return () => {
      cancelled = true;
    };
  }, [screen, activeConcept, learnMode, transformCache]);

  useEffect(() => {
    if (screen !== "quiz" || !activeConcept) return;

    let cancelled = false;

    async function loadQuiz() {
      setLoading((current) => ({ ...current, quiz: true }));
      setQuiz(null);
      setQuizAnswers({});
      setReviewFuture(null);
      setQuizResult(null);
      // Decide whether to show the future-review prompt:
      // - hide permanently if the latest attempt had review_in_future === true (user opted-in)
      // - otherwise show again on each non-mastered quiz attempt, including due reviews
      // - hide for mastered concepts as well
      const isMastered = Boolean(activeConcept?.isMastered);
      const prevChoice =
        activeConcept?.review_in_future ??
        activeConcept?.reviewInFuture ??
        null;
      const latestReviewChoice =
        activeConcept?.latestReviewInFuture ??
        activeConcept?.latest_review_in_future ??
        null;
      if (isMastered || prevChoice === true || latestReviewChoice === true) {
        setShowReviewQuestion(false);
      } else {
        setShowReviewQuestion(true);
      }

      try {
        const data = await fetchJson(
          `/api/quiz/generate?conceptId=${activeConcept.id}`,
        );
        if (!cancelled) {
          setQuiz(data.quiz);
          setQuizStartedAt(Date.now());
        }
      } catch (error) {
        if (!cancelled) setNotice(error.message);
      } finally {
        if (!cancelled) setLoading((current) => ({ ...current, quiz: false }));
      }
    }

    loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [screen, activeConcept]);

  useEffect(() => {
    if (activeConcept) return;
    if (screen === "learn" || screen === "quiz") {
      setScreen("sessions");
    }
  }, [activeConcept, screen]);

  useEffect(() => {
    if (screen !== "sessions" || !selectedSession) return;

    let cancelled = false;

    async function loadSessionConcepts() {
      setLoading((current) => ({ ...current, concepts: true }));
      try {
        const data = await fetchJson(
          `/api/sessions/${selectedSession.id}/concepts`,
        );
        if (!cancelled) setSessionConcepts(data.concepts ?? []);
      } catch (error) {
        if (!cancelled) setNotice(error.message);
      } finally {
        if (!cancelled)
          setLoading((current) => ({ ...current, concepts: false }));
      }
    }

    loadSessionConcepts();

    return () => {
      cancelled = true;
    };
  }, [screen, selectedSession, refreshTick]);

  useEffect(() => {
    if (!masteryMoment) return undefined;

    const timeout = window.setTimeout(() => {
      setMasteryMoment(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [masteryMoment]);

  const openConcept = (concept) => {
    const normalized = normalizeConcept(concept);
    setActiveConcept(normalized);
    setLearnMode(
      getRecommendedLearnMode(normalized, dashboard?.profile?.learning_style),
    );
    setQuiz(null);
    setQuizAnswers({});
    setReviewFuture(null);
    setQuizResult(null);
    setScreen("learn");
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSession = async (session) => {
    setSelectedSession(session);
    setScreen("sessions");
    setSidebarOpen(false);
    setLoading((current) => ({ ...current, concepts: true }));
    try {
      const data = await fetchJson(`/api/sessions/${session.id}/concepts`);
      setSessionConcepts(data.concepts ?? []);
    } catch (error) {
      const fallbackConcept =
        sessionConcepts[0] ?? dashboard?.dueConcepts?.[0] ?? null;
      const initialConcept = normalizeConcept(fallbackConcept);
      setActiveConcept(initialConcept);
      setLearnMode(
        getRecommendedLearnMode(
          initialConcept,
          dashboard?.profile?.learning_style,
        ),
      );
    } finally {
      setLoading((current) => ({ ...current, concepts: false }));
    }
  };

  const handleUpload = async (file, subjectName, setCountdownEstimate) => {
    if (!file || !subjectName) return;

    setLoading((current) => ({ ...current, upload: true }));
    setUploadError("");
    setUploadResult(null);

    try {
      const extractedText = await extractTextFromSelectedFile(file);
      const chunkCount = Math.max(1, Math.ceil(extractedText.length / 3500));
      setCountdownEstimate?.((current) =>
        Math.max(
          Number(current) || 0,
          estimateUploadSecondsFromChunkCount(chunkCount),
        ),
      );
      const data = await fetchJson("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractedText,
          fileName: file.name,
          subject: subjectName,
          subjectCode: "custom",
        }),
      });
      setUploadResult(data);
      refreshData();
      setScreen("sessions");
    } catch (error) {
      // If the server returned a structured error (e.g. DAILY_LIMIT_REACHED),
      // surface a specialised message and hint to upgrade.
      if (error?.body?.code === "DAILY_LIMIT_REACHED") {
        setUploadError("");
        setNotice("");
        setPremiumPopup({
          title: "Daily upload limit reached",
          message: error.body?.error ?? dailyUploadLimitMessage,
          price: premiumMonthlyPrice,
        });
      } else {
        setUploadError(error.message);
      }
    } finally {
      setLoading((current) => ({ ...current, upload: false }));
    }
  };

  const handleLogout = async () => {
    try {
      const keys = Object.keys(window.localStorage);
      for (const key of keys) {
        if (/token|clerk/i.test(key)) {
          window.localStorage.removeItem(key);
        }
      }
      await signOut({ redirectUrl: "/" });
    } catch {
      await signOut({ redirectUrl: "/" });
    }
  };

  const submitQuiz = async () => {
    if (!quiz || !activeConcept) return;
    // If the user didn't explicitly choose in this run, prefer the
    // previously-persisted choice on the concept (so we don't overwrite
    // an earlier Tick/X selection when the prompt is hidden).
    const persistedChoice =
      activeConcept?.review_in_future ?? activeConcept?.reviewInFuture ?? null;
    const reviewChoice =
      reviewFuture === null
        ? persistedChoice === null
          ? false
          : Boolean(persistedChoice)
        : Boolean(reviewFuture);

    const questions = quiz.questions ?? [];
    const correctCount = questions.reduce(
      (count, question) =>
        count + (evaluateQuestion(question, quizAnswers[question.id]) ? 1 : 0),
      0,
    );
    const score =
      questions.length > 0
        ? Math.round((correctCount / questions.length) * 100)
        : 0;
    const timeTakenMs = quizStartedAt ? Date.now() - quizStartedAt : 0;

    setLoading((current) => ({ ...current, submit: true }));

    try {
      const data = await fetchJson("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId: activeConcept.id,
          sessionId: activeConcept.session_id ?? selectedSession?.id ?? null,
          quizType: "mcq",
          transformStyle: learnMode,
          score,
          qualityRating: qualityForScore(score),
          timeTakenMs,
          wasCorrect: score >= 50,
          bloomLevel: quiz.bloom_level ?? "remember",
          reviewFuture: reviewChoice,
        }),
      });

      setQuizResult({ submitted: true, score, ...data });
      if (data.masteredMilestone) {
        setMasteryMoment(data.masteredMilestone);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading((current) => ({ ...current, submit: false }));
    }
  };

  const currentTransform = activeConcept
    ? transformCache[`${activeConcept.id}:${learnMode}`]
    : null;
  const allModesReady = activeConcept
    ? ["analogy", "visual", "story", "simplified"].every(
        (style) => transformCache[`${activeConcept.id}:${style}`],
      )
    : false;

  const backToLearnFromQuiz = () => {
    if (quizResult && activeConcept) {
      const mastered = Boolean(quizResult.masteredMilestone);
      const updatedRetention = Number(
        quizResult.estimatedRetentionPct ?? quizResult.retentionPct,
      );
      const updatedNextReviewAt =
        quizResult.nextReviewDate ??
        quizResult.schedule?.next_review_date ??
        quizResult.schedule?.nextReviewDate ??
        null;
      setActiveConcept((current) =>
        current
          ? {
              ...current,
              retentionPct: Number.isFinite(updatedRetention)
                ? updatedRetention
                : current.retentionPct,
              retention_pct: Number.isFinite(updatedRetention)
                ? updatedRetention
                : current.retention_pct,
              quizAttemptCount: Number(current.quizAttemptCount ?? 0) + 1,
              quiz_attempt_count: Number(current.quiz_attempt_count ?? 0) + 1,
              nextReviewAt: updatedNextReviewAt ?? current.nextReviewAt,
              next_review_at: updatedNextReviewAt ?? current.next_review_at,
              review_in_future:
                quizResult.reviewFuture ?? current.review_in_future,
              reviewInFuture: quizResult.reviewFuture ?? current.reviewInFuture,
              isMastered: mastered || current.isMastered,
              isDueReview: mastered ? false : current.isDueReview,
              is_due_review: mastered ? false : current.is_due_review,
            }
          : current,
      );

      setSessionConcepts((current) =>
        current.map((concept) =>
          String(concept?.id ?? "") === String(activeConcept.id ?? "")
            ? {
                ...concept,
                retentionPct: Number.isFinite(updatedRetention)
                  ? updatedRetention
                  : concept.retentionPct,
                retention_pct: Number.isFinite(updatedRetention)
                  ? updatedRetention
                  : concept.retention_pct,
                quizAttemptCount: Number(concept.quizAttemptCount ?? 0) + 1,
                quiz_attempt_count: Number(concept.quiz_attempt_count ?? 0) + 1,
                nextReviewAt: updatedNextReviewAt ?? concept.nextReviewAt,
                next_review_at: updatedNextReviewAt ?? concept.next_review_at,
                review_in_future:
                  quizResult.reviewFuture ?? concept.review_in_future,
                reviewInFuture:
                  quizResult.reviewFuture ?? concept.reviewInFuture,
                isMastered: mastered || concept.isMastered,
                is_mastered: mastered || concept.is_mastered,
              }
            : concept,
        ),
      );
    }
    refreshData();
    setScreen("learn");
  };

  const backToSessionsFromLearn = () => {
    refreshData();
    setScreen("sessions");
  };

  return (
    <>
      <SkeletonTheme
        baseColor={theme === "dark" ? "#1a1714" : "#e9e4d9"}
        highlightColor={theme === "dark" ? "#2b2723" : "#f6f1e6"}
      >
        {premiumPopup && (
          <div className="modal-overlay" onClick={() => setPremiumPopup(null)}>
            <div
              className="card premium-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="premium-crown" aria-hidden="true">
                👑
              </div>
              <div className="kicker">Premium</div>
              <h3 style={{ margin: "8px 0 8px", fontFamily: "Lora, serif" }}>
                {premiumPopup.title}
              </h3>
              <div className="muted" style={{ lineHeight: 1.7 }}>
                {premiumPopup.message}
              </div>
              <div style={{ marginTop: 10, fontWeight: 700 }}>
                Premium plan: {premiumPopup.price}
              </div>
              <div className="premium-actions">
                <button
                  className="btn btn-amber"
                  onClick={() =>
                    window.open(
                      PAYMENT_GATEWAY_URL,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  👑 Upgrade to Premium
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setPremiumPopup(null)}
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        )}
        {masteryMoment && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1200,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(6px)",
              display: "grid",
              placeItems: "center",
              padding: 20,
              animation: "fadeIn 0.25s ease",
            }}
            onClick={() => setMasteryMoment(null)}
          >
            <div
              className="card"
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "relative",
                maxWidth: 420,
                width: "100%",
                padding: "36px 28px",
                borderRadius: 24,
                textAlign: "center",
                background: "var(--panel-strong)",
                border: "1px solid rgba(34,197,94,0.22)",
                boxShadow: "0 30px 100px rgba(0,0,0,0.55)",
                animation: "masteryPop 0.45s cubic-bezier(.17,.89,.32,1.25)",
              }}
            >
              <div className="mastery-success-icon">
                <FaCircleCheck size={46} aria-hidden="true" />
              </div>
              <div
                style={{
                  marginTop: 24,
                  fontFamily: "Lora, serif",
                  fontSize: 34,
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                  color: "var(--text)",
                }}
              >
                {masteryMoment.title}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 18,
                  fontWeight: 500,
                  color: "var(--teal)",
                }}
              >
                Mastered
              </div>
              <div className="muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
                3 successful reviews reached. Screenshot this and share it.
              </div>
              <button
                className="btn btn-amber"
                style={{
                  marginTop: 26,
                  width: "100%",
                  justifyContent: "center",
                }}
                onClick={() => setMasteryMoment(null)}
              >
                Nice
              </button>
            </div>
          </div>
        )}
        <div className="shell">
          <Sidebar
            className={sidebarOpen ? "open" : ""}
            active={screen}
            activeConcept={activeConcept}
            profile={dashboard?.profile}
            onNavigate={setScreen}
            onLogout={handleLogout}
            theme={theme}
            onToggleTheme={toggleTheme}
            onClose={closeSidebar}
          />
          {sidebarOpen && (
            <button
              className="sidebar-overlay"
              aria-label="Close sidebar"
              onClick={closeSidebar}
            />
          )}
          <main className="main">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={openSidebar}
              aria-label="Open sidebar menu"
            >
              ☰
            </button>
            {notice && <div className="card notice">{notice}</div>}
            {screen === "profile" && (
              <div className="page-header">
                <h1>My Profile</h1>
                <div className="page-subtitle">
                  Your memory health, learning patterns, and progress over time.
                </div>
              </div>
            )}
            {screen === "dashboard" && (
              <DashboardViewLazy
                dashboard={dashboard}
                loading={loading.overview}
                onOpenConcept={openConcept}
                onOpenUpload={() => setScreen("upload")}
                onOpenSessions={() => setScreen("sessions")}
                nowMs={nowMs}
              />
            )}
            {screen === "profile" && <ProfileView onUpdated={refreshData} />}
            {screen === "upload" && (
              <UploadViewLazy
                onUpload={handleUpload}
                uploading={loading.upload}
                result={uploadResult}
                error={uploadError}
                uploadQuota={dashboard?.uploadQuota}
                onLimitReached={openUploadLimitPopup}
              />
            )}
            {screen === "sessions" && (
              <SessionsViewLazy
                sessions={sessions}
                selectedSession={selectedSession}
                concepts={sessionConcepts}
                loadingSessions={loading.sessions}
                loadingConcepts={loading.concepts}
                onSelectSession={openSession}
                onOpenConcept={openConcept}
              />
            )}
            {screen === "learn" && (
              <LearnViewLazy
                concept={activeConcept}
                mode={learnMode}
                onModeChange={setLearnMode}
                learningStyle={dashboard?.profile?.learning_style}
                transform={currentTransform}
                loading={loading.transform}
                onBack={backToSessionsFromLearn}
                onStartQuiz={() => setScreen("quiz")}
                nowMs={nowMs}
              />
            )}
            {screen === "quiz" && (
              <QuizViewLazy
                concept={activeConcept}
                quiz={quiz}
                answers={quizAnswers}
                reviewFuture={reviewFuture}
                showReviewQuestion={showReviewQuestion}
                onReviewFutureChange={(val) => {
                  setReviewFuture(val);
                  // hide the question immediately after selection for this quiz
                  setShowReviewQuestion(false);
                }}
                onAnswer={(id, value) =>
                  setQuizAnswers((current) => ({ ...current, [id]: value }))
                }
                onBack={backToLearnFromQuiz}
                onSubmit={submitQuiz}
                submitting={loading.submit}
                result={quizResult}
                loading={loading.quiz}
              />
            )}
          </main>
        </div>
      </SkeletonTheme>
    </>
  );
}
