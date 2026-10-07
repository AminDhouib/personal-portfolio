// Pure geometry for the animated effects, drawn as filled squares so they sit
// in the same chunky pixel look as the sprites. No images: the frame number
// fully determines the picture. burstRects replaces the nine-frame explosion,
// sparkleRects the four-frame success sparkle, coinHalfWidth the twelve-frame
// spinning coin.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export const BURST_FRAMES = 9;
export const BURST_BOX = 64;
export const SPARKLE_FRAMES = 4;
export const SPARKLE_BOX = 32;
export const COIN_FRAMES = 12;

/** Scale at which the orb is drawn inside a burst (64-unit box) when `core` is on. */
export const CORE_SCALE = 2.28;
export const CORE_OFFSET = 32 - (11 / 2) * CORE_SCALE;

const C = BURST_BOX / 2;
const FLASH_R = [3, 6, 9, 11, 12, 12, 0, 0, 0] as const;
const FLASH_FILL = [
  "#fff3b0",
  "#fff3b0",
  "#fff3b0",
  "#ffc933",
  "#ffc933",
  "#ff8a2a",
  "#ff8a2a",
  "#ff8a2a",
  "#ff8a2a",
] as const;
const SHARD_FILL = ["#ffc933", "#fff3b0"] as const;
const RING_FILL = "#ff8a2a";

const dirs = (offset: number) =>
  Array.from({ length: 8 }, (_, k) => ({
    dx: Math.cos((k * Math.PI) / 4 + offset),
    dy: Math.sin((k * Math.PI) / 4 + offset),
  }));
const SHARD_DIRS = dirs(0);
const RING_DIRS = dirs(Math.PI / 8);

function square(cx: number, cy: number, size: number, fill: string): Rect {
  return { x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), w: size, h: size, fill };
}

/**
 * One frame of the bomb burst in a 64 x 64 box: a cross-shaped flash that
 * cools from white to orange and is gone by frame 6, eight square shards
 * flying out and shrinking, and a second ring of smaller shards from frame 2.
 * Out-of-range frames clamp.
 */
export function burstRects(frame: number): Rect[] {
  const f = Math.min(Math.max(0, Math.trunc(frame)), BURST_FRAMES - 1);
  const rects: Rect[] = [];

  const r = FLASH_R[f] ?? 0;
  if (r > 0) {
    const fill = FLASH_FILL[f] ?? "#fff3b0";
    const half = Math.round(r * 0.6);
    rects.push(
      { x: C - r, y: C - half, w: 2 * r, h: 2 * half, fill },
      { x: C - half, y: C - r, w: 2 * half, h: 2 * r, fill },
    );
  }

  const radius = 6 + 3 * f;
  const size = Math.max(2, 6 - Math.floor(f / 2));
  SHARD_DIRS.forEach((d, k) => {
    rects.push(square(C + d.dx * radius, C + d.dy * radius, size, SHARD_FILL[k % 2] ?? RING_FILL));
  });

  if (f >= 2) {
    const ring = Math.max(2, size - 2);
    for (const d of RING_DIRS) {
      rects.push(square(C + d.dx * radius * 0.6, C + d.dy * radius * 0.6, ring, RING_FILL));
    }
  }
  return rects;
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
