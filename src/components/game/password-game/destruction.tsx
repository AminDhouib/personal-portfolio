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
 * A jagged crack that cuts THROUGH the container — the fill is the page
 * background color, so it looks like the card material physically split
 * open and you can see through to the dark page behind. Thin white
 * highlights on the edges sell the glass-fracture look.
 *
 * Each crack SVG covers a 200x200 area with the crack running from the
 * top-left to the bottom-right as a thin zig-zag polygon. flipX/flipY
 * orient the crack for each corner so the lines come from the edge inward.
 */
function ChipShape({ flipX, flipY }: { flipX: boolean; flipY: boolean }) {
  const transform = [
    flipX ? "scale(-1 1) translate(-200 0)" : "",
    flipY ? "scale(1 -1) translate(0 -200)" : "",
  ].filter(Boolean).join(" ");
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden preserveAspectRatio="none">
      <g transform={transform || undefined}>
        {/*
         * Main crack polygon.
         * Two parallel zig-zag paths (the crack's two edges), joined to form
         * a thin slit that cuts from (0, 0) through the container to
         * roughly (180, 180). The polygon is ~4-8px wide at SVG scale.
         *
         * Tracing clockwise, upper edge first, then lower edge reversed:
         *   upper edge: along the crack's "top" side
         *   lower edge: along the crack's "bottom" side, returning
         */}
        <polygon
          points="
            0,0
            18,10
            34,4
            52,22
            70,16
            86,38
            104,30
            120,52
            134,46
            152,72
            168,64
            186,92
            200,100
            200,108
            190,108
            172,80
            156,86
            138,60
            124,66
            108,42
            90,50
            74,28
            58,32
            40,14
            22,20
            6,8
          "
          fill="var(--background, #0a0a0f)"
        />

        {/* Upper white highlight edge — thin stroke showing the glass fracture. */}
        <polyline
          points="0,0 18,10 34,4 52,22 70,16 86,38 104,30 120,52 134,46 152,72 168,64 186,92 200,100"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
          strokeLinejoin="miter"
          strokeLinecap="round"
        />
        {/* Lower highlight edge. */}
        <polyline
          points="6,8 22,20 40,14 58,32 74,28 90,50 108,42 124,66 138,60 156,86 172,80 190,108"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.5"
          strokeLinejoin="miter"
        />

        {/* Secondary branching cracks — shorter thin slits veering off at angles. */}
        <polygon
          points="70,16 66,4 72,3 78,14 74,15"
          fill="var(--background, #0a0a0f)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.4"
        />
        <polygon
          points="120,52 132,42 135,46 124,56"
          fill="var(--background, #0a0a0f)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.4"
        />
        <polygon
          points="86,38 82,52 86,54 92,40"
          fill="var(--background, #0a0a0f)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.4"
        />
        <polygon
          points="152,72 162,86 166,84 156,70"
          fill="var(--background, #0a0a0f)"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.4"
        />
      </g>
    </svg>
  );
}
