// lib/sanitize.js
// Cleans text before sending to Gemini and JSON before parsing

/**
 * Strip characters that break JSON parsing when Gemini includes
 * them in its response. Call this on rawText before building prompts.
 */
export function sanitizeTextForPrompt(text) {
  return (
    text
      // Null bytes — illegal everywhere in JSON
      .replace(/\u0000/g, "")
      // Lone surrogates (unpaired UTF-16 surrogate halves)
      .replace(/[\uD800-\uDFFF]/g, "")
      // Other control characters (except tab, newline, carriage return)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Unicode replacement character (often from bad PDF encoding)
      .replace(/\uFFFD/g, "")
      // Zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // Ligatures that confuse tokenizers (ﬁ → fi, ﬂ → fl, etc.)
      .replace(/\uFB00/g, "ff")
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")
      // Collapse multiple whitespace/newlines to single space
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Safely parse JSON from Gemini responses.
 * Handles malformed unicode escapes that JSON.parse rejects.
 */
export function safeJsonParse(raw) {
  // Step 1: strip markdown fences
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/g, "")
    .trim();

  // Step 2: remove null bytes and control chars inside the JSON string
  cleaned = cleaned
    .replace(/\u0000/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Step 3: normalize Unicode escapes that JSON.parse does not support
  cleaned = cleaned
    // Convert ES-style code point escapes (\u{1F600}) into actual characters
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    // Remove incomplete or malformed \u escapes (JSON requires exactly 4 hex digits)
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "");

  // Step 4: attempt parse
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Step 5: more aggressive — escape any remaining bare backslashes
    // that aren't part of valid JSON escape sequences
    const aggressive = cleaned.replace(
      /\\(?!["\\/bfnrtu])/g,
      "\\\\", // escape the lone backslash
    );
    try {
      return JSON.parse(aggressive);
    } catch (secondErr) {
      // Step 6: last resort — extract the concepts array directly with regex
      const match = aggressive.match(/"concepts"\s*:\s*(\[[\s\S]*?\])\s*[},]/);
      if (match) {
        try {
          const conceptsOnly = JSON.parse(`{"concepts":${match[1]}}`);
          console.warn(
            "[safeJsonParse] Recovered concepts array via regex fallback",
          );
          return conceptsOnly;
        } catch {
          /* fall through */
        }
      }
      throw new Error(
        `JSON parse failed after all recovery attempts. Original error: ${firstErr.message}`,
      );
    }
  }
}
