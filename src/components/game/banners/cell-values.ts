// Pure value logic for the Super Voltorb Flip banner board. Rendering reads only the seeded
// (deterministic) helpers; the Math.random-backed ones run from effects and timers after mount.

/** A source of numbers in [0, 1); Math.random in the banner, a stub in tests. */
export type Rng = () => number;

// 15% chance of bomb, 85% chance of number 1/2/3. With a 6x3 = 18 cell
// board this averages ~2.7 bombs visible at any given moment. Each cell
// rolls independently so the bomb positions wander as cycles tick.
export function pickCellValue(rng: Rng = Math.random): number | "bomb" {
  if (rng() < 0.15) return "bomb";
  return 1 + Math.floor(rng() * 3);
}

// Deterministic per-cell seed for SSR: derives a stable pseudo-random
// number from grid coordinates so server and client render the same
// initial state. After mount the cell re-rolls via Math.random() in
// useEffect, where SSR/client divergence is expected and harmless.
export function seededFromCoords(r: number, c: number): number {
  const h = ((r * 73856093) ^ (c * 19349663)) >>> 0;
  return (h % 1000) / 1000;
}

export function pickCellValueSeeded(r: number, c: number): number | "bomb" {
  const a = seededFromCoords(r, c);
  if (a < 0.15) return "bomb";
  const b = seededFromCoords(c, r);
  return 1 + Math.floor(b * 3);
}

/** The deterministic first-render flip delay, in seconds, for a cell. */
export function seededFlipDelay(r: number, c: number, flipCycleS: number): number {
  return seededFromCoords(r + 1, c + 1) * (flipCycleS - 1.5);
}

/** The post-mount random flip delay, in seconds. */
export function randomFlipDelay(flipCycleS: number, rng: Rng = Math.random): number {
  return rng() * (flipCycleS - 1.5);
}

export type CellRoll = { flipDelay: number; value: number | "bomb" };

/** The post-mount roll for one cell: its random flip delay, then its random face. */
export function rollCell(flipCycleS: number, rng: Rng = Math.random): CellRoll {
  const flipDelay = randomFlipDelay(flipCycleS, rng);
  return { flipDelay, value: pickCellValue(rng) };
}
