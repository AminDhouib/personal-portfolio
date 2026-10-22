// Pure geometry for the animated effects that are still drawn, as filled squares so they sit
// in the same chunky pixel look as the sprites: sparkleRects the four-frame success sparkle,
// coinHalfWidth the twelve-frame spinning coin. No images: the frame number fully determines the
// picture. The bomb burst is not here: it plays the nine original explode frames (see
// original-sprites.ts), and BURST_FRAMES is only their count.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export const BURST_FRAMES = 9;
export const SPARKLE_FRAMES = 4;
export const SPARKLE_BOX = 32;
export const COIN_FRAMES = 12;

function square(cx: number, cy: number, size: number, fill: string): Rect {
  return { x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), w: size, h: size, fill };
}

const SPARKLE_ARM = [3, 6, 8, 5] as const;
const SPARKLE_DOT = [3, 5, 7, 5] as const;
const SC = SPARKLE_BOX / 2;

/** One frame of the four-point success sparkle in a 32 x 32 box. Out-of-range frames clamp. */
export function sparkleRects(frame: number): Rect[] {
  const f = Math.min(Math.max(0, Math.trunc(frame)), SPARKLE_FRAMES - 1);
  const arm = SPARKLE_ARM[f] ?? 3;
  const dot = SPARKLE_DOT[f] ?? 3;
  const rects: Rect[] = [
    { x: SC - arm, y: SC - 1, w: 2 * arm, h: 2, fill: "#ffc933" },
    { x: SC - 1, y: SC - arm, w: 2, h: 2 * arm, fill: "#ffc933" },
    { x: SC - 2, y: SC - 2, w: 4, h: 4, fill: "#fff3b0" },
  ];
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    rects.push(square(SC + sx * dot, SC + sy * dot, 2, "#fff3b0"));
  }
  return rects;
}

/** Half the coin's visible width (of a 7-unit radius) at `frame`, as it turns about a vertical axis. */
export function coinHalfWidth(frame: number): number {
  const angle = (2 * Math.PI * frame) / COIN_FRAMES;
  return Math.max(1, Math.round(7 * Math.abs(Math.cos(angle))));
}
