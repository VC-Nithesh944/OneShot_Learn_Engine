"use client";

import { useEffect, useState } from "react";

export default function SWUpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleUpdateReady = () => setVisible(true);
    window.addEventListener("sw:update-ready", handleUpdateReady);
    return () =>
      window.removeEventListener("sw:update-ready", handleUpdateReady);
  }, []);

  const handleReload = () => {
    navigator.serviceWorker.ready.then((registration) => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
    window.location.reload();
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#1a1510",
        border: "1px solid rgba(200,146,58,0.4)",
        borderRadius: "12px",
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        maxWidth: "90vw",
      }}
    >
      <span style={{ fontSize: "20px" }}>⚡</span>
      <span
        style={{
          fontSize: "13px",
          color: "rgba(240,232,212,0.85)",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 500,
        }}
      >
        OneShot update ready
      </span>
      <button
        onClick={handleReload}
        style={{
          padding: "6px 14px",
          background: "#c8923a",
          color: "#05050a",
          border: "none",
          borderRadius: "7px",
          fontSize: "12px",
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: "none",
          border: "none",
          color: "rgba(240,232,212,0.35)",
          fontSize: "18px",
          cursor: "pointer",
          padding: "0 2px",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
