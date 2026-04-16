export type Rng = () => number;

/** Mulberry32 seeded PRNG. Deterministic, fast, good enough for game randomness. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("pickOne: array is empty");
  }
  return arr[Math.floor(rng() * arr.length)];
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export function rangeInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error("rangeInt: max < min");
  return min + Math.floor(rng() * (max - min + 1));
}
