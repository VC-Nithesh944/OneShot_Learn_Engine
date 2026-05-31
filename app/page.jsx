"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

function AuthCta({ className, children, signedOutHref, style }) {
  const { isLoaded, isSignedIn } = useAuth();
  const href = isLoaded && isSignedIn ? "/dashboard" : signedOutHref;

  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}

function withPostAuthRedirect(pathname) {
  const url = new URL(pathname, "http://localhost");
  url.searchParams.set("redirect_url", "/dashboard");
  return `${url.pathname}?${url.searchParams.toString()}`;
}

// ─── Forgetting Curve Canvas Animation ────────────────────────
function ForgettingCurve() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // Plot area
    const PL = 44,
      PR = 16,
      PT = 16,
      PB = 44;
    const PW = W - PL - PR;
    const PH = H - PT - PB;

    function dayToX(d) {
      return PL + (d / 14) * PW;
    }
    function retToY(r) {
      return PT + (1 - r / 100) * PH;
    }

    // Ebbinghaus decay (S=1.3 days)
    function decayAt(day) {
      return 100 * Math.exp(-day / 1.3);
    }

    // With OneShot: revivals at days 1, 3.5, 8
    const REVIEWS = [
      { day: 1, stability: 1.3, boost: 0.88 },
      { day: 3.5, stability: 2.6, boost: 0.91 },
      { day: 8, stability: 5.2, boost: 0.94 },
    ];
    function withOneShot(day) {
      let r = 100,
        lastDay = 0,
        stab = 1.3;
      for (const rv of REVIEWS) {
        if (day <= rv.day) return r * Math.exp(-(day - lastDay) / stab);
        r = r * Math.exp(-(rv.day - lastDay) / stab);
        r = r + (100 - r) * rv.boost;
        stab = rv.stability;
        lastDay = rv.day;
      }
      return r * Math.exp(-(day - lastDay) / stab);
    }

    const N = 280;
    const withoutPts = Array.from({ length: N }, (_, i) => {
      const d = (i / (N - 1)) * 14;
      return [dayToX(d), retToY(decayAt(d))];
    });
    const withPts = Array.from({ length: N }, (_, i) => {
      const d = (i / (N - 1)) * 14;
      return [dayToX(d), retToY(Math.max(0, withOneShot(d)))];
    });
    const reviewDots = REVIEWS.map((rv) => ({
      x: dayToX(rv.day),
      y: retToY(
        withOneShot(rv.day) + (100 - withOneShot(rv.day)) * rv.boost * 0.5,
      ),
      dayVal: rv.day,
    }));

    let prog = 0;
    let raf;

    function draw(p) {
      ctx.clearRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = "rgba(242,237,228,0.06)";
      ctx.lineWidth = 0.5;
      [0, 25, 50, 75, 100].forEach((pct) => {
        const y = retToY(pct);
        ctx.beginPath();
        ctx.moveTo(PL, y);
        ctx.lineTo(W - PR, y);
        ctx.stroke();
      });
      [0, 2, 4, 7, 10, 14].forEach((d) => {
        const x = dayToX(d);
        ctx.beginPath();
        ctx.moveTo(x, PT);
        ctx.lineTo(x, H - PB);
        ctx.stroke();
      });

      // Axes
      ctx.strokeStyle = "rgba(242,237,228,0.18)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(PL, PT);
      ctx.lineTo(PL, H - PB);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PL, H - PB);
      ctx.lineTo(W - PR, H - PB);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = "rgba(138,126,110,0.7)";
      ctx.font = "9px DM Sans, sans-serif";
      ctx.textAlign = "right";
      [100, 75, 50, 25, 0].forEach((pct) => {
        ctx.fillText(pct + "%", PL - 5, retToY(pct) + 3);
      });
      ctx.textAlign = "center";
      [0, 2, 4, 7, 10, 14].forEach((d) => {
        ctx.fillText("d" + d, dayToX(d), H - PB + 12);
      });

      const maxIdx = Math.floor(p * (N - 1));

      // Without OneShot — dim reddish line
      if (maxIdx > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(180,70,70,0.45)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(withoutPts[0][0], withoutPts[0][1]);
        for (let i = 1; i <= maxIdx; i++)
          ctx.lineTo(withoutPts[i][0], withoutPts[i][1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // With OneShot — amber line
      if (maxIdx > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "#F0AA3A";
        ctx.lineWidth = 2.2;
        ctx.shadowColor = "rgba(240,170,58,0.35)";
        ctx.shadowBlur = 6;
        ctx.moveTo(withPts[0][0], withPts[0][1]);
        for (let i = 1; i <= maxIdx; i++)
          ctx.lineTo(withPts[i][0], withPts[i][1]);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Review dots + labels
      const reviewProg = Math.min(1, Math.max(0, (p - 0.1) / 0.9));
      reviewDots.forEach((dot, i) => {
        const dotP = Math.min(1, Math.max(0, (reviewProg - i * 0.25) * 4));
        if (dotP <= 0) return;
        const dotX = dayToX(REVIEWS[i].day);

        // Vertical tick at review
        ctx.beginPath();
        ctx.strokeStyle = `rgba(240,170,58,${0.5 * dotP})`;
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 2]);
        ctx.moveTo(dotX, PT);
        ctx.lineTo(dotX, H - PB);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot at review point
        const beforeY = retToY(withOneShot(REVIEWS[i].day));
        ctx.beginPath();
        ctx.fillStyle = `rgba(240,170,58,${dotP})`;
        ctx.arc(dotX, beforeY, 3.5 * dotP, 0, Math.PI * 2);
        ctx.fill();

        // "Review" label
        ctx.fillStyle = `rgba(240,170,58,${dotP * 0.9})`;
        ctx.font = `${Math.round(9 * dotP)}px DM Sans, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("review ✓", dotX, PT + 5);
      });

      // Axis titles
      ctx.save();
      ctx.translate(10, PT + PH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(138,126,110,0.55)";
      ctx.font = "9px DM Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Retention", 0, 0);
      ctx.restore();
      ctx.fillStyle = "rgba(138,126,110,0.55)";
      ctx.font = "9px DM Sans, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Days since studying", PL + PW / 2, H - 2);

      // Legend — appears after animation
      if (p > 0.85) {
        const lAlpha = Math.min(1, (p - 0.85) / 0.15);
        ctx.fillStyle = `rgba(180,70,70,${0.55 * lAlpha})`;

        ctx.fillStyle = `rgba(138,126,110,${0.7 * lAlpha})`;
        ctx.font = "9px DM Sans, sans-serif";
        ctx.textAlign = "left";

        ctx.fillStyle = `rgba(240,170,58,${lAlpha})`;

        ctx.fillStyle = `rgba(138,126,110,${0.7 * lAlpha})`;
      }
    }

    function animate() {
      prog = Math.min(1, prog + 0.006);
      draw(prog);
      if (prog < 1) raf = requestAnimationFrame(animate);
    }

    // Delay start slightly for page load
    const t = setTimeout(() => {
      raf = requestAnimationFrame(animate);
    }, 600);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={240}
      style={{ width: "100%", maxWidth: 420, height: "auto", display: "block" }}
    />
  );
}

// ─── Number Counter Animation ──────────────────────────────────
function CountUp({ target, suffix = "", duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now) => {
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / duration);
          const ease = 1 - Math.pow(1 - progress, 3);
          setVal(Math.round(ease * target));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  );
}

// ─── Main Landing Page ────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ── Google Fonts ── */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500&display=swap"
        rel="stylesheet"
      />

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #0E0C0A; color: #F2EDE4; font-family: 'DM Sans', sans-serif; overflow-x: hidden; }
 
        /* ── Noise grain overlay ── */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          opacity: 0.5;
        }
 
        /* ── Typography ── */
        .serif   { font-family: 'Lora', serif; }
        .serif-i { font-family: 'Lora', serif; font-style: italic; }
 
        /* ── Nav ── */
        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 0 48px;
          height: 64px; display: flex; align-items: center; justify-content: space-between;
          transition: background 0.3s, border-color 0.3s, backdrop-filter 0.3s;
        }
        .nav.scrolled {
          background: rgba(14,12,10,0.82);
          border-bottom: 1px solid rgba(242,237,228,0.07);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .nav-logo { font-family: 'Lora', serif; font-size: 20px; font-weight: 600; letter-spacing: -0.3px; color: #F2EDE4; text-decoration: none; }
        .nav-logo span { color: #C47D0E; }
        .nav-links { display: flex; align-items: center; gap: 10px; }
        .btn-ghost {
          padding: 8px 18px; border-radius: 8px; font-size: 14px; font-weight: 400;
          color: rgba(242,237,228,0.7); background: transparent; border: none;
          cursor: pointer; text-decoration: none; transition: color 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-ghost:hover { color: #F2EDE4; }
        .btn-amber {
          padding: 9px 22px; border-radius: 8px; font-size: 14px; font-weight: 500;
          color: #0E0C0A; background: #C47D0E; border: none;
          cursor: pointer; text-decoration: none; transition: background 0.15s, transform 0.12s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-amber:hover { background: #D98F1A; transform: translateY(-1px); }
        .btn-amber:active { transform: translateY(0); }
        .btn-outline {
          padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 500;
          color: #F2EDE4; background: transparent;
          border: 1px solid rgba(242,237,228,0.18);
          cursor: pointer; text-decoration: none; transition: border-color 0.15s, background 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .btn-outline:hover { border-color: rgba(242,237,228,0.35); background: rgba(242,237,228,0.04); }
        .btn-primary-lg {
          padding: 15px 36px; border-radius: 10px; font-size: 16px; font-weight: 500;
          color: #0E0C0A; background: #F0AA3A;
          border: none; cursor: pointer; text-decoration: none;
          transition: background 0.15s, transform 0.12s;
          font-family: 'DM Sans', sans-serif; letter-spacing: -0.1px;
        }
        .btn-primary-lg:hover { background: #F5B84A; transform: translateY(-2px); }
 
        /* ── Sections ── */
        section { position: relative; z-index: 1; }
 
        /* ── Hero ── */
        .hero {
          min-height: 100vh; display: flex; flex-direction: column;
          justify-content: center; padding: 100px 48px 64px;
          max-width: 1200px; margin: 0 auto;
        }
        .hero-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
        }
        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 500; letter-spacing: 1.2px; text-transform: uppercase;
          color: #F0AA3A; margin-bottom: 28px;
        }
        .eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #C47D0E; }
        .hero-h1 {
          font-family: 'Lora', serif;
          font-size: clamp(44px, 5vw, 64px);
          font-weight: 500;
          line-height: 1.13;
          letter-spacing: -0.04em;
          color: #F2EDE4;
          margin-bottom: 24px;
        }
        .hero-h1 em { font-style: italic; color: #F0AA3A; }
        .hero-h1 .dim { color: rgba(242,237,228,0.45); }
        .hero-sub {
          font-size: 17px; font-weight: 300; line-height: 1.75;
          color: rgba(242,237,228,0.6); margin-bottom: 40px;
          max-width: 440px;
        }
        .hero-sub strong { color: rgba(242,237,228,0.85); font-weight: 400; }
        .hero-ctas { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .hero-note {
          margin-top: 20px; font-size: 12.5px; color: rgba(242,237,228,0.3);
          display: flex; align-items: center; gap: 6px;
        }
 
        /* ── Curve container ── */
        .curve-container {
          background: rgba(242,237,228,0.03);
          border: 1px solid rgba(242,237,228,0.07);
          border-radius: 16px; padding: 24px 20px 14px;
        }
        .curve-title { font-size: 11px; color: rgba(242,237,228,0.3); letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 12px; text-align: center; }
 
        /* ── Divider ── */
        .divider { border: none; border-top: 1px solid rgba(242,237,228,0.07); margin: 0 48px; }
 
        /* ── Stats strip ── */
        .stats-strip {
          display: grid; grid-template-columns: repeat(3, 1fr);
          max-width: 1200px; margin: 0 auto; padding: 64px 48px;
          gap: 2px;
        }
        .stat-item { padding: 0 32px; border-right: 1px solid rgba(242,237,228,0.07); }
        .stat-item:first-child { padding-left: 0; }
        .stat-item:last-child { border-right: none; }
        .stat-num {
          font-family: 'Lora', serif; font-size: 52px; font-weight: 400;
          color: #F0AA3A; letter-spacing: -0.04em; line-height: 1;
          margin-bottom: 8px;
        }
        .stat-label { font-size: 14px; color: rgba(242,237,228,0.45); line-height: 1.55; }
 
        /* ── Problem section ── */
        .section-inner { max-width: 1200px; margin: 0 auto; padding: 96px 48px; }
        .section-tag {
          font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase;
          color: rgba(242,237,228,0.3); margin-bottom: 16px; font-weight: 500;
        }
        .section-h2 {
          font-family: 'Lora', serif; font-size: clamp(28px, 3.5vw, 42px);
          font-weight: 500; line-height: 1.25; letter-spacing: -0.03em;
          color: #F2EDE4; margin-bottom: 20px;
        }
        .section-h2 em { font-style: italic; color: rgba(242,237,228,0.5); }
        .section-lead {
          font-size: 16px; line-height: 1.8; color: rgba(242,237,228,0.5);
          max-width: 560px; margin-bottom: 56px;
        }
 
        /* ── Comparison cards ── */
        .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .compare-card {
          border: 1px solid rgba(242,237,228,0.07); border-radius: 14px;
          padding: 28px; background: rgba(242,237,228,0.02);
        }
        .compare-card.bad { border-color: rgba(180,70,70,0.2); background: rgba(180,70,70,0.03); }
        .compare-card.good { border-color: rgba(196,125,14,0.25); background: rgba(196,125,14,0.03); }
        .compare-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
        .compare-icon { font-size: 22px; }
        .compare-subject { font-size: 15px; font-weight: 500; color: #F2EDE4; }
        .compare-sub { font-size: 12px; color: rgba(242,237,228,0.35); }
        .compare-trait {
          display: flex; align-items: flex-start; gap: 10px;
          font-size: 13.5px; color: rgba(242,237,228,0.55); margin-bottom: 10px;
          line-height: 1.5;
        }
        .trait-dot {
          width: 5px; height: 5px; border-radius: 50%;
          margin-top: 7px; flex-shrink: 0;
        }
        .trait-dot.red { background: rgba(180,70,70,0.7); }
        .trait-dot.amber { background: #C47D0E; }
        .compare-verdict {
          margin-top: 18px; padding-top: 16px;
          border-top: 1px solid rgba(242,237,228,0.06);
          font-size: 12.5px; font-style: italic; font-family: 'Lora', serif;
          color: rgba(242,237,228,0.35); line-height: 1.6;
        }
 
        /* ── How it works ── */
        .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
        .step {
          padding: 40px 32px; border-right: 1px solid rgba(242,237,228,0.07);
          position: relative;
        }
        .step:last-child { border-right: none; }
        .step-num {
          font-family: 'Lora', serif; font-size: 64px; font-weight: 400;
          color: rgba(242,237,228,0.80); line-height: 1; margin-bottom: 20px;
          letter-spacing: -0.04em;
        }
        .step-icon-wrap {
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(196,125,14,0.12); border: 1px solid rgba(196,125,14,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; margin-bottom: 16px;
        }
        .step-title { font-size: 17px; font-weight: 500; color: #F2EDE4; margin-bottom: 10px; }
        .step-desc { font-size: 14px; line-height: 1.7; color: rgba(242,237,228,0.45); }
        .step-connector {
          position: absolute; top: 48px; right: -1px;
          width: 24px; height: 1px;
          background: linear-gradient(to right, rgba(196,125,14,0.3), transparent);
        }
 
        /* ── Features ── */
        .features-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          border: 1px solid rgba(242,237,228,0.07); border-radius: 16px; overflow: hidden;
        }
        .feature-cell {
          padding: 32px 28px;
          background: rgba(242,237,228,0.015);
          border-right: 1px solid rgba(242,237,228,0.07);
          border-bottom: 1px solid rgba(242,237,228,0.07);
          transition: background 0.2s;
        }
        .feature-cell:hover { background: rgba(242,237,228,0.035); }
        .feature-cell:nth-child(3),
        .feature-cell:nth-child(6) { border-right: none; }
        .feature-cell:nth-child(4),
        .feature-cell:nth-child(5),
        .feature-cell:nth-child(6) { border-bottom: none; }
        .feature-glyph {
          font-size: 22px; margin-bottom: 14px; display: block;
          filter: grayscale(20%);
        }
        .feature-title { font-size: 15px; font-weight: 500; color: #F2EDE4; margin-bottom: 8px; }
        .feature-desc { font-size: 13.5px; line-height: 1.65; color: rgba(242,237,228,0.4); }
 
        /* ── Transform modes ── */
        .modes-row { display: flex; gap: 10px; margin: 48px 0; flex-wrap: wrap; }
        .mode-pill {
          padding: 10px 18px; border-radius: 99px;
          border: 1px solid rgba(242,237,228,0.1);
          font-size: 13.5px; color: rgba(242,237,228,0.6);
          display: flex; align-items: center; gap: 8px;
        }
        .mode-pill .pill-icon { font-size: 15px; }
        .mode-pill.amber-pill {
          border-color: rgba(196,125,14,0.4);
          background: rgba(196,125,14,0.08);
          color: #F0AA3A;
        }
 
        /* ── Science callout ── */
        .science-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .science-card {
          padding: 24px; border-radius: 12px;
          border: 1px solid rgba(242,237,228,0.06);
          background: rgba(242,237,228,0.02);
        }
        .science-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #F0AA3A; font-weight: 500; margin-bottom: 10px; }
        .science-name { font-family: 'Lora', serif; font-size: 16px; font-weight: 500; color: #F2EDE4; margin-bottom: 8px; line-height: 1.4; }
        .science-body { font-size: 13px; line-height: 1.65; color: rgba(242,237,228,0.4); }
 
        /* ── Quote ── */
        .quote-block {
          border-left: 2px solid #C47D0E; padding: 0 0 0 28px;
          max-width: 680px; margin: 56px auto;
        }
        .quote-text {
          font-family: 'Lora', serif; font-style: italic;
          font-size: clamp(18px, 2.2vw, 24px); font-weight: 400;
          line-height: 1.65; color: rgba(242,237,228,0.75);
          margin-bottom: 14px;
        }
        .quote-attr { font-size: 13px; color: rgba(242,237,228,0.3); }
 
        /* ── CTA section ── */
        .cta-section {
          margin: 0 48px 80px; border-radius: 20px;
          background: linear-gradient(135deg, #1A1410 0%, #1E1508 50%, #1A1208 100%);
          border: 1px solid rgba(196,125,14,0.2);
          padding: 80px 64px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 48px;
        }
        .cta-left { flex: 1; }
        .cta-h2 {
          font-family: 'Lora', serif; font-size: clamp(28px, 3vw, 38px);
          font-weight: 500; line-height: 1.25; letter-spacing: -0.03em;
          color: #F2EDE4; margin-bottom: 16px;
        }
        .cta-h2 em { font-style: italic; color: #F0AA3A; }
        .cta-sub { font-size: 15px; color: rgba(242,237,228,0.45); line-height: 1.65; max-width: 420px; }
        .cta-right { display: flex; flex-direction: column; gap: 12px; align-items: flex-end; flex-shrink: 0; }
        .free-badge {
          font-size: 12px; color: rgba(242,237,228,0.3);
          text-align: center; letter-spacing: 0.3px;
        }
 
        /* ── Footer ── */
        .footer {
          padding: 40px 48px; border-top: 1px solid rgba(242,237,228,0.06);
          display: flex; align-items: center; justify-content: space-between;
          max-width: 1200px; margin: 0 auto;
        }
        .footer-logo { font-family: 'Lora', serif; font-size: 16px; font-weight: 500; color: rgba(242,237,228,0.4); }
        .footer-copy { font-size: 13px; color: rgba(242,237,228,0.2); }
        .footer-links { display: flex; gap: 24px; }
        .footer-link { font-size: 13px; color: rgba(242,237,228,0.25); text-decoration: none; transition: color 0.15s; }
        .footer-link:hover { color: rgba(242,237,228,0.5); }
 
        /* ── Fade-in animation ── */
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .fade-up-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-up-2 { animation-delay: 0.25s; opacity: 0; }
        .fade-up-3 { animation-delay: 0.4s; opacity: 0; }
        .fade-up-4 { animation-delay: 0.55s; opacity: 0; }
 
        /* ── Responsive ── */
        @media (max-width: 900px) {
          .hero, .section-inner { padding-left: 24px; padding-right: 24px; }
          .hero-grid { grid-template-columns: 1fr; gap: 48px; }
          .curve-container { display: none; }
          .compare-grid { grid-template-columns: 1fr; }
          .steps-grid { grid-template-columns: 1fr; }
          .step { border-right: none; border-bottom: 1px solid rgba(242,237,228,0.07); }
          .features-grid { grid-template-columns: 1fr 1fr; }
          .feature-cell:nth-child(2n) { border-right: none; }
          .cta-section { flex-direction: column; margin: 0 24px 48px; padding: 48px 32px; }
          .cta-right { align-items: flex-start; }
          .stats-strip { padding: 48px 24px; }
          .stat-item { padding: 0 16px; }
          .footer { flex-direction: column; gap: 20px; text-align: center; }
          .footer-links { justify-content: center; }
          .nav { padding: 0 24px; }
          .divider { margin: 0 24px; }
        }
        @media (max-width: 600px) {
          .features-grid { grid-template-columns: 1fr; }
          .feature-cell:nth-child(n) { border-right: none; }
          .science-grid { grid-template-columns: 1fr; }
          .stats-strip { grid-template-columns: 1fr; }
          .stat-item { border-right: none; border-bottom: 1px solid rgba(242,237,228,0.07); padding: 24px 0; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <a href="#" className="nav-logo">
          <span>O</span>neShot
        </a>
        <div className="nav-links">
          <AuthCta
            signedOutHref={withPostAuthRedirect("/sign-in")}
            className="btn-ghost"
          >
            Sign in
          </AuthCta>
          <AuthCta
            signedOutHref={withPostAuthRedirect("/sign-up")}
            className="btn-amber"
          >
            Get started
          </AuthCta>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section>
        <div className="hero">
          <div className="hero-grid">
            {/* Left */}
            <div>
              <div className="hero-eyebrow fade-up fade-up-1">
                <span className="eyebrow-dot" />
                AI Memory Engine for Engineers
              </div>

              <h1 className="hero-h1 fade-up fade-up-2">
                Read once.
                <br />
                <em>Remember</em> <span className="dim">forever.</span>
              </h1>

              <p className="hero-sub fade-up fade-up-3">
                You can read the same Cloud Computing chapter four times and
                still blank on it the next morning.{" "}
                <strong>
                  OneShot fixes how your brain encodes abstract knowledge
                </strong>{" "}
                — turning invisible, forgettable concepts into memories that
                stick.
              </p>

              <div className="hero-ctas fade-up fade-up-4">
                <AuthCta
                  signedOutHref={withPostAuthRedirect("/sign-up")}
                  className="btn-primary-lg"
                >
                  Start remembering — it's free
                </AuthCta>
                <AuthCta
                  signedOutHref={withPostAuthRedirect("/sign-in")}
                  className="btn-outline"
                >
                  Sign in
                </AuthCta>
              </div>

              <p className="hero-note fade-up fade-up-4">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <circle
                    cx="7"
                    cy="7"
                    r="6"
                    stroke="rgba(242,237,228,0.25)"
                    strokeWidth="1"
                  />
                  <path
                    d="M4.5 7l2 2 3-3"
                    stroke="rgba(242,237,228,0.25)"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                No credit card required. Upload your first notes in 60 seconds.
              </p>
            </div>

            {/* Right — Forgetting Curve */}
            <div className="fade-up fade-up-3">
              <div className="curve-container">
                <p className="curve-title">Memory Retention Over Time</p>
                <ForgettingCurve />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <hr className="divider" />
      <section>
        <div className="stats-strip">
          <div className="stat-item">
            <div className="stat-num">
              <CountUp target={70} suffix="%" />
            </div>
            <div className="stat-label">
              of what you study today is forgotten within 24 hours — without
              active reinforcement.
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-num">
              <CountUp target={4} suffix="×" />
            </div>
            <div className="stat-label">
              better long-term retention with spaced retrieval versus re-reading
              the same material.
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-num">
              <CountUp target={1} />
            </div>
            <div className="stat-label">
              <span
                style={{
                  fontFamily: "Lora, serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "#F2EDE4",
                }}
              >
                read. That's all it should take.
              </span>
            </div>
          </div>
        </div>
      </section>
      <hr className="divider" />

      {/* ── THE PROBLEM ── */}
      <section>
        <div className="section-inner">
          <p className="section-tag">The Problem</p>
          <h2 className="section-h2">
            Some Concepts Stick.
            <br />
            <em>Some Concepts Don't Stick. Here's why.</em>
          </h2>
          <p className="section-lead">
            Your brain isn't broken. Some Concepts are naturally story-like,
            causal, and human-scale. Whereas Some Concepts are invisible,
            layered, and have zero sensory grounding. The encoding problem is
            real — and it's solvable.
          </p>

          {/* Science backing */}
          <div className="science-grid" style={{ marginTop: 40 }}>
            {[
              {
                label: "Ebbinghaus, 1885",
                name: "Forgetting Curve",
                body: "Memory decays exponentially without retrieval. 70% gone in 24 hours. Each review resets the clock and makes memory more stable.",
              },
              {
                label: "Paivio, 1971",
                name: "Dual Coding Theory",
                body: "Information encoded through both verbal and visual channels is retained far better. Analogies and diagrams activate both simultaneously.",
              },
              {
                label: "Sweller, 1988",
                name: "Cognitive Load Theory",
                body: "Working memory handles only 4–7 elements at once. When too many unfamiliar terms pile up, encoding breaks down entirely.",
              },
            ].map((s) => (
              <div className="science-card" key={s.label}>
                <div className="science-label">{s.label}</div>
                <div className="science-name">{s.name}</div>
                <div className="science-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── HOW IT WORKS ── */}
      <section>
        <div className="section-inner" style={{ paddingBottom: 0 }}>
          <p className="section-tag">How It Works</p>
          <h2 className="section-h2" style={{ marginBottom: 0 }}>
            Three steps from <em>upload to memory.</em>
          </h2>
        </div>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "48px 48px 96px",
          }}
        >
          <div className="steps-grid">
            {[
              {
                num: "01",
                icon: "⬆",
                title: "Upload your notes",
                desc: "Drop in any PDF or text file from your lectures or textbooks. The AI reads and extracts every distinct concept, maps dependencies, and detects cognitive load.",
              },
              {
                num: "02",
                icon: "✦",
                title: "AI transforms the concept",
                desc: "Each concept is reborn as an analogy, a visual map, a narrative story, or a simplified breakdown — whichever encoding style best matches how your brain works.",
              },
              {
                num: "03",
                icon: "◎",
                title: "Review before you forget",
                desc: "The forgetting curve engine predicts exactly when your memory will decay. Smart notifications bring you back 2 hours before you would have forgotten.",
              },
            ].map((s, i) => (
              <div className="step" key={i}>
                <div className="step-num">{s.num}</div>
                <div className="step-icon-wrap">{s.icon}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="divider" />

      {/* ── FEATURES ── */}
      <section>
        <div className="section-inner">
          <p className="section-tag">Features</p>
          <h2 className="section-h2">
            Built from research,
            <br />
            <em>not guesswork.</em>
          </h2>
          <p className="section-lead">
            Every feature maps directly to a cognitive science finding about how
            human memory actually works.
          </p>

          {/* Transform modes */}
          <div className="modes-row">
            {[
              { icon: "◉", label: "Analogy mode", active: true },
              { icon: "⬡", label: "Visual map", active: false },
              { icon: "◈", label: "Story mode", active: false },
              { icon: "≡", label: "Simplified", active: false },
            ].map((m) => (
              <div
                className={`mode-pill${m.active ? " amber-pill" : ""}`}
                key={m.label}
              >
                <span className="pill-icon">{m.icon}</span>
                {m.label}
              </div>
            ))}
            <div
              style={{
                padding: "10px 18px",
                fontSize: 13,
                color: "rgba(242,237,228,0.25)",
                alignSelf: "center",
              }}
            >
              — auto-selected based on your learning profile
            </div>
          </div>

          <div className="features-grid">
            {[
              {
                glyph: "⏱",
                title: "Forgetting Prediction",
                desc: '"You will forget this concept in 6 hours." Powered by the Ebbinghaus half-life model. Never get blindsided before an exam again.',
              },
              {
                glyph: "✦",
                title: "Concept Transformation",
                desc: "Every abstract idea gets recast as an analogy, visual flow, story, or simplified breakdown. The format your brain prefers is chosen automatically.",
              },
              {
                glyph: "⚡",
                title: "Cognitive Load Analyzer",
                desc: "Detects when a session has too many new terms or missing prerequisites. Splits overloaded material into manageable chunks automatically.",
              },
              {
                glyph: "◎",
                title: "SM-2 Spaced Repetition",
                desc: "The same algorithm behind Anki. Each quiz response adjusts your review schedule — harder concepts come back sooner, mastered ones space out.",
              },
              {
                glyph: "📊",
                title: "Retrieval Strength Score",
                desc: 'Not "chapter completed" — actual memory strength measured through delayed recall, accuracy, and response latency across all your attempts.',
              },
              {
                glyph: "🧠",
                title: "Personalized Memory Profile",
                desc: "Over time OneShot learns which transform styles work for you, which subjects decay fastest, and adapts every session to your unique encoding patterns.",
              },
            ].map((f) => (
              <div className="feature-cell" key={f.title}>
                <span className="feature-glyph">{f.glyph}</span>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Quote */}
          <div
            className="quote-block"
            style={{
              marginTop: 72,
              marginBottom: 0,
              marginLeft: 0,
              maxWidth: "100%",
            }}
          >
            <div className="quote-text">
              "I could read the OSI model four times and forget it the next
              morning. First time I used OneShot's analogy mode, I explained it
              to my roommate from memory three days later without looking at a
              single note."
            </div>
            <div className="quote-attr">
              — 6th Semester, Computer Science Engineering
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section>
        <div className="cta-section">
          <div className="cta-left">
            <h2 className="cta-h2">
              Your exam is in 3 days.
              <br />
              <em>Stop re-reading. Start remembering.</em>
            </h2>
            <p className="cta-sub">
              Upload your DBMS or Cloud Computing notes right now. In 60
              seconds, every concept you've been struggling with will have an
              analogy your brain actually wants to keep.
            </p>
          </div>
          <div className="cta-right">
            <AuthCta
              signedOutHref={withPostAuthRedirect("/sign-up")}
              className="btn-primary-lg"
            >
              Create free account →
            </AuthCta>
            <AuthCta
              signedOutHref={withPostAuthRedirect("/sign-in")}
              className="btn-outline"
              style={{
                textAlign: "center",
                padding: "12px 32px",
                fontSize: 14,
              }}
            >
              Already have an account
            </AuthCta>
            <p className="free-badge">
              Free to start · No credit card · 60 seconds to your first session
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="footer">
          <span className="footer-logo">OneShot</span>
          <div className="footer-links">
            <a href="#" className="footer-link">
              About
            </a>
            <Link href="/sign-in" className="footer-link">
              Sign in
            </Link>
          </div>
          <span className="footer-copy">
            © 2025 OneShot. Built for Students by a Student.
          </span>
        </div>
      </footer>
    </>
  );
}
