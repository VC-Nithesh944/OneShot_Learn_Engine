"use client";

import { useEffect, useRef, useState } from "react";
import Skeleton from "react-loading-skeleton";

function PriorityRing({ value }) {
  const color =
    value >= 5 ? "#B84040" : value >= 4 ? "#F0AA3A" : "#2BA888";
  const label = value >= 5 ? "Certain" : value >= 4 ? "Very Likely" : "Probable";
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: "50%",
        border: `2.5px solid ${color}`,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        background: `${color}18`,
      }}
    >
      <span
        style={{
          fontFamily: "Lora, serif",
          fontWeight: 700,
          fontSize: 16,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PriorityBadge({ priority }) {
  if (priority >= 5)
    return <span className="badge badge-urgent">Certain</span>;
  if (priority >= 4)
    return <span className="badge badge-today">Very Likely</span>;
  return <span className="badge badge-good">Probable</span>;
}

function AnalyzingSkeleton() {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <Skeleton height={14} width="30%" />
        <div style={{ marginTop: 10 }}>
          <Skeleton height={20} width="70%" />
        </div>
        <div style={{ marginTop: 8 }}>
          <Skeleton height={14} count={2} />
        </div>
      </div>
      {[...Array(4)].map((_, i) => (
        <div className="card" key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton circle width={42} height={42} />
            <div style={{ flex: 1 }}>
              <Skeleton height={16} width="85%" />
              <div style={{ marginTop: 6 }}>
                <Skeleton height={12} width="55%" />
              </div>
            </div>
            <Skeleton height={26} width={86} borderRadius={999} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PyqView({ sessions, isPremium, onUpgradePremium }) {
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [pyqText, setPyqText] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [drag, setDrag] = useState(false);
  const [extractingFile, setExtractingFile] = useState(false);
  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (!selectedSessionId) return;
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session) {
      setSubject(
        session.subject ?? session.topic ?? session.filename ?? "",
      );
    }
  }, [selectedSessionId, sessions]);

  const extractTextFromFile = async (file) => {
    if (!file) return;
    setExtractingFile(true);
    setError("");
    try {
      if (file.name.toLowerCase().endsWith(".txt")) {
        const text = await file.text();
        setPyqText(text);
        return;
      }
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const { PDFParse } = await import("pdf-parse");
        PDFParse.setWorker(
          "https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf.worker.mjs",
        );
        const parser = new PDFParse({
          data: new Uint8Array(await file.arrayBuffer()),
        });
        const parsed = await parser.getText();
        setPyqText(parsed.text ?? "");
        return;
      }
      const text = await file.text();
      setPyqText(text);
    } catch {
      setError(
        "Could not extract text from this file. Try pasting the text directly in the box below.",
      );
    } finally {
      setExtractingFile(false);
    }
  };

  const analyze = async () => {
    if (!selectedSessionId || !pyqText.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setExpandedIdx(null);
    try {
      const res = await fetch("/api/pyq/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId, pyqText, subject }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isPremium) {
    return (
      <div>
        <div className="page-header">
          <h1>🔮 Exam Predictor</h1>
          <div className="page-subtitle">
            Upload previous year papers to get AI-predicted exam questions with
            model answers.
          </div>
        </div>
        <div
          className="card"
          style={{ textAlign: "center", padding: "52px 32px" }}
        >
          <div style={{ fontSize: 52, marginBottom: 18 }}>🔮</div>
          <div
            className="empty-title"
            style={{ fontFamily: "Lora, serif", fontSize: 26 }}
          >
            Premium Feature
          </div>
          <div
            className="empty-sub"
            style={{ maxWidth: 480, margin: "12px auto 0" }}
          >
            Upload any previous year paper. Exam Predictor cross-references
            question patterns with your session concepts and generates model
            answers that score full marks.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              margin: "28px auto",
              maxWidth: 480,
            }}
          >
            {[
              { icon: "📋", label: "Pattern detection", sub: "Finds recurring topics" },
              { icon: "🎯", label: "Priority ranking", sub: "Scores 3–5 certainty" },
              { icon: "📝", label: "Model answers", sub: "Full-marks ready" },
            ].map((f) => (
              <div
                key={f.label}
                style={{
                  padding: "14px 12px",
                  borderRadius: 14,
                  border: "1px solid var(--line)",
                  background: "var(--surface-strong)",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                <div
                  style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}
                >
                  {f.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {f.sub}
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn btn-amber"
            onClick={onUpgradePremium}
            style={{ marginTop: 4, padding: "13px 32px" }}
          >
            👑 Upgrade to Premium
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>🔮 Exam Predictor</h1>
        <div className="page-subtitle">
          Upload a previous year paper. We cross-reference it with your session
          concepts and predict what's coming — with model answers.
        </div>
      </div>

      {/* Step 1 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="kicker">Step 1 — Select your study session</div>
        <select
          className="text-input"
          style={{ marginTop: 10 }}
          value={selectedSessionId}
          onChange={(e) => {
            setSelectedSessionId(e.target.value);
            setResult(null);
          }}
        >
          <option value="">Select a session…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.topic ?? s.filename ?? "Untitled"} ·{" "}
              {s.concept_count ?? 0} concepts ·{" "}
              {s.subject ?? s.subject_code ?? ""}
            </option>
          ))}
        </select>
      </div>

      {/* Step 2 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="kicker">
          Step 2 — Upload or paste previous year paper
        </div>

        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          style={{ marginTop: 10, minHeight: 80 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            extractTextFromFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            hidden
            onChange={(e) => extractTextFromFile(e.target.files?.[0])}
          />
          <div className="row-title">
            {extractingFile
              ? "Extracting text…"
              : pyqText
                ? `✓ ${pyqText.length.toLocaleString()} characters loaded`
                : "Drop PDF / TXT, or click to browse"}
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            {pyqText
              ? "Drop a new file to replace"
              : "PDF or plain text question paper"}
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 14, marginBottom: 8 }}>
          Or paste text directly
        </div>
        <textarea
          className="text-input"
          value={pyqText}
          onChange={(e) => setPyqText(e.target.value)}
          placeholder="Paste the full text of your previous year question paper here…"
          rows={5}
          style={{
            resize: "vertical",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        />
      </div>

      {error && (
        <div
          className="card notice"
          style={{
            borderColor: "rgba(184,64,64,0.25)",
            color: "var(--rose)",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <button
        className="btn btn-amber"
        onClick={analyze}
        disabled={loading || !selectedSessionId || !pyqText.trim()}
        style={{ marginBottom: 28, opacity: loading ? 0.7 : 1 }}
      >
        {loading ? "Analyzing question patterns…" : "🔮 Predict My Exam Questions"}
      </button>

      {loading && <AnalyzingSkeleton />}

      {result && !loading && (
        <div ref={resultsRef}>
          {/* Pattern Summary */}
          <div className="section-title">📊 Exam Pattern Analysis</div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="kicker">Overall Style</div>
                <div className="row-title" style={{ marginTop: 6, fontSize: 15 }}>
                  {result.patterns?.exam_style ?? "—"}
                </div>
                {result.patterns?.mark_distribution && (
                  <div className="row-meta" style={{ marginTop: 6 }}>
                    {result.patterns.mark_distribution}
                  </div>
                )}
              </div>
              {(result.patterns?.question_types ?? []).length > 0 && (
                <div style={{ flexShrink: 0 }}>
                  <div className="kicker">Question Types</div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginTop: 6,
                    }}
                  >
                    {result.patterns.question_types.map((qt, i) => (
                      <span className="kw" key={i}>
                        {qt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(result.patterns?.hot_topics ?? []).length > 0 && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <div className="kicker">🔥 Repeating Hot Topics</div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.patterns.hot_topics.map((ht, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                    >
                      <span
                        className="badge badge-today"
                        style={{ flexShrink: 0, fontSize: 11 }}
                      >
                        {ht.frequency}
                      </span>
                      <div>
                        <div className="row-title" style={{ fontSize: 13 }}>
                          {ht.topic}
                        </div>
                        {ht.note && (
                          <div className="row-meta" style={{ fontSize: 12 }}>
                            {ht.note}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Predictions */}
          <div className="section-title">
            🎯 Predicted Questions — {result.predictions?.length ?? 0} found
          </div>
          <div className="stack">
            {(result.predictions ?? []).map((pred, i) => {
              const isExpanded = expandedIdx === i;
              return (
                <div
                  key={i}
                  className="card"
                  style={{ cursor: "pointer", transition: "all 0.2s ease" }}
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <PriorityRing value={pred.priority ?? 3} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="row-title"
                        style={{ fontSize: 14, lineHeight: 1.5 }}
                      >
                        {pred.question}
                      </div>
                      <div className="row-meta" style={{ marginTop: 4 }}>
                        <strong>{pred.topic}</strong>
                        {pred.marks ? ` · ${pred.marks}m` : ""}
                        {pred.reason ? ` · ${pred.reason}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <PriorityBadge priority={pred.priority ?? 3} />
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--muted)",
                          transition: "transform 0.2s",
                          display: "inline-block",
                          transform: isExpanded
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        ▼
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 16,
                        borderTop: "1px solid var(--line)",
                        paddingTop: 16,
                      }}
                    >
                      <div className="kicker">📝 Model Answer</div>
                      <div
                        className="body"
                        style={{
                          marginTop: 8,
                          fontSize: 14,
                          lineHeight: 1.8,
                          color: "var(--text)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {pred.model_answer}
                      </div>

                      {(pred.key_points ?? []).length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <div className="kicker">
                            ✅ Must-mention points for full marks
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            {pred.key_points.map((kp, ki) => (
                              <div
                                key={ki}
                                style={{ display: "flex", gap: 8 }}
                              >
                                <span
                                  style={{
                                    color: "var(--teal)",
                                    fontWeight: 700,
                                    flexShrink: 0,
                                    fontSize: 14,
                                  }}
                                >
                                  ✓
                                </span>
                                <span style={{ fontSize: 13 }}>{kp}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Coverage Gaps */}
          {(result.coverage_gaps ?? []).length > 0 && (
            <>
              <div className="section-title">⚠️ Quick Review Needed</div>
              <div className="card">
                <div className="kicker" style={{ marginBottom: 10 }}>
                  Topics from PYQ not in your session notes
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {result.coverage_gaps.map((gap, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom:
                          i < result.coverage_gaps.length - 1
                            ? "1px solid var(--line)"
                            : "none",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--rose)",
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: 14,
                        }}
                      >
                        ⚠
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text)" }}>
                        {gap}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
