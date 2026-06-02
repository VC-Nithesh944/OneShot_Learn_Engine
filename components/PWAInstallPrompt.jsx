"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  isAndroid,
  isIOS,
  isSafari,
  isRunningAsPWA,
  needsManualInstallInstructions,
  recordInstalled,
  recordPromptDismissed,
  recordPromptShown,
  recordVisit,
  shouldShowInstallPrompt,
} from "@/lib/pwa";

export default function PWAInstallPrompt() {
  const deferredPrompt = useRef(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isRunningAsPWA() : false,
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    recordVisit();

    if (isRunningAsPWA()) {
      return;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPrompt.current = event;

      if (shouldShowInstallPrompt()) {
        setTimeout(() => {
          setShowBanner(true);
          recordPromptShown();
        }, 2500);
      }
    };

    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setShowBanner(false);
      setShowIOSHint(false);
      setInstalled(true);
      recordInstalled("browser");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (needsManualInstallInstructions() && shouldShowInstallPrompt()) {
      setTimeout(() => {
        setShowIOSHint(true);
        recordPromptShown();
      }, 3000);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt.current) return;

    setInstalling(true);
    deferredPrompt.current.prompt();

    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;

    if (outcome === "accepted") {
      recordInstalled("custom-banner");
      setShowBanner(false);
      setInstalled(true);
    } else {
      recordPromptDismissed();
      setShowBanner(false);
    }

    setInstalling(false);
  }, []);

  const handleDismiss = useCallback(() => {
    recordPromptDismissed();
    setShowBanner(false);
    setShowIOSHint(false);
  }, []);

  if (installed || (!showBanner && !showIOSHint)) return null;

  return (
    <>
      {showBanner && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #1a1208 0%, #0d0a05 100%)",
              borderTop: "1px solid rgba(200,146,58,0.3)",
              padding: "16px 20px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
            }}
          >
            <Image
              src="/icons/icon-192x192.png"
              alt="OneShot"
              width={48}
              height={48}
              style={{ borderRadius: "12px", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#f0e8d4",
                  marginBottom: "2px",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                Add OneShot to Home Screen
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "rgba(240,232,212,0.55)",
                  fontFamily: "system-ui, sans-serif",
                  lineHeight: 1.4,
                }}
              >
                Instant access · No App Store needed
              </div>
            </div>
            <button
              onClick={handleInstallClick}
              disabled={installing}
              style={{
                flexShrink: 0,
                padding: "9px 18px",
                background: "#c8923a",
                color: "#05050a",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                fontFamily: "system-ui, sans-serif",
                cursor: installing ? "wait" : "pointer",
                opacity: installing ? 0.7 : 1,
                letterSpacing: "0.02em",
              }}
            >
              {installing ? "…" : "Install"}
            </button>
            <button
              onClick={handleDismiss}
              style={{
                flexShrink: 0,
                background: "none",
                border: "none",
                color: "rgba(240,232,212,0.35)",
                fontSize: "20px",
                cursor: "pointer",
                padding: "4px",
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #1a1208 0%, #0d0a05 100%)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          />
        </div>
      )}

      {showIOSHint && (
        <>
          <div
            onClick={handleDismiss}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
            }}
          >
            <div
              style={{
                background: "#1a1510",
                borderTop: "1px solid rgba(200,146,58,0.3)",
                borderRadius: "20px 20px 0 0",
                padding: "20px 24px 12px",
                boxShadow: "0 -12px 48px rgba(0,0,0,0.7)",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 4,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 2,
                  margin: "-8px auto 16px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "18px",
                }}
              >
                <Image
                  src="/icons/icon-192x192.png"
                  alt="OneShot"
                  width={44}
                  height={44}
                  style={{ borderRadius: "10px" }}
                />
                <div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#f0e8d4",
                      fontFamily: "system-ui, sans-serif",
                      marginBottom: "2px",
                    }}
                  >
                    Add to Home Screen
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "rgba(240,232,212,0.45)",
                      fontFamily: "system-ui, sans-serif",
                    }}
                  >
                    OneShot
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  style={{
                    marginLeft: "auto",
                    background: "rgba(255,255,255,0.08)",
                    border: "none",
                    color: "rgba(240,232,212,0.55)",
                    borderRadius: "50%",
                    width: 28,
                    height: 28,
                    fontSize: "16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              {[
                {
                  icon: "⬆️",
                  label: "Tap the Share button",
                  sub: "The square with an arrow at the bottom of Safari",
                },
                {
                  icon: "📲",
                  label: 'Tap "Add to Home Screen"',
                  sub: "Scroll down in the share sheet if needed",
                },
                {
                  icon: "✅",
                  label: 'Tap "Add" to confirm',
                  sub: "OneShot will appear on your home screen instantly",
                },
              ].map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                    marginBottom: i < 2 ? "14px" : "20px",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: "rgba(200,146,58,0.12)",
                      border: "1px solid rgba(200,146,58,0.25)",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0,
                    }}
                  >
                    {step.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#f0e8d4",
                        fontFamily: "system-ui, sans-serif",
                        marginBottom: "2px",
                      }}
                    >
                      {step.label}
                    </div>
                    <div
                      style={{
                        fontSize: "11.5px",
                        color: "rgba(240,232,212,0.45)",
                        fontFamily: "system-ui, sans-serif",
                        lineHeight: 1.4,
                      }}
                    >
                      {step.sub}
                    </div>
                  </div>
                </div>
              ))}
              <div
                style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
