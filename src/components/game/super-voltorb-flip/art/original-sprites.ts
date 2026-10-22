// The original Voltorb creature art, restored on the owner's instruction (T-6535, 2026-10-22):
// the revealed-tile Voltorb and the nine bomb-burst frames. They are the cartridge sprites
// from an open-source recreation (GPL-3.0; its LICENSE and NOTICE.md ship beside them); the
// creature belongs to Nintendo, Game Freak and Creatures Inc., shown in an unofficial
// non-commercial fan recreation. They are the game's one Voltorb: every place that shows the
// hazard draws them (voltorb-sprite.tsx); the memo digits and marks stay inline SVG (sprites.ts).

import { BURST_FRAMES } from "./fx";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

export const VOLTORB_TILE_SRC = `${SPRITES}/voltorb.png`;

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

/** Warm the ten sprite files into the HTTP cache so the first bomb of a visit does not stall frame by frame. */
export function preloadOriginalSprites(): void {
  if (typeof Image === "undefined") return;
  for (const src of [VOLTORB_TILE_SRC, ...EXPLODE_FRAME_SRCS]) {
    const img = new Image();
    img.src = src;
    preloaded.push(img);
  }
}

/** Native size (px, square) of the Voltorb tile sprite. */
export const VOLTORB_TILE_PX = 22;

/**
 * Native size (px, square) of each burst frame. The artist baked the growth into the files: every
 * frame is a larger image with the Voltorb at the same pixel size in its middle and more debris
 * around it, so one native pixel must be the same size in every frame.
 */
export const EXPLODE_FRAME_PX: readonly number[] = [22, 22, 22, 34, 42, 56, 60, 62, 64];

/**
 * The size to draw the sprite at inside an icon box of `box` px: a whole multiple of the 22 px
 * art (never below 1x), so every source pixel lands on whole screen pixels. 28 px boxes get 22,
 * 44 px boxes get 44.
 */
export function crispIconSize(box: number): number {
  return Math.max(VOLTORB_TILE_PX, VOLTORB_TILE_PX * Math.floor(box / VOLTORB_TILE_PX));
}

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
