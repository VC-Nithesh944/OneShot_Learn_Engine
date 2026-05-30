const ACCEPTED_MODES = new Set([
  "analogy",
  "visual",
  "story",
  "simplified",
  "comparison",
  "advantage_disadvantage",
  "balanced",
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMode(mode) {
  const value = String(mode ?? "balanced").toLowerCase();
  return ACCEPTED_MODES.has(value) ? value : "balanced";
}

function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function hasQuizAttempt(concept) {
  const value = concept?.has_quiz_attempt ?? concept?.hasQuizAttempt;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function hasMasteredConcept(concept) {
  const value = concept?.is_mastered ?? concept?.isMastered;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

export function getSpacedReviewSchedule(attemptCount, now = Date.now()) {
  const count = Math.max(0, Math.floor(Number(attemptCount ?? 0)));

  if (count >= 4) {
    return {
      attemptCount: count,
      intervalDays: null,
      nextReviewAt: null,
      isMastered: true,
    };
  }

  const stageIntervals = [1, 3, 7];
  const intervalDays = stageIntervals
    .slice(0, Math.max(1, count))
    .reduce((total, days) => total + days, 0);

  return {
    attemptCount: count,
    intervalDays,
    nextReviewAt: new Date(now + intervalDays * 86400000).toISOString(),
    isMastered: false,
  };
}

export function getRetentionCurve(concept, options = {}) {
  const now = Number(options.now ?? Date.now());
  const retentionPct = clamp(
    Number(concept?.retention_pct ?? concept?.retentionPct ?? 0),
    0,
    100,
  );

  const mastered = hasMasteredConcept(concept);
  if (mastered) {
    return {
      hasQuizAttempt: true,
      isMastered: true,
      currentRetention: 100,
      targetAtDue: 100,
      nextReviewAt: null,
      reminderAt: null,
      reminderLeadHours: null,
      isOverdue: false,
    };
  }

  const nextReviewAt = toTimestamp(
    concept?.next_review_at ?? concept?.nextReviewAt ?? null,
  );
  const lastReviewedAt = toTimestamp(
    concept?.last_reviewed_at ??
      concept?.lastReviewedAt ??
      concept?.last_quiz_at ??
      concept?.lastQuizAt ??
      null,
  );

  let referenceLastReviewedAt = lastReviewedAt;
  if (!referenceLastReviewedAt && nextReviewAt) {
    const fallbackWindowHours = Math.max(
      4,
      Math.round((100 - retentionPct) * 0.5),
    );
    referenceLastReviewedAt = nextReviewAt - fallbackWindowHours * 3600000;
  }

  const hasSchedule = Number.isFinite(nextReviewAt);
  const targetAtDue = clamp(Math.max(retentionPct, 35), 35, 92);

  let currentRetention = retentionPct;
  if (hasSchedule && Number.isFinite(referenceLastReviewedAt)) {
    const windowMs = Math.max(nextReviewAt - referenceLastReviewedAt, 3600000);
    const progress = clamp((now - referenceLastReviewedAt) / windowMs, 0, 1);
    const eased = Math.pow(progress, 1.15);
    const atOrBeforeDue = targetAtDue + (100 - targetAtDue) * (1 - eased);

    if (now <= nextReviewAt) {
      currentRetention = atOrBeforeDue;
    } else {
      const overdueRatio = clamp((now - nextReviewAt) / windowMs, 0, 3);
      currentRetention = atOrBeforeDue * Math.exp(-1.1 * overdueRatio);
    }
  }

  currentRetention = Math.round(clamp(currentRetention, 5, 100));

  const fallbackHours = Math.max(4, Math.round((100 - retentionPct) * 0.5));
  const resolvedNextReviewAt = hasSchedule
    ? nextReviewAt
    : now + fallbackHours * 3600000;

  const windowForReminderMs = Number.isFinite(referenceLastReviewedAt)
    ? Math.max(resolvedNextReviewAt - referenceLastReviewedAt, 3600000)
    : Math.max(fallbackHours * 3600000, 3600000);
  const reminderLeadMs = clamp(
    Math.round(windowForReminderMs * 0.15),
    30 * 60000,
    6 * 3600000,
  );
  const reminderAt = Math.max(now, resolvedNextReviewAt - reminderLeadMs);

  return {
    hasQuizAttempt: hasQuizAttempt(concept),
    isMastered: false,
    currentRetention,
    targetAtDue: Math.round(targetAtDue),
    nextReviewAt: new Date(resolvedNextReviewAt).toISOString(),
    reminderAt: new Date(reminderAt).toISOString(),
    reminderLeadHours: Math.round(
      (resolvedNextReviewAt - reminderAt) / 3600000,
    ),
    isOverdue: now >= resolvedNextReviewAt,
  };
}

export function getRecommendedLearnMode(concept, learningStyle = "balanced") {
  const style = normalizeMode(learningStyle);
  if (style !== "balanced") return style;

  const category = String(concept?.category ?? "").toLowerCase();
  if (category === "comparison") return "comparison";
  if (category === "advantage_disadvantage") return "advantage_disadvantage";

  const retention = Number(
    concept?.retention_pct ?? concept?.retentionPct ?? 0,
  );
  const complexity = Number(concept?.complexity ?? 3);

  if (retention < 45) return "simplified";
  if (complexity >= 4) return "visual";
  if (retention < 70) return "analogy";
  return "story";
}
