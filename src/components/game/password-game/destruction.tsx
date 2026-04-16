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
 * A single "broken chip" shape. Rendered as inline SVG so the polygon and
 * stroke are drawn as one unit.
 *
 * Anatomy:
 *  - <polygon fill="var(--background)"> : the missing piece (dark hole).
 *  - <polyline stroke="..."> : the jagged glass-edge highlight.
 *  - <path stroke="..."> : hairline fractures extending from the chip.
 */
function ChipShape({ flipX, flipY }: { flipX: boolean; flipY: boolean }) {
  // The chip occupies the bottom-left corner of the SVG viewBox (100x100),
  // with jagged teeth along its exposed edge. flipX / flipY mirror it so we
  // can reuse the same geometry for the opposite corners.
  const transform = `${flipX ? "scale(-1 1) translate(-100 0)" : ""} ${flipY ? "scale(1 -1) translate(0 -100)" : ""}`.trim();
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="pg-chip-depth" cx="30%" cy="70%" r="75%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
          <stop offset="70%" stopColor="var(--background, #0a0a0f)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--background, #0a0a0f)" stopOpacity="1" />
        </radialGradient>
      </defs>
      <g transform={transform || undefined}>
        {/* The "hole" — filled with the page background color plus a radial
            darkening to suggest the chip recedes inward. */}
        <polygon
          points="0,100 0,0 6,14 14,8 22,20 30,10 38,22 44,16 52,30 60,18 66,36 74,24 82,42 88,32 95,46 100,38 100,100"
          fill="var(--background, #0a0a0f)"
        />
        <polygon
          points="0,100 0,0 6,14 14,8 22,20 30,10 38,22 44,16 52,30 60,18 66,36 74,24 82,42 88,32 95,46 100,38 100,100"
          fill="url(#pg-chip-depth)"
        />
        {/* Thin crack edge along the broken boundary. */}
        <polyline
          points="0,0 6,14 14,8 22,20 30,10 38,22 44,16 52,30 60,18 66,36 74,24 82,42 88,32 95,46 100,38"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="0.9"
          strokeLinejoin="miter"
          strokeLinecap="round"
        />
        {/* Inner highlight for depth — offset 1-2px inward. */}
        <polyline
          points="2,4 7,15 15,10 23,21 31,12 39,23 45,18 53,31 61,20 67,37 75,26 83,43 89,34 94,46"
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="0.35"
          strokeLinejoin="miter"
        />
        {/* Hairline fractures extending into the surviving container surface. */}
        <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.28" strokeLinecap="round">
          <path d="M 22 20 L 30 34 L 38 50" />
          <path d="M 38 22 L 48 40 L 54 58" />
          <path d="M 52 30 L 62 48 L 68 66" />
          <path d="M 66 36 L 76 54 L 82 72" />
          <path d="M 82 42 L 90 60 L 96 80" />
          <path d="M 44 16 L 46 6" />
          <path d="M 60 18 L 66 4" />
          <path d="M 88 32 L 96 20" />
        </g>
        {/* Even finer micro-fractures — barely visible. */}
        <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.18" strokeLinecap="round">
          <path d="M 30 34 L 34 42" />
          <path d="M 48 40 L 52 48" />
          <path d="M 62 48 L 66 56" />
          <path d="M 76 54 L 80 62" />
          <path d="M 42 38 L 38 44" />
          <path d="M 58 46 L 54 52" />
          <path d="M 70 58 L 66 64" />
        </g>
        {/* Debris shards — tiny polygons scattered around the chip as if
            material ejected from the impact. */}
        <g fill="rgba(255,255,255,0.45)">
          <polygon points="34,52 36,55 33,57" />
          <polygon points="56,62 58,64 55,66" />
          <polygon points="72,74 74,76 71,78" />
          <polygon points="88,58 90,60 87,62" />
          <polygon points="42,68 43,70 41,71" />
          <polygon points="60,80 62,82 59,83" />
        </g>
        <g fill="rgba(255,255,255,0.25)">
          <circle cx="46" cy="60" r="0.6" />
          <circle cx="64" cy="72" r="0.5" />
          <circle cx="80" cy="66" r="0.6" />
          <circle cx="52" cy="76" r="0.4" />
          <circle cx="78" cy="84" r="0.5" />
          <circle cx="36" cy="78" r="0.4" />
        </g>
      </g>
    </svg>
  );
}
