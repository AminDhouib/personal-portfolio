import { BOARD_FRAME_CSS } from "./board-size";

// ---------------------------------------------------------------------------
// Inlined utility styles (from upstream src/styles/globals.css and
// tailwind.config.js). Rendered once on mount and scoped by class name so
// we don't pollute the global stylesheet across the portfolio.
// ---------------------------------------------------------------------------

export const SCOPED_STYLES = `
.svf-root {
  --svf-n: 5;
  --svf-tile: 40px;
  --svf-gap: 16px;
}
${BOARD_FRAME_CSS}
.svf-root { font-family: var(--font-voltorb-ds), ui-monospace, monospace; color: #fff; background-color: #58a66c; }
.svf-root *, .svf-root *::before, .svf-root *::after { box-sizing: border-box; text-rendering: geometricPrecision; }
.svf-root .text-shadow-white {
  text-shadow: 2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff, 1px 1px #fff,
    -1px -1px #fff, 1px -1px #fff, -1px 1px #fff;
}
.svf-root .picture-outline {
  -webkit-filter: drop-shadow(1px 1px white) drop-shadow(-1px -1px white)
    drop-shadow(1px -1px white) drop-shadow(-1px 1px white);
  filter: drop-shadow(1px 1px white) drop-shadow(-1px -1px white)
    drop-shadow(1px -1px white) drop-shadow(-1px 1px white);
}
.svf-root .voltorb { height: 28px; width: 28px; }
.svf-root .rounded-5 { border-radius: 5px; }
.svf-root .drop-shadow-default {
  filter: drop-shadow(1px 1px 0 rgba(0,0,0,1)) drop-shadow(1px 1px 0 rgba(75,85,99,1));
}
.svf-root .drop-shadow-soft {
  filter: drop-shadow(1px 1px 0 rgba(75,85,99,.25)) drop-shadow(2px 2px 0 rgba(75,85,99,.25));
}
/* Row/col colored connector bars linking adjacent tiles (matches Pokémon HG/SS).
   Gap between tile wrappers is 16px; we center the bar at +8 (the midpoint).
   Tile outline is 4px, so bar overlaps each adjacent tile's outline by a few
   pixels to sit flush against the tile bodies like the reference. */
/* Bars span slightly past the 16px gap so their ends tuck under each
   adjacent tile/clue-card outline (z-index 0 keeps them behind the tile
   bodies — the reference shows the bar visually ending inside the frame). */
.svf-root .svf-conn-e {
  position: absolute;
  right: calc(-1 * var(--svf-gap) - 1px);
  top: 50%;
  width: calc(var(--svf-gap) + 2px);
  height: 8px;
  transform: translateY(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 0 1px 0 #e5e7eb, 0 -1px 0 #e5e7eb;
}
.svf-root .svf-conn-s {
  position: absolute;
  bottom: calc(-1 * var(--svf-gap) - 1px);
  left: 50%;
  height: calc(var(--svf-gap) + 2px);
  width: 8px;
  transform: translateX(-50%);
  z-index: 0;
  pointer-events: none;
  box-shadow: 1px 0 0 #e5e7eb, -1px 0 0 #e5e7eb;
}
/* Cursor/hover selection — matches the red frame on the active tile in HG/SS.
   Two overlapping shadows give the pixel-art look: dark inner hairline +
   solid red outside. */
.svf-root .svf-tile-wrap::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px #6a0a0a, 0 0 0 4px #ef2020;
  opacity: 0;
  transition: opacity 80ms ease-out;
  pointer-events: none;
  z-index: 3;
}
.svf-root .svf-tile-wrap:hover::before,
.svf-root .svf-tile-wrap:focus-visible::before {
  opacity: 1;
}
.svf-root .svf-coin {
  image-rendering: pixelated;
  shape-rendering: crispEdges;
  animation: svf-coin-spin 1.3s steps(1, end) infinite;
  transform-origin: center center;
}
/* Peek mode: force every tile to its face-up state with no flip animation.
   Used by the debug panel to preview the whole board without disturbing
   game state (cells.isFlipped stays unchanged). */
.svf-root .svf-peek .svf-tile-wrap > div {
  transition-duration: 0ms !important;
}
.svf-root .svf-modal-backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(1px);
}
.svf-root .svf-modal-open {
  animation: svf-modal-backdrop-in 220ms ease-out both;
}
.svf-root .svf-modal-open .svf-modal-card {
  animation: svf-modal-card-in 320ms cubic-bezier(0.22, 1.4, 0.36, 1) both;
}
.svf-root .svf-modal-closing {
  animation: svf-modal-backdrop-out 180ms ease-in both;
}
.svf-root .svf-modal-closing .svf-modal-card {
  animation: svf-modal-card-out 180ms ease-in both;
}
@keyframes svf-modal-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes svf-modal-backdrop-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes svf-modal-card-in {
  0%   { transform: translateY(-18px) scale(0.92); opacity: 0; }
  60%  { transform: translateY(4px)   scale(1.02); opacity: 1; }
  100% { transform: translateY(0)     scale(1);    opacity: 1; }
}
@keyframes svf-modal-card-out {
  from { transform: scale(1);    opacity: 1; }
  to   { transform: scale(0.92); opacity: 0; }
}
@keyframes svf-coin-spin {
  0%   { transform: scaleX(1);    }
  16%  { transform: scaleX(0.7);  }
  32%  { transform: scaleX(0.25); }
  48%  { transform: scaleX(-0.4); }
  64%  { transform: scaleX(-0.9); }
  80%  { transform: scaleX(-0.4); }
  100% { transform: scaleX(1);    }
}
/* Level transition flashes — keyed by .svf-lv-flash-up / -down.
   Rest stops are the banner's #3D7757, not the board's sprite-palette
   #448563: the banner green is darkened so its white 12px text clears the
   4.5:1 floor (white on #448563 is only 4.42:1). Board tiles keep #448563. */
.svf-lv-flash-up   { animation: svf-lv-flash-up   1.1s ease-out 1 both; }
.svf-lv-flash-down { animation: svf-lv-flash-down 1.1s ease-out 1 both; }
@keyframes svf-lv-flash-up {
  0%   { background-color: #3D7757; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); transform: scale(1); }
  20%  { background-color: #4ade80; box-shadow: 0 0 0 6px rgba(74, 222, 128, 0.55); transform: scale(1.18); }
  60%  { background-color: #6ee08e; box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.20); transform: scale(1.06); }
  100% { background-color: #3D7757; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); transform: scale(1); }
}
@keyframes svf-lv-flash-down {
  0%   { background-color: #3D7757; box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); transform: scale(1); }
  20%  { background-color: #b45353; box-shadow: 0 0 0 6px rgba(248, 113, 113, 0.55); transform: scale(0.94) rotate(-1.5deg); }
  60%  { background-color: #6e4848; box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.20); transform: scale(0.98) rotate(0.5deg); }
  100% { background-color: #3D7757; box-shadow: 0 0 0 0 rgba(248, 113, 113, 0); transform: scale(1); }
}

/* Risk-warning tile shake — keyed by .svf-tile-anxious on the wrap.
   Animation lives on the wrap's non-connector children so the row/col
   connector lines (.svf-conn-e / .svf-conn-s) stay still while the
   actual tile shakes. Plays while ME_CARDGAME1 fanfare is playing and
   other taps are locked out. */
.svf-tile-anxious > *:not(.svf-conn-e):not(.svf-conn-s) {
  animation: svf-tile-shake 0.32s linear infinite;
  filter: drop-shadow(0 0 6px rgba(248, 113, 113, 0.55));
}
@keyframes svf-tile-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  20%  { transform: translate(-2px, 1px) rotate(-1.4deg); }
  40%  { transform: translate(2px, -1px) rotate(1.4deg); }
  60%  { transform: translate(-1px, 2px) rotate(-0.8deg); }
  80%  { transform: translate(1px, -2px) rotate(0.8deg); }
}
/* Keyboard cursor: real DOM focus, drawn only for keyboard users as the same
   red frame hover uses plus a dark rim (red alone is under 3:1 on the green
   board). One rounded ring, lifted above its neighbours. */
.svf-root .svf-tile-wrap:focus-visible {
  outline: none;
  z-index: 5;
}
.svf-root .svf-tile-wrap:focus-visible::before {
  box-shadow: 0 0 0 1px #6a0a0a, 0 0 0 4px #ef2020, 0 0 0 6px #111827;
}

/* When the game element is fullscreened, fill the viewport with the
   board background so the surrounding chrome doesn't bleed through. */
.svf-root:fullscreen,
.svf-root:-webkit-full-screen {
  width: 100vw;
  height: 100vh;
  background: #2d4f3c;
  padding: 24px;
  overflow: auto;
}

@media (prefers-reduced-motion: reduce) {
  .svf-root * { transition-duration: 150ms !important; animation-duration: 150ms !important; }
}
`;
