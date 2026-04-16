"use client";

import { useEffect, useRef } from "react";

/**
 * Destruction overlay — renders "broken chips" that appear as if pieces of
 * the container were physically knocked off. Each chip has:
 *   - A dark fill matching the page background (looks like a hole)
 *   - A jagged inner edge drawn as a thin light line to mimic a glass fracture
 *   - Hairline fractures radiating from the chip into the container
 *
 * Positioned at specific corners/edges so they don't obscure interactive
 * elements. Higher chaos levels reveal additional chips. No red tint, no
 * color overlay — the effect is purely structural.
 */
export function CracksOverlay() {
  return (
    <>
      <BorderWobbleFilter />
      <MatrixRain />
      <div className="pg-chip pg-chip-1" data-chaos-min="3">
        <ChipShape flipX={true} flipY={true} />
      </div>
      <div className="pg-chip pg-chip-2" data-chaos-min="4">
        <ChipShape flipX={true} flipY={false} />
      </div>
      <div className="pg-chip pg-chip-3" data-chaos-min="5">
        <ChipShape flipX={false} flipY={false} />
      </div>
      <FloatingDebris />
      <CursorTrail />
      <VhsTrackingBars />
      <NoiseBursts />
    </>
  );
}

/**
 * Invisible SVG that defines the feTurbulence + feDisplacementMap filter
 * referenced by CSS (url(#pg-border-wobble)) on the container. The turbulence
 * seed animates to create continuous displacement.
 */
function BorderWobbleFilter() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <filter id="pg-border-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="3">
            <animate
              attributeName="baseFrequency"
              dur="10s"
              values="0.008 0.012;0.012 0.008;0.008 0.012"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="1" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Matrix-style falling character rain. Several columns of random glyphs drift
 * downward at different speeds. Visible only at chaos 4+.
 */
