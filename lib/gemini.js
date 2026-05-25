// lib/gemini.js

import { safeJsonParse } from './sanitize'

const MODEL    = 'gemini-3.1-flash-lite'
const BASE_URL = 'https://generativelanguage.googleapis.com/v1/models'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Core call — returns raw text string ───────────────────────────────────────
export async function callGemini(prompt, options = {}) {
  const { temperature = 0.7, maxTokens = 4096 } = options

  const body = JSON.stringify({
    contents:       [{ parts: [{ text: String(prompt) }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  })

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `${BASE_URL}/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    )

    // Rate limited — wait and retry with backoff
    if (res.status === 429) {
      if (attempt === 3) {
        throw new Error('Gemini rate limit hit after 3 retries. Your daily quota may be exhausted — resets at midnight Pacific Time.')
      }
      const wait = attempt * 15   // 15s → 30s
      console.warn(`[gemini] 429 rate limit — waiting ${wait}s (attempt ${attempt}/3)`)
      await sleep(wait * 1000)
      continue
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error')
      throw new Error(`Gemini API error ${res.status}: ${errText}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message}`)
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  // Should never reach here
  throw new Error('Gemini call failed after all retries.')
}

// ── JSON wrapper — use this whenever you expect structured output ──────────────
export async function callGeminiJson(prompt, options = {}) {
  const raw = await callGemini(prompt, options)
  return safeJsonParse(raw)
}