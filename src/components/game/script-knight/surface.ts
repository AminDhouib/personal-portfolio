// The game surface (floor, event log, result card, editor) is a fixed dark panel in both site
// themes, the way the other games keep a dark playfield. It redefines the colour tokens inside it,
// so text written with `text-(--foreground)` or `text-(--muted)` stays legible when the page is
// light. Copy outside the surface keeps the site's themed tokens.
export const GAME_SURFACE =
  "bg-[#0b0f14] text-[#ededed] [--foreground:#ededed] [--muted:#a1a1aa] [--border:#334155]";

// Every control the player taps is at least 44 px square on a coarse pointer.
export const TOUCH = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

/**
 * The surface's colours as values, for code that cannot use the class string (the CodeMirror
 * theme). `GAME_SURFACE` above stays a literal so Tailwind sees its classes; a test ties the two.
 */
export const SURFACE_COLORS = {
  background: "#0b0f14",
  text: "#ededed",
  muted: "#a1a1aa",
  border: "#334155",
} as const;
