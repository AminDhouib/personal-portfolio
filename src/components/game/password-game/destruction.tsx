"use client";

/**
 * Decorative SVG overlay that renders progressively more cracks as the chaos
 * level rises. The opacity is driven by the data-chaos attribute on the
 * enclosing .pg-chaos-root (see destruction.css).
 *
 * Cracks are pure SVG paths — no external assets, no state.
 */
export function CracksOverlay() {
  return (
    <svg
      className="pg-cracks"
      viewBox="0 0 400 400"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g stroke="#ff3355" strokeLinecap="round" fill="none" opacity="0.95">
        {/* Short cracks — visible from level 3 (via CSS opacity). */}
        <path d="M 60 20 L 72 40 L 70 60" strokeWidth="1.6" />
        <path d="M 330 25 L 340 48 L 332 68" strokeWidth="1.6" />
        <path d="M 20 150 L 45 165 L 55 190" strokeWidth="1.4" />
        <path d="M 370 180 L 355 200 L 360 225" strokeWidth="1.4" />

        {/* Medium cracks — more visible at level 4. */}
        <path d="M 100 10 L 120 45 L 115 85 L 135 120" strokeWidth="2.2" />
        <path d="M 280 380 L 265 340 L 280 300 L 270 260" strokeWidth="2.2" />
        <path d="M 380 60 L 350 100 L 360 140" strokeWidth="1.9" />

        {/* Large jagged cracks — dominant at level 5. */}
        <path
          d="M 0 90 L 30 100 L 60 85 L 95 110 L 130 95 L 170 130 L 200 115 L 240 150 L 280 135 L 320 165 L 360 150 L 400 175"
          strokeWidth="2.6"
        />
        <path
          d="M 200 0 L 210 35 L 195 70 L 215 105 L 200 140 L 220 175 L 205 210 L 225 245"
          strokeWidth="2.4"
        />
        <path
          d="M 0 300 L 40 290 L 80 310 L 120 295 L 160 315 L 200 300 L 240 320 L 280 305"
          strokeWidth="2.1"
        />
      </g>
    </svg>
  );
}
