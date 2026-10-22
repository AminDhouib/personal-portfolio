// The original Voltorb creature art, restored on the owner's instruction (T-6535, 2026-10-22):
// the revealed-tile Voltorb and the nine bomb-burst frames. They are the cartridge sprites
// from an open-source recreation (GPL-3.0; its LICENSE and NOTICE.md ship beside them); the
// creature belongs to Nintendo, Game Freak and Creatures Inc., shown in an unofficial
// non-commercial fan recreation. Only these two uses load an image: the orb in the legend, on
// the clue cards and in the memo flags is still the inline sprite in sprites.ts.

import { BURST_FRAMES } from "./fx";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

export const VOLTORB_TILE_SRC = `${SPRITES}/voltorb.png`;

export const EXPLODE_FRAME_SRCS: readonly string[] = Array.from(
  { length: BURST_FRAMES },
  (_, i) => `${SPRITES}/explode_${i}.png`,
);

/** Native size (px, square) of the Voltorb tile sprite. */
export const VOLTORB_TILE_PX = 22;

/**
 * Native size (px, square) of each burst frame. The artist baked the growth into the files: every
 * frame is a larger image with the Voltorb at the same pixel size in its middle and more debris
 * around it, so one native pixel must be the same size in every frame.
 */
export const EXPLODE_FRAME_PX: readonly number[] = [22, 22, 22, 34, 42, 56, 60, 62, 64];

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
