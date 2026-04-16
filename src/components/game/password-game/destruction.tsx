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
export function CracksOverlay({ seed = 0 }: { seed?: number }) {
  // Derive per-chip visual jitter from the seed so runs don't look identical.
  const variant = (n: number) => {
    // Bit-mixing so the 3 variants differ even for small seeds.
    const h = ((seed ^ (n * 0x9e3779b1)) * 0x85ebca6b) >>> 0;
    const rotDeg = ((h % 1000) / 1000) * 30 - 15;        // -15° … +15°
    const scaleJitter = 0.9 + ((h >> 10) % 1000) / 1000 * 0.25; // 0.9 … 1.15
    return { rotate: `${rotDeg.toFixed(1)}deg`, scale: scaleJitter.toFixed(2) };
  };
  const v1 = variant(1);
  const v2 = variant(2);
  const v3 = variant(3);
  const v4 = variant(4);
  return (
    <>
      <BorderWobbleFilter />
      <MatrixRain />
      <div
        className="pg-chip pg-chip-1"
        data-chaos-min="3"
        style={{ ["--chip-rot" as string]: v1.rotate, ["--chip-scale" as string]: v1.scale }}
      >
        <ChipShape flipX={true} flipY={true} />
      </div>
      <div
        className="pg-chip pg-chip-2"
        data-chaos-min="4"
        style={{ ["--chip-rot" as string]: v2.rotate, ["--chip-scale" as string]: v2.scale }}
      >
        <ChipShape flipX={true} flipY={false} />
      </div>
      <div
        className="pg-chip pg-chip-3"
        data-chaos-min="5"
        style={{ ["--chip-rot" as string]: v3.rotate, ["--chip-scale" as string]: v3.scale }}
      >
        <ChipShape flipX={false} flipY={false} />
      </div>
      <div
        className="pg-chip pg-chip-4"
        data-chaos-min="5"
        style={{ ["--chip-rot" as string]: v4.rotate, ["--chip-scale" as string]: v4.scale }}
      >
        <ChipShape flipX={true} flipY={false} />
      </div>
      <FractureWeb seed={seed} />
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
/**
 * Full-container fracture web — hairline polylines tracing from corners
 * toward the center, giving a sense that the whole UI has fractured. Visible
 * only at chaos 5 and gated by --fx-crackweb. The fractures are thin and
 * drawn in the background color so they read as structural voids, not lines.
 */
function FractureWeb({ seed }: { seed: number }) {
  // Three polyline paths, seeded-perturbed so each run has its own pattern.
  const jitter = (n: number) => {
    const h = ((seed ^ (n * 0x9e3779b1)) * 0x85ebca6b) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * 8; // ±4% jitter
  };
  const j = [jitter(1), jitter(2), jitter(3), jitter(4), jitter(5), jitter(6)];
  const BG = "var(--background, #0a0a0f)";
  return (
    <svg
      className="pg-fracture-web"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Top-right chip → midway diagonal toward center-left */}
      <polyline
        points={`96,4 ${72 + j[0]},${22 + j[1]} ${55 + j[2]},${38 + j[3]} ${38 + j[4]},${50 + j[5]}`}
        fill="none"
        stroke={BG}
        strokeWidth="0.35"
        strokeLinejoin="miter"
      />
      {/* Bottom-right chip → up-left branching */}
      <polyline
        points={`95,95 ${78 + j[1]},${82 + j[0]} ${65 + j[3]},${70 + j[2]} ${50 + j[5]},${60 + j[4]}`}
        fill="none"
        stroke={BG}
        strokeWidth="0.35"
        strokeLinejoin="miter"
      />
      {/* Left-edge chip → down-right into the center */}
      <polyline
        points={`4,45 ${22 + j[2]},${52 + j[3]} ${40 + j[4]},${60 + j[5]} ${55 + j[0]},${68 + j[1]}`}
        fill="none"
        stroke={BG}
        strokeWidth="0.35"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function ChipShape({ flipX, flipY }: { flipX: boolean; flipY: boolean }) {
  const transform = [
    flipX ? "scale(-1 1) translate(-200 0)" : "",
    flipY ? "scale(1 -1) translate(0 -200)" : "",
  ].filter(Boolean).join(" ");
  const BG = "var(--background, #0a0a0f)";
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" aria-hidden preserveAspectRatio="none">
      <g transform={transform || undefined}>
        {/*
         * Impact point: a small jagged puncture near the crack's origin.
         * This is where the hit happened; primary cracks radiate from here.
         * No stroke — the darkness of the background-colored fill alone
         * creates the gap effect, so it reads as a hole rather than a drawn shape.
         */}
        <polygon
          points="2,0 10,4 8,10 14,8 16,16 6,14 0,18 4,8"
          fill={BG}
        />

        {/*
         * Primary crack — thin slit running from impact to ~(190, 100).
         * Narrower than before (max 3px wide) so it reads as a hairline
         * fissure rather than a gap.
         */}
        <polygon
          points="
            8,8
            22,14
            38,8
            54,22
            72,18
            88,34
            106,30
            122,50
            136,48
            154,68
            170,66
            188,88
            196,100
            192,102
            172,72
            158,74
            138,54
            124,56
            108,36
            92,40
            74,26
            56,28
            40,14
            24,20
            10,12
          "
          fill={BG}
        />
        {/* Strokes removed entirely — the crack reads as pure void.
            The contrast between the card fill and the page-background
            polygon fill is enough to define the shape. */}

        {/*
         * Secondary branch — radiates from impact in a different direction.
         * Creates the spider-web shatter look when paired with the primary.
         */}
        <polygon
          points="
            10,10
            28,30
            22,46
            38,60
            30,78
            48,90
            40,108
            58,122
            48,138
            60,154
            56,170
            68,188
            74,196
            82,194
            74,172
            80,158
            68,142
            74,126
            58,112
            66,96
            52,82
            60,66
            42,52
            48,38
            32,24
          "
          fill={BG}
        />

        {/*
         * Minor branches — short fractures forking off primary cracks at
         * sharp angles. These create the "web" feeling without widening the
         * visible destruction.
         */}
        <g fill={BG}>
          {/* Fork up from primary ~(38, 8) */}
          <polygon points="38,8 44,2 46,4 40,10" />
          {/* Fork up-right from (72, 18) */}
          <polygon points="72,18 86,6 88,8 74,20" />
          {/* Fork down from (88, 34) */}
          <polygon points="88,34 92,48 94,48 90,35" />
          {/* Fork up-right from (122, 50) */}
          <polygon points="122,50 136,38 138,40 124,52" />
          {/* Fork down from (154, 68) */}
          <polygon points="154,68 160,82 162,82 156,68" />
          {/* Fork off secondary at (38, 60) */}
          <polygon points="38,60 52,58 52,60 40,62" />
          {/* Fork off secondary at (48, 90) */}
          <polygon points="48,90 62,88 62,90 50,92" />
        </g>

        {/*
         * Tiny "shattered" triangular pieces — near crack intersections
         * where the card material is completely dislodged. Black fill so
         * they look truly missing.
         */}
        <g fill={BG}>
          <polygon points="54,22 60,20 58,26" />
          <polygon points="106,30 110,30 108,36" />
          <polygon points="138,48 142,46 140,52" />
          <polygon points="40,108 44,106 44,110" />
          <polygon points="60,154 64,152 62,156" />
        </g>

        {/*
         * Surface hairline fractures — thin white lines NOT filled with
         * background (these are stress marks on the glass, not through-cracks).
         */}
        {/* Surface hairline strokes removed — were reading as drawn lines. */}
      </g>
    </svg>
  );
}
