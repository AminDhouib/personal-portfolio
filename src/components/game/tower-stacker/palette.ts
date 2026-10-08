// Tower Stacker's blueprint palette. The game keeps these colours in both site
// themes (DESIGN.md, Tower Stacker keeps its blueprint palette in both themes).

export const PALETTE = {
  field: "#05070d",
  grid: "rgba(148,163,184,0.06)",
  /** slate-400 */
  slabStroke: "#94a3b8",
  /** slate-500 at 18% */
  hatch: "rgba(100,116,139,0.18)",
  /** The site's accent red: the hanging block, the perfect pulse, the dimension callout. */
  accent: "#ef4444",
  crane: "#64748b",
  caption: "rgba(148,163,184,0.7)",
  /** One tint per swing tone (PALETTE_SIZE entries). */
  tones: ["#16213a", "#1b2a3f", "#222338", "#162e36", "#252733", "#1d2c40"],
} as const;

/** Spacing of the background grid, in css pixels. */
export const GRID_PX = 24;
