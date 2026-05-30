"use client";

import { FaCheck } from "react-icons/fa";
import { FaCircleCheck } from "react-icons/fa6";

export function estimateUploadSecondsFromChunkCount(chunkCount) {
  const safeChunks = Math.max(1, Number(chunkCount) || 1);
  return Math.max(18, Math.min(420, Math.round(18 + safeChunks * 9)));
}

export function estimateUploadSeconds(file) {
  if (!file?.size) return estimateUploadSecondsFromChunkCount(1);
  const sizeMb = file.size / (1024 * 1024);
  const approxChunks = Math.max(1, Math.ceil(file.size / 1024 / 18));
  return Math.max(
    estimateUploadSecondsFromChunkCount(approxChunks),
    Math.max(18, Math.min(260, Math.round(16 + sizeMb * 34))),
  );
}

export function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords.filter(Boolean);
  if (typeof keywords === "string") {
    return keywords
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeExamSummary(summary) {
  if (!summary) return null;
  if (typeof summary === "string") {
    try {
      return JSON.parse(summary);
    } catch {
      return null;
    }
  }
  return summary;
}

export function examPriorityForProbability(value) {
  const probability = Number(value ?? 3);
  if (probability >= 5) return { label: "Must know", className: "badge-exam" };
  if (probability >= 4) {
    return { label: "Very likely", className: "badge-exam" };
  }
  if (probability >= 3) return { label: "Probable", className: "badge-exam" };
  if (probability >= 2) return { label: "Possible", className: "badge-exam" };
  return { label: "Low yield", className: "badge-exam" };
}

export function normalizeConcept(concept) {
  if (!concept) return null;
  const conceptId =
    concept.id ?? concept.concept_id ?? concept.conceptId ?? null;
  const examProbability = Number(
    concept.exam_probability ?? concept.examProbability ?? 3,
  );
  return {
    ...concept,
    id: conceptId,
    concept_id: concept.concept_id ?? conceptId,
    session_id: concept.session_id ?? concept.sessionId ?? null,
    title: concept.title ?? "Untitled concept",
    category: concept.category ?? concept.subject ?? "Concept",
    complexity: Number(concept.complexity ?? 3),
    examProbability,
    examPriority: examPriorityForProbability(examProbability),
    hasQuizAttempt:
      concept.has_quiz_attempt === true ||
      concept.hasQuizAttempt === true ||
      concept.has_quiz_attempt === 1 ||
      concept.hasQuizAttempt === 1 ||
      String(
        concept.has_quiz_attempt ?? concept.hasQuizAttempt ?? "",
      ).toLowerCase() === "true",
    retentionPct: Number(
      concept.retention_pct ??
        concept.retentionPct ??
        concept.strength_score ??
        0,
    ),
    keywords: normalizeKeywords(concept.keywords),
    baseExplanation:
      concept.base_explanation ??
      concept.baseExplanation ??
      concept.explanation ??
      "",
    examQuestion: concept.exam_question ?? concept.examQuestion ?? "",
    comparisonPair: concept.comparison_pair ?? concept.comparisonPair ?? null,
    whyForgettable: concept.why_forgettable ?? concept.whyForgettable ?? "",
    quizAttemptCount: Number(
      concept.quiz_attempt_count ?? concept.quizAttemptCount ?? 0,
    ),
    isMastered:
      concept.is_mastered === true ||
      concept.isMastered === true ||
      concept.is_mastered === 1 ||
      concept.isMastered === 1 ||
      String(concept.is_mastered ?? concept.isMastered ?? "").toLowerCase() ===
        "true",
    isDueReview:
      concept.is_due_review === true ||
      concept.isDueReview === true ||
      concept.is_due_review === 1 ||
      concept.isDueReview === 1 ||
      String(
        concept.is_due_review ?? concept.isDueReview ?? "",
      ).toLowerCase() === "true",
    nextReviewAt:
      concept.next_review_at ??
      concept.nextReviewAt ??
      concept.next_review_date ??
      null,
    lastReviewedAt:
      concept.last_reviewed_at ??
      concept.lastReviewedAt ??
      concept.last_quiz_at ??
      concept.lastQuizAt ??
      null,
  };
}

export function relativeTime(value) {
  if (!value) return "Not started";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Not started";
  const days = Math.round((Date.now() - time) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

export function reviewTimingLabelFromDays(days) {
  const normalizedDays = Number(days);
  if (!Number.isFinite(normalizedDays)) return "Due Today";
  if (normalizedDays <= 0) return "Due Today";
  if (normalizedDays === 1) return "Tomorrow";
  return `in ${Math.round(normalizedDays)} days`;
}

export function dueLabel(nextReviewAt, nowMs = Date.now()) {
  if (!nextReviewAt) return "Due Today";
  const time = new Date(nextReviewAt).getTime();
  if (Number.isNaN(time)) return "Due Today";
  const currentDay = new Date(nowMs);
  currentDay.setHours(0, 0, 0, 0);
  const targetDay = new Date(time);
  targetDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (targetDay.getTime() - currentDay.getTime()) / 86400000,
  );
  if (dayDiff <= 0) return "Due Today";
  if (dayDiff === 1) return "Tomorrow";
  return `in ${dayDiff} days`;
}

export function badgeForRetention(pct) {
  if (pct >= 65) return { label: "Strong", className: "badge-good" };
  if (pct >= 40) return { label: "Fading", className: "badge-today" };
  return { label: "Forgotten", className: "badge-urgent" };
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function evaluateQuestion(question, answer) {
  if (!question) return false;
  return question.type === "mcq"
    ? Number(answer) === Number(question.correct_option_index)
    : false;
}

export function qualityForScore(score) {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 55) return 3;
  if (score >= 40) return 2;
  return 1;
}

export function Ring({ pct = null, label = null, icon = null }) {
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

export function MasteredCheckIcon({ size = 16, className = "" }) {
  return (
    <span
      className={`mastered-check-badge ${className}`.trim()}
      aria-hidden="true"
    >
      <FaCircleCheck size={size} />
    </span>
  );
}

export function SessionRetentionRow({ item, onOpenSessions }) {
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
          quizzed · {relativeTime(item.last_quiz_at ?? item.created_at)}
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
