// app/api/extract/route.js

import { auth } from "@clerk/nextjs/server";
import { FREE_DAILY_UPLOAD_LIMIT } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractConcepts } from "@/lib/extractConcepts";
import { analyzeCognitiveLoad } from "@/lib/cognitiveLoad";
import { sanitizeTextForPrompt } from "@/lib/sanitize";
import { sendPushToUserSubscriptions } from "@/lib/pushNotifications";
import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// pdf-parse uses Node.js `fs` — must run in Node runtime, not Edge
export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — large PDFs + Gemini chunking

// Defer loading `pdf-parse` until runtime to avoid importing
// `pdfjs-dist` at module-evaluation time (it expects DOM globals).

// ── Category helpers ──────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "definition",
  "comparison",
  "advantage_disadvantage",
  "process",
  "architecture",
  "formula_rule",
  "use_case",
  "relationship",
]);

function normalizeCategory(value = "", title = "") {
  const raw = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (VALID_CATEGORIES.has(raw)) return raw;

  const text = `${raw} ${title.toLowerCase()}`;
  if (/\b(vs\.?|versus|compare|comparison)\b/.test(text)) return "comparison";
  if (/\b(pros|cons|advantages?|disadvantages?|merits?|demerits?)\b/.test(text))
    return "advantage_disadvantage";
  if (/\b(steps?|workflow|working|process|how it works|sequence)\b/.test(text))
    return "process";
  if (
    /\b(components?|architecture|layers?|tiers?|structure|stack)\b/.test(text)
  )
    return "architecture";
  if (/\b(formula|rule|algorithm|theorem|equation)\b/.test(text))
    return "formula_rule";
  if (/\b(application|uses?|use case|where is|real-world)\b/.test(text))
    return "use_case";
  if (/\b(relationship|relates?|role|part of|depends on)\b/.test(text))
    return "relationship";
  return "definition";
}

// ── Safe string helper — strips control/surrogate chars, caps length ──────────

function safeStr(val, maxLen = 2000) {
  return String(val ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/g, "")
    .slice(0, maxLen);
}

// ── PDF / text extraction ─────────────────────────────────────────────────────