function MatrixRain() {
  // Columns are positioned at fixed percentages across the container so
  // they stay evenly distributed regardless of width.
  const cols = Array.from({ length: 12 }, (_, i) => {
    const left = (i / 12) * 100 + (i * 3) % 7;
    const speed = 2.5 + (i % 4) * 0.9; // seconds per cycle
    const delay = (i * 0.3) % 3;
    return { left, speed, delay, i };
  });
  // Characters pool — small glyphs that suggest code/noise.
  const glyphPool = "01アイウエオカキクケコサシスセソ░▒▓<>/\\|{}+=?!@#".split("");
  const makeStream = (len: number, seed: number) =>
    Array.from({ length: len }, (_, i) => glyphPool[(seed * 7 + i * 13) % glyphPool.length]).join("\n");
  return (
    <div className="pg-matrix-rain" aria-hidden>
      {cols.map((c) => (
        <div
          key={c.i}
          className="pg-rain-col"
          style={{
            left: `${c.left}%`,
            animationDuration: `${c.speed}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          {makeStream(40, c.i + 1)}
        </div>
      ))}
    </div>
  );
}

/**
 * Leaves a trail of fading particles behind the cursor when hovering the
 * container. Canvas-based so drawing is cheap even at 60fps. Intensity is
 * multiplied by --fx-cursortrail (default 1).
 */
function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const root = canvas.parentElement;
    if (!root) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: { x: number; y: number; life: number; vx: number; vy: number }[] = [];
    let rafId = 0;

    const resize = () => {
      const r = root.getBoundingClientRect();
      canvas.width = r.width * window.devicePixelRatio;
      canvas.height = r.height * window.devicePixelRatio;
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(root);

    const onMove = (e: MouseEvent) => {
      const intensity = getFxIntensity(root, "cursortrail");
      const chaos = Number(root.getAttribute("data-chaos") ?? 0);
      if (intensity <= 0 || chaos < 3) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const count = Math.round(intensity * (chaos >= 5 ? 3 : 2));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 4,
          life: 1,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
        });
      }
      if (particles.length > 200) particles = particles.slice(-200);
    };
    root.addEventListener("mousemove", onMove);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles = particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        return p.life > 0;
      });
      for (const p of particles) {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.5})`;
        ctx.fillRect(p.x, p.y, 2, 2);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      root.removeEventListener("mousemove", onMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="pg-cursor-trail" aria-hidden />;
}

/**
 * VHS tracking bars: a thin horizontal band that slowly scrolls vertically
 * across the container, with a subtle displacement (shifted color channels
 * and slight blur). Visible at chaos 3+.
 */
function VhsTrackingBars() {
  return (
    <>
      <div className="pg-vhs-bar pg-vhs-bar-1" aria-hidden />
      <div className="pg-vhs-bar pg-vhs-bar-2" aria-hidden />
    </>
  );
}

/**
 * Pixel noise bursts: brief rectangular patches of static that appear at
 * random positions. Each is a <div> with a repeating noise background. Four
 * staggered elements so the timing feels unpredictable.
 */
function NoiseBursts() {
  return (
    <>
      <div className="pg-noise-burst pg-noise-burst-1" aria-hidden />
      <div className="pg-noise-burst pg-noise-burst-2" aria-hidden />
      <div className="pg-noise-burst pg-noise-burst-3" aria-hidden />
      <div className="pg-noise-burst pg-noise-burst-4" aria-hidden />
    </>
  );
}

function getFxIntensity(el: HTMLElement, key: string): number {
  const raw = getComputedStyle(el).getPropertyValue(`--fx-${key}`).trim();
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1;
}

/**
 * A cluster of small particles that drift slowly across the container.
 * Visible only at high chaos levels via CSS opacity toggles. Each particle
 * is an SVG rect with its own randomized drift animation (offset by delay).
 */
function FloatingDebris() {
  // Pre-compute particle positions so the React tree is stable across renders.
  // Deterministic by using a simple seed.
  const particles = Array.from({ length: 14 }, (_, i) => {
    const seed = i * 0.618;
    const left = (seed * 100) % 100;
    const top = ((seed * 73) % 100);
    const delay = (i * 0.7) % 6;
    const duration = 6 + ((i * 1.3) % 5);
    const size = 1.5 + ((i * 0.4) % 2);
    return { left, top, delay, duration, size, i };
  });
  return (
    <div className="pg-debris-field" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.i}
          className="pg-debris"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * A realistic radial crack. Rendered as a small dark impact point with
 * several thin white lines radiating outward and branching. No jagged
 * polygon, no chipped chunk — this reads as glass fractured by an impact.
 *
 * The SVG viewBox is 100x100 with the impact point at (50, 50). flipX/flipY
 * mirror the geometry so the same crack asset works at any corner.
 */
function ChipShape({ flipX, flipY }: { flipX: boolean; flipY: boolean }) {
  const transform = [
    flipX ? "scale(-1 1) translate(-100 0)" : "",
    flipY ? "scale(1 -1) translate(0 -100)" : "",
  ].filter(Boolean).join(" ");
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <defs>
        <filter id="pg-crack-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>
      <g transform={transform || undefined}>
        {/* Impact point — small dark crater with a halo. */}
        <circle cx="50" cy="50" r="4" fill="rgba(0,0,0,0.75)" />
        <circle cx="50" cy="50" r="2" fill="#000" />
        <circle cx="50" cy="50" r="5.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />

        {/* Primary radiating fractures — 7 lines fanning from impact. Each
            line tapers: starts thick near impact, thin at the tip. */}
        <g stroke="#ffffff" strokeLinecap="round" fill="none">
          {/* Upper-left long crack */}
          <path d="M 50 50 L 42 42 L 30 28 L 18 14 L 8 6" strokeWidth="1.1" opacity="0.9" />
          <path d="M 30 28 L 22 22" strokeWidth="0.5" opacity="0.6" />
          <path d="M 18 14 L 10 18" strokeWidth="0.4" opacity="0.5" />

          {/* Upper-right medium */}
          <path d="M 50 50 L 56 40 L 66 28 L 78 14 L 94 4" strokeWidth="0.9" opacity="0.85" />
          <path d="M 66 28 L 74 28" strokeWidth="0.4" opacity="0.5" />

          {/* Upper short */}
          <path d="M 50 50 L 50 36 L 46 22 L 44 8" strokeWidth="0.7" opacity="0.7" />

          {/* Right horizontal */}
          <path d="M 50 50 L 62 52 L 76 54 L 90 58" strokeWidth="0.8" opacity="0.8" />
          <path d="M 76 54 L 82 48" strokeWidth="0.35" opacity="0.5" />

          {/* Lower-right long */}
          <path d="M 50 50 L 58 58 L 66 72 L 78 88 L 92 98" strokeWidth="1" opacity="0.9" />
          <path d="M 66 72 L 72 70" strokeWidth="0.45" opacity="0.55" />
          <path d="M 78 88 L 84 84" strokeWidth="0.35" opacity="0.5" />

          {/* Lower short */}
          <path d="M 50 50 L 48 60 L 46 72 L 44 88" strokeWidth="0.7" opacity="0.75" />

          {/* Lower-left medium */}
          <path d="M 50 50 L 42 56 L 30 66 L 16 78 L 6 90" strokeWidth="0.85" opacity="0.85" />
          <path d="M 30 66 L 26 74" strokeWidth="0.4" opacity="0.55" />

          {/* Left horizontal */}
          <path d="M 50 50 L 38 50 L 22 48 L 6 44" strokeWidth="0.8" opacity="0.8" />
          <path d="M 22 48 L 16 54" strokeWidth="0.35" opacity="0.5" />
        </g>

        {/* A few concentric micro-arcs near the impact for the "stressed glass" look. */}
        <g stroke="rgba(255,255,255,0.45)" strokeWidth="0.3" fill="none">
          <path d="M 44 48 Q 50 44 56 48" />
          <path d="M 44 52 Q 50 56 56 52" />
          <path d="M 43 50 Q 45 45 50 44" />
        </g>
      </g>
    </svg>
  );
}
