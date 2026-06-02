const KEYS = {
  VISIT_COUNT: "pwa_visit_count",
  FIRST_VISIT: "pwa_first_visit_ts",
  LAST_PROMPT_SHOWN: "pwa_last_prompt_ts",
  PROMPT_DISMISSED: "pwa_prompt_dismissed",
  INSTALL_SOURCE: "pwa_install_source",
};

const RULES = {
  MIN_VISITS: 2,
  MIN_AGE_MS: 30_000,
  PROMPT_COOLDOWN_MS: 7 * 24 * 60 * 60_000,
  HARD_DISMISS_THRESHOLD: 2,
};

function safeStorage(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function recordVisit() {
  if (typeof window === "undefined") return;

  safeStorage(() => {
    const count = Number(localStorage.getItem(KEYS.VISIT_COUNT) ?? 0) + 1;
    localStorage.setItem(KEYS.VISIT_COUNT, String(count));

    if (!localStorage.getItem(KEYS.FIRST_VISIT)) {
      localStorage.setItem(KEYS.FIRST_VISIT, String(Date.now()));
    }
  });
}

export function getVisitCount() {
  return (
    safeStorage(() => Number(localStorage.getItem(KEYS.VISIT_COUNT) ?? 0)) ?? 0
  );
}

export function getSiteAgeMs() {
  return (
    safeStorage(() => {
      const first = localStorage.getItem(KEYS.FIRST_VISIT);
      return first ? Date.now() - Number(first) : 0;
    }) ?? 0
  );
}

export function shouldShowInstallPrompt() {
  if (typeof window === "undefined") return false;

  return (
    safeStorage(() => {
      if (isRunningAsPWA()) return false;

      const dismissCount = Number(
        localStorage.getItem(KEYS.PROMPT_DISMISSED) ?? 0,
      );
      if (dismissCount >= RULES.HARD_DISMISS_THRESHOLD) return false;

      const lastShown = Number(
        localStorage.getItem(KEYS.LAST_PROMPT_SHOWN) ?? 0,
      );
      if (lastShown && Date.now() - lastShown < RULES.PROMPT_COOLDOWN_MS)
        return false;

      if (getVisitCount() < RULES.MIN_VISITS) return false;
      if (getSiteAgeMs() < RULES.MIN_AGE_MS) return false;

      return true;
    }) ?? false
  );
}

export function recordPromptShown() {
  safeStorage(() => {
    localStorage.setItem(KEYS.LAST_PROMPT_SHOWN, String(Date.now()));
  });
}

export function recordPromptDismissed() {
  safeStorage(() => {
    const count = Number(localStorage.getItem(KEYS.PROMPT_DISMISSED) ?? 0) + 1;
    localStorage.setItem(KEYS.PROMPT_DISMISSED, String(count));
    localStorage.setItem(KEYS.LAST_PROMPT_SHOWN, String(Date.now()));
  });
}

export function recordInstalled(source = "browser") {
  safeStorage(() => {
    localStorage.setItem(KEYS.INSTALL_SOURCE, source);
  });
}

export function isRunningAsPWA() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      window.navigator.standalone === true) ||
    document.referrer.includes("android-app://")
  );
}

export function isIOS() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isSafari() {
  if (typeof window === "undefined") return false;
  return /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent);
}

export function isAndroid() {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent);
}

export function needsManualInstallInstructions() {
  return isIOS() && isSafari() && !isRunningAsPWA();
}
