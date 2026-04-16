"use client";

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
    </>
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
      <g transform={transform || undefined}>
        {/* The "hole" — filled with the page background color so it blends. */}
        <polygon
          points="0,100 0,0 10,18 26,12 34,26 48,20 56,38 72,30 78,48 96,42 100,100"
          fill="var(--background, #0a0a0f)"
        />
        {/* Thin crack edge along the broken boundary. */}
        <polyline
          points="0,0 10,18 26,12 34,26 48,20 56,38 72,30 78,48 96,42"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Inner highlight for depth. */}
        <polyline
          points="2,3 11,19 27,13 35,27 49,21 57,39 73,31 79,49 95,43"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.3"
          strokeLinejoin="round"
        />
        {/* Hairline fractures extending into the surviving container surface. */}
        <g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" strokeLinecap="round">
          <path d="M 34 26 L 42 38 L 50 50" />
          <path d="M 56 38 L 66 52 L 74 68" />
          <path d="M 78 48 L 86 62" />
          <path d="M 48 20 L 52 8" />
        </g>
      </g>
    </svg>
  );
}
