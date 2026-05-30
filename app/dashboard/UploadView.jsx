"use client";

import { useEffect, useRef, useState } from "react";

import {
  estimateUploadSeconds,
  estimateUploadSecondsFromChunkCount,
  formatCountdown,
} from "./dashboardShared";

export default function UploadView({
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
