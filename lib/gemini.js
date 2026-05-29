// lib/gemini.js

import { safeJsonParse } from "./sanitize";

const MODEL = "gemini-3.1-flash-lite";
const BASE_URL = "https://generativelanguage.googleapis.com/v1/models";
const KEY_GAP_MS = Number(process.env.GEMINI_KEY_GAP_MS ?? 5000);
const KEY_COOLDOWN_MS = Number(process.env.GEMINI_KEY_COOLDOWN_MS ?? 20000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildGeminiKeyPool() {
  const numbered = Object.keys(process.env)
    .filter((name) => /^GEMINI_API_KEY\d+$/i.test(name))
    .sort((a, b) => {
      const ai = Number(a.replace(/\D/g, ""));
      const bi = Number(b.replace(/\D/g, ""));
      return ai - bi;
    })
    .map((name) => process.env[name])
    .filter(Boolean);

  const primary = process.env.GEMINI_API_KEY
    ? [process.env.GEMINI_API_KEY]
    : [];
  const merged = [...primary, ...numbered];

  // Keep unique keys only.
  return [...new Set(merged)];
}

const GEMINI_KEYS = buildGeminiKeyPool();
const keyStates = GEMINI_KEYS.map((key) => ({ key, nextAllowedAt: 0 }));
let roundRobinCursor = 0;

function reserveKeySlot() {
  if (keyStates.length === 0) {
    throw new Error(
      "No Gemini API key configured. Set GEMINI_API_KEY or GEMINI_API_KEY1..N.",
    );
  }

  const now = Date.now();
  const start = roundRobinCursor;
  roundRobinCursor = (roundRobinCursor + 1) % keyStates.length;

  let selectedIndex = start;
  let earliestReady = Number.POSITIVE_INFINITY;

  for (let offset = 0; offset < keyStates.length; offset++) {
    const idx = (start + offset) % keyStates.length;
    const state = keyStates[idx];

    if (state.nextAllowedAt <= now) {
      selectedIndex = idx;
      earliestReady = now;
      break;
    }

    if (state.nextAllowedAt < earliestReady) {
      earliestReady = state.nextAllowedAt;
      selectedIndex = idx;
    }
  }

  const state = keyStates[selectedIndex];
  const runAt = Math.max(now, state.nextAllowedAt);
  state.nextAllowedAt = runAt + KEY_GAP_MS;

  return {
    key: state.key,
    keyIndex: selectedIndex,
    waitMs: Math.max(0, runAt - now),
  };
}

function applyKeyCooldown(keyIndex, multiplier = 1) {
  const state = keyStates[keyIndex];
  if (!state) return;
  const cooldownUntil = Date.now() + KEY_COOLDOWN_MS * multiplier;
  state.nextAllowedAt = Math.max(state.nextAllowedAt, cooldownUntil);
}

// ── Core call — returns raw text string ───────────────────────────────────────
export async function callGemini(prompt, options = {}) {
  const { temperature = 0.7, maxTokens = 4096 } = options;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: String(prompt) }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const slot = reserveKeySlot();
    if (slot.waitMs > 0) {
      await sleep(slot.waitMs);
    }

    const res = await fetch(
      `${BASE_URL}/${MODEL}:generateContent?key=${slot.key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
    );

    // Rate limited — wait and retry with backoff
    if (res.status === 429) {
      applyKeyCooldown(slot.keyIndex, attempt);
      if (attempt === 3) {
        throw new Error(
          "Gemini rate limit hit after 3 retries across available keys. Your daily quota may be exhausted — resets at midnight Pacific Time.",
        );
      }
      const wait = attempt * 15; // 15s → 30s
      console.warn(
        `[gemini] 429 rate limit — waiting ${wait}s (attempt ${attempt}/3)`,
      );
      await sleep(wait * 1000);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message}`);
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // Should never reach here
  throw new Error("Gemini call failed after all retries.");
}

// ── JSON wrapper — use this whenever you expect structured output ──────────────
export async function callGeminiJson(prompt, options = {}) {
  const raw = await callGemini(prompt, options);
  return safeJsonParse(raw);
}
