// Board sizing. The tiles solve   tile * (1 + N * (1 + ratio)) = content - chrome
// (N tiles, N gaps of ratio * tile, plus one clue column of one tile), where
// content is the frame's inline size minus its border and padding. The CSS
// below is built from these constants, and phoneTilePx restates the phone
// half of the formula so a unit test can pin the 44px touch floor.

/** Smallest touch target we ship (WCAG 2.5.5 target size, enhanced). */
export const MIN_TOUCH_PX = 44;
export const TILE_CAP_PX = 72;

/** The phone layout applies below Tailwind's `sm` breakpoint (640px). */
export const PHONE_MAX_VIEWPORT_PX = 639;
/** The 44px floor is promised from this width up; narrower is best effort. */
export const PHONE_MIN_SUPPORTED_VIEWPORT_PX = 360;
/** Horizontal space the page and the game root leave around the frame. */
export const PHONE_FRAME_INSET_PX = 16;
export const PHONE_FRAME_MAX_PX = 380;
/** border-4 on each side plus p-1.5 on each side of the frame. */
export const FRAME_BORDER_AND_PAD_PX = 20;
/** 4px outline allowance plus the inner p-1 (8px) on phones. */
export const PHONE_CHROME_PX = 12;
export const DESKTOP_CHROME_PX = 40;
export const PHONE_GAP_RATIO = 0.2;
export const DESKTOP_GAP_RATIO = 0.28;

/**
 * Tile size in px for an N-wide board on a phone of the given viewport width.
 * Ignores the small-board width cap (only debug sizes 2-4 reach it).
 */
export function phoneTilePx(viewportPx: number, n: number): number {
  const frame = Math.min(viewportPx - PHONE_FRAME_INSET_PX, PHONE_FRAME_MAX_PX);
  const content = frame - FRAME_BORDER_AND_PAD_PX;
  const k = 1 + n * (1 + PHONE_GAP_RATIO);
  return Math.min(TILE_CAP_PX, (content - PHONE_CHROME_PX) / k);
}

/**
 * The board frame is a container-query root, so the tiles solve for any
 * --svf-n (board size 2 to 7) from the frame's own width. These custom
 * properties stay unregistered on purpose: 100cqw must resolve at the point of
 * use (inside the frame), not on the frame itself. From sm up every value is
 * the one the board has always had (gap 0.28, chrome 40px).
 */
export const BOARD_FRAME_CSS = `
.svf-root .svf-board-frame {
  container-type: inline-size;
  container-name: svf-board;
  --svf-tile-cap: ${TILE_CAP_PX}px;
  --svf-ratio: ${PHONE_GAP_RATIO};
  --svf-chrome: ${PHONE_CHROME_PX}px;
  --svf-k: calc(1 + var(--svf-n) * (1 + var(--svf-ratio)));
  --svf-tile-ideal: calc((100cqw - var(--svf-chrome)) / var(--svf-k));
  --svf-tile: min(var(--svf-tile-cap), var(--svf-tile-ideal));
  --svf-gap: calc(var(--svf-tile) * var(--svf-ratio));
  /* Cap so a small board does not stretch the frame into empty green space. */
  --svf-max-cap: calc(var(--svf-tile-cap) * var(--svf-k) + var(--svf-chrome));
  /* Explicit width so a mobile parent (flex-col items-center) cannot collapse
     us to 0: the container-query math needs a real inline size. */
  width: min(calc(100vw - ${PHONE_FRAME_INSET_PX}px), ${PHONE_FRAME_MAX_PX}px, var(--svf-max-cap));
  margin-inline: auto;
}
@media (min-width: 640px) {
  .svf-root .svf-board-frame {
    --svf-ratio: ${DESKTOP_GAP_RATIO};
    --svf-chrome: ${DESKTOP_CHROME_PX}px;
    width: min(92vw, 460px, var(--svf-max-cap));
  }
}
@media (min-width: 1024px) {
  .svf-root .svf-board-frame { width: min(60vw, 560px, var(--svf-max-cap)); }
}
`;
