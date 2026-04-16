"use client";

/**
 * Glass-crack overlays. Each crack is a localized impact point with radiating
 * fractures, positioned in a specific corner of the container. Higher chaos
 * levels reveal additional cracks.
 *
 * No red tint, no color overlay — the effect should feel like the glass over
 * the game has been struck, not that the game itself is in error.
 *
 * Each crack is wrapped in a container with a data attribute so CSS can show
 * them progressively based on the parent's data-chaos.
 */
export function CracksOverlay() {
  return (
    <>
      {/* Crack 1: top-right corner. Appears at chaos 3. */}
      <div className="pg-crack pg-crack-1" data-chaos-min="3">
        <GlassCrack />
      </div>
      {/* Crack 2: bottom-left corner. Appears at chaos 4. */}
      <div className="pg-crack pg-crack-2" data-chaos-min="4">
        <GlassCrack />
      </div>
      {/* Crack 3: center-right edge. Appears at chaos 5. */}
      <div className="pg-crack pg-crack-3" data-chaos-min="5">
        <GlassCrack />
      </div>
    </>
  );
}

/**
 * A single glass-crack impact pattern. Rendered as a small SVG (viewBox 100x100)
 * that's positioned and scaled by the parent container's CSS. Strokes are
 * white + dark shadow to simulate depth against either dark or light themes.
 */
function GlassCrack() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <defs>
        <filter id="pg-crack-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.4" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
      <g filter="url(#pg-crack-shadow)" fill="none" strokeLinecap="round">
        {/* Impact point (tiny dark spot). */}
        <circle cx="50" cy="50" r="1.2" fill="#0008" stroke="none" />
        {/* Primary radiating fractures from impact. */}
        <g stroke="#fff" strokeWidth="0.7">
          <path d="M 50 50 L 18 14" />
          <path d="M 50 50 L 78 20" />
          <path d="M 50 50 L 90 55" />
          <path d="M 50 50 L 70 88" />
          <path d="M 50 50 L 20 86" />
          <path d="M 50 50 L 8 55" />
        </g>
        {/* Secondary hairline fractures — shorter, branching off primaries. */}
        <g stroke="#fff" strokeWidth="0.35" opacity="0.75">
          <path d="M 34 32 L 26 22" />
          <path d="M 66 34 L 72 24" />
          <path d="M 74 62 L 82 68" />
          <path d="M 60 72 L 66 82" />
          <path d="M 32 68 L 24 74" />
          <path d="M 26 50 L 16 48" />
          <path d="M 40 24 L 34 12" />
          <path d="M 74 46 L 84 40" />
        </g>
        {/* Concentric micro-cracks around impact — tiny arcs. */}
        <g stroke="#fff" strokeWidth="0.25" opacity="0.55">
          <path d="M 46 46 Q 50 43 54 46" />
          <path d="M 44 54 Q 50 57 56 54" />
          <path d="M 44 50 Q 44 47 46 45" />
        </g>
      </g>
    </svg>
  );
}