// Server-side file parsing is a fallback path.
// Normal app flow extracts PDF text on the client and posts JSON text to this route.
// We keep this for direct API/multipart callers and resilience if client extraction fails.
async function extractTextFromFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  if (name.endsWith(".pdf")) {
    // Try to load a native canvas implementation first — pdfjs will
    // attempt to polyfill DOM APIs from `@napi-rs/canvas` if available.
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      require("@napi-rs/canvas");
    } catch (err) {
      console.warn(
        "[extract] @napi-rs/canvas not available:",
        err?.message ?? err,
      );
    }

    // Dynamic import prevents pdf-parse from calling fs.readFileSync at
    // module load time, which crashes Next.js App Router on cold start.
    const { PDFParse } = await import("pdf-parse");

    PDFParse.setWorker(
      pathToFileURL(
        join(
          process.cwd(),
          "node_modules/pdf-parse/dist/pdf-parse/web/pdf.worker.mjs",
        ),
      ).href,
    );

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text;
  }

  if (name.endsWith(".docx")) {
    throw new Error(
      "DOCX not yet supported. Please export as PDF or TXT first.",
    );
  }

  // Unknown extension — attempt plain-text read
  return buffer.toString("utf-8");
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST with multipart form data to upload a PDF or text file.",
  });
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // ── Free-tier daily upload guard ───────────────────────────────────────
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: todayUploads } = await admin
      .from("study_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart.toISOString());

    if ((todayUploads ?? 0) >= FREE_DAILY_UPLOAD_LIMIT) {
      return NextResponse.json(
        {
          error: `You've used your ${FREE_DAILY_UPLOAD_LIMIT} free uploads for today. Upgrade to Premium for unlimited uploads.`,
          code: "DAILY_LIMIT_REACHED",
          limitType: "uploads",
        },
        { status: 429 },
      );
    }
  } catch (err) {
    console.warn(
      "[extract] failed to check daily upload count:",
      err?.message ?? err,
    );
    // Continue — failure to read the count should not block a user from uploading.
  }

  const contentType = request.headers.get("content-type") ?? "";

  let rawText = null;
  let fileName = null;
  let subject = "";
  let subjectCode = "custom";

  // Primary app path: dashboard client posts extracted text as JSON.
  if (contentType.includes("application/json")) {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request — expected JSON body." },
        { status: 400 },
      );
    }

    rawText = String(body?.text ?? "");
    fileName = String(body?.fileName ?? "uploaded-notes.txt");
    subject = String(body?.subject ?? "").trim();
    subjectCode = String(body?.subjectCode ?? "custom").trim();
  } else {
    // Fallback path: parse multipart form and extract text server-side.
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request — expected multipart form data." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    subject = String(formData.get("subject") ?? "").trim();
    subjectCode = String(formData.get("subjectCode") ?? "custom").trim();

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file attached." }, { status: 400 });
    }

    fileName = file.name;
    try {
      rawText = await extractTextFromFile(file);
    } catch (err) {
      console.error("[extract] file parse error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
  }

  if (!subject) {
    return NextResponse.json(
      { error: "Subject or chapter name is required." },
      { status: 400 },
    );
  }

  // ── Cache check: same user + filename + already processed ─────────────────
  const { data: cached } = await admin
    .from("study_sessions")
    .select("id, topic, concept_count, concepts(id)")
    .eq("user_id", userId)
    .eq("filename", fileName)
    .eq("is_processed", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.id && (cached.concepts?.length ?? 0) > 0) {
    console.log(`[extract] cache hit — "${fileName}"`);
    return NextResponse.json({
      session_id: cached.id,
      topic: cached.topic,
      concept_count: cached.concept_count,
      from_cache: true,
      concepts: cached.concepts.map((c) => c.id),
    });
  }

  // Sanitize before any further use (fixes unicode escape errors)
  rawText = sanitizeTextForPrompt(rawText);
  console.log(`[extract] sanitized text: ${rawText.length} chars`);

  if (rawText.trim().length < 100) {
    return NextResponse.json(
      {
        error:
          "Extracted text is too short. Upload a text-selectable PDF or a .txt file.",
      },
      { status: 422 },
    );
  }

  // ── Create session row ────────────────────────────────────────────────────
  const { data: session, error: sessionErr } = await admin
    .from("study_sessions")
    .insert({
      user_id: userId,
      filename: fileName,
      subject,
      subject_code: subjectCode || "custom",
      is_processed: false,
    })
    .select("id")
    .single();

  if (sessionErr) {
    console.error("[extract] session insert:", sessionErr);
    return NextResponse.json(
      { error: "Failed to create session." },
      { status: 500 },
    );
  }

  // ── AI extraction + DB writes ─────────────────────────────────────────────
  try {
    console.log("[extract] starting Gemini extraction…");
    const extracted = await extractConcepts(rawText, subject);
    const cogLoad = analyzeCognitiveLoad(extracted.concepts, rawText);

    // Sort by exam probability so highest-value concepts get lowest display_order
    const ordered = [...extracted.concepts].sort(
      (a, b) => (b.exam_probability ?? 3) - (a.exam_probability ?? 3),
    );

    const conceptRows = ordered.map((concept, index) => ({
      session_id: session.id,
      user_id: userId,
      title: safeStr(concept.title, 200),
      base_explanation: safeStr(concept.base_explanation),
      why_forgettable: safeStr(concept.why_forgettable),
      complexity: Math.min(5, Math.max(1, Number(concept.complexity) || 3)),
      keywords: Array.isArray(concept.keywords)
        ? concept.keywords.map(String)
        : [],
      category: normalizeCategory(concept.category, concept.title),
      visualizable: Boolean(concept.visualizable),
      display_order: index,
      exam_probability: Math.min(
        5,
        Math.max(1, Number(concept.exam_probability) || 3),
      ),
      exam_question: concept.exam_question
        ? safeStr(concept.exam_question)
        : null,
      comparison_pair: concept.comparison_pair
        ? safeStr(concept.comparison_pair)
        : null,
    }));

    const tempIdToUUID = {};

    // Fast path: batch insert concepts in one round trip.
    const { data: insertedRows, error: batchInsertError } = await admin
      .from("concepts")
      .insert(conceptRows)
      .select("id, display_order");

    if (!batchInsertError && Array.isArray(insertedRows)) {
      for (const row of insertedRows) {
        const concept = ordered[Number(row.display_order)];
        if (row?.id && concept?.temp_id) {
          tempIdToUUID[concept.temp_id] = row.id;
        }
      }
    } else {
      // Safety fallback: preserve previous behavior if batch insert fails.
      console.warn(
        "[extract] batch concept insert failed; falling back to per-row inserts:",
        batchInsertError?.message,
      );

      for (const [index, concept] of ordered.entries()) {
        const { data: row, error: err } = await admin
          .from("concepts")
          .insert(conceptRows[index])
          .select("id")
          .single();

        if (err || !row?.id) {
          // Log and skip — don't crash the whole upload over one bad concept
          console.error(
            `[extract] concept insert skipped "${concept.title}":`,
            err?.message,
          );
          continue;
        }

        tempIdToUUID[concept.temp_id] = row.id;
      }
    }

    // Second pass — wire up prerequisite UUIDs
    for (const concept of extracted.concepts) {
      const prereqs = (concept.prerequisite_temp_ids ?? [])
        .map((t) => tempIdToUUID[t])
        .filter(Boolean);
      const targetId = tempIdToUUID[concept.temp_id];
      if (targetId && prereqs.length) {
        await admin
          .from("concepts")
          .update({ prerequisite_ids: prereqs })
          .eq("id", targetId);
      }
    }

    // Cognitive load report
    await admin.from("cognitive_load_reports").insert({
      session_id: session.id,
      user_id: userId,
      load_score: cogLoad.load_score,
      level: cogLoad.level,
      readability_score: cogLoad.readability_score,
      new_terms_count: cogLoad.new_terms_count,
      issues: cogLoad.issues,
      recommendation: cogLoad.recommendation,
    });

    const { count: totalConceptCount } = await admin
      .from("concepts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    await admin
      .from("user_profiles")
      .update({ total_concepts: totalConceptCount ?? 0 })
      .eq("clerk_user_id", userId);

    const insertedCount = Object.keys(tempIdToUUID).length;

    // Mark session complete
    await admin
      .from("study_sessions")
      .update({
        topic: extracted.topic,
        reading_level: extracted.reading_level,
        cognitive_load: cogLoad.level,
        concept_count: insertedCount,
        exam_summary: extracted.exam_summary ?? null,
        is_processed: true,
      })
      .eq("id", session.id);

    try {
      await sendPushToUserSubscriptions({
        admin,
        userId,
        payload: {
          title: "Session complete",
          body: `${insertedCount} concepts extracted from your ${subject} notes. First review is ready in the app.`,
          icon: "/globe.svg",
          badge: "/window.svg",
          tag: "session-complete",
          data: { url: "/dashboard" },
        },
      });
    } catch (pushErr) {
      console.error(
        "[extract] session-complete push failed:",
        pushErr?.message ?? pushErr,
      );
    }

    console.log(`[extract] done — ${insertedCount} concepts saved`);

    return NextResponse.json({
      session_id: session.id,
      topic: extracted.topic,
      concept_count: insertedCount,
      cognitive_load: cogLoad,
      concepts: Object.values(tempIdToUUID),
    });
  } catch (err) {
    console.error("[extract] error:", err);

    const safeMsg = String(err.message ?? "Extraction failed")
      .replace(/[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/g, "")
      .slice(0, 300);

    await admin
      .from("study_sessions")
      .update({ processing_error: safeMsg })
      .eq("id", session.id);

    return NextResponse.json({ error: safeMsg }, { status: 500 });
  }
}
