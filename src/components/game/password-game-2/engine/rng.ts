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
  const picked = arr[Math.floor(rng() * arr.length)];
  if (picked === undefined) {
    throw new Error("pickOne: index out of range");
  }
  return picked;
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    const picked = pool[idx];
    if (picked === undefined) continue;
    out.push(picked);
    pool.splice(idx, 1);
  }
  return out;
}

export function rangeInt(rng: Rng, min: number, max: number): number {
  if (max < min) throw new Error("rangeInt: max < min");
  return min + Math.floor(rng() * (max - min + 1));
}

/** FNV-1a 32-bit hash of a string. Used for daily seeds and sub-seeds. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic daily seed from the local date (YYYY-MM-DD). */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return fnv1a(`pg2-${y}-${m}-${d}`);
}

/** Stable sub-seed so each subsystem gets an independent stream. */
export function subSeed(seed: number, label: string): number {
  return (seed ^ fnv1a(label)) >>> 0;
}
