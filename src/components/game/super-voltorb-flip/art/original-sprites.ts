// The original Voltorb creature art, restored on the owner's instruction (T-6535, 2026-10-22):
// the revealed-tile Voltorb and the nine bomb-burst frames. They are the cartridge sprites
// from an open-source recreation (GPL-3.0; its LICENSE and NOTICE.md ship beside them); the
// creature belongs to Nintendo, Game Freak and Creatures Inc., shown in an unofficial
// non-commercial fan recreation. They are the game's one Voltorb: every place that shows the
// hazard draws them (voltorb-sprite.tsx); the memo digits and marks stay inline SVG (sprites.ts).

import { BURST_FRAMES } from "./fx";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

export const VOLTORB_TILE_SRC = `${SPRITES}/voltorb.png`;

/**
 * The bare Voltorb body for the small icons (clue cards, legend, memo, How to play): the tile
 * sprite with the salmon tile and its border made transparent, same pixels, 16 x 16. See
 * sprites/NOTICE.md.
 */
export const VOLTORB_ICON_SRC = "/games/super-voltorb-flip/sprites/voltorb-icon.png";

export const EXPLODE_FRAME_SRCS: readonly string[] = Array.from(
  { length: BURST_FRAMES },
  (_, i) => `${SPRITES}/explode_${i}.png`,
);

/**
 * Spread onto each sprite <img>: no iOS long-press "Save Image" sheet and no text selection
 * highlight. (The images also carry draggable={false} against the desktop ghost drag.)
 */
export const SPRITE_NO_GRAB_STYLE = { WebkitTouchCallout: "none", userSelect: "none" } as const;

// Held so a browser cannot drop a request it considers unreferenced.
const preloaded: HTMLImageElement[] = [];
let preloadStarted = false;

/** Warm the eleven sprite images (once per page load) into the HTTP cache so the first bomb of a visit does not stall frame by frame. */
export function preloadOriginalSprites(): void {
  if (preloadStarted || typeof Image === "undefined") return;
  preloadStarted = true;
  for (const src of [VOLTORB_TILE_SRC, VOLTORB_ICON_SRC, ...EXPLODE_FRAME_SRCS]) {
    const img = new Image();
    img.src = src;
    preloaded.push(img);
  }
}

/** Test seam: forget that the sprites were preloaded, so a test can mount the game again. */
export function resetOriginalSpritePreloadForTests(): void {
  preloadStarted = false;
  preloaded.length = 0;
}

/** Native size (px, square) of the bare Voltorb icon. */
export const VOLTORB_ICON_PX = 16;

/** Native size (px, square) of the Voltorb tile sprite. */
export const VOLTORB_TILE_PX = 22;

/**
 * Native size (px, square) of each burst frame. The artist baked the growth into the files: every
 * frame is a larger image with the Voltorb at the same pixel size in its middle and more debris
 * around it, so one native pixel must be the same size in every frame.
 */
export const EXPLODE_FRAME_PX: readonly number[] = [22, 22, 22, 34, 42, 56, 60, 62, 64];

/**
 * The size to draw the bare icon at inside an icon box of `box` px: a whole multiple of its 16 px
 * art (never below 1x), so every source pixel lands on whole screen pixels. Boxes under 32 px get
 * 16, 36 and 44 px boxes get 32.
 */
// Callers must pass a box of at least 16 px: the icon never draws below 1x, so a smaller box
// would be overflowed by it.
export function crispIconSize(box: number): number {
  return Math.max(VOLTORB_ICON_PX, VOLTORB_ICON_PX * Math.floor(box / VOLTORB_ICON_PX));
}

/**
 * The burst frames that are drawn on transparency (explode_3 to explode_8). explode_0 to
 * explode_2 are opaque 22 px tile shake frames: they belong over a board tile, not over a bare
 * icon, so the legend loop skips them.
 */
export const LEGEND_BURST_FRAMES: readonly number[] = [3, 4, 5, 6, 7, 8];

/** The largest burst frame (px): the size a burst scaled to fit a box is scaled from. */
export const EXPLODE_FRAME_MAX_PX = Math.max(...EXPLODE_FRAME_PX);

/** How much of the tile the revealed Voltorb sprite fills. */
export const VOLTORB_FACE_SCALE = 0.95;

/**
 * CSS width and height of burst frame `frame`, in tile-size units: the tile face draws the 22 px
 * Voltorb at VOLTORB_FACE_SCALE of the tile, and each frame scales by the same factor, so the
 * Voltorb baked into a frame lands exactly on the face underneath.
 */
export function explodeFrameCssSize(frame: number): string {
  const px = EXPLODE_FRAME_PX[frame] ?? VOLTORB_TILE_PX;
  return `calc(var(--svf-tile) * ${((VOLTORB_FACE_SCALE * px) / VOLTORB_TILE_PX).toFixed(4)})`;
}
