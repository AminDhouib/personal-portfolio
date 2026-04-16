/**
 * Deterministic seed derived from a YYYY-MM-DD date string. Uses the FNV-1a
 * hash truncated to 32 bits so the output fits the mulberry32 PRNG input.
 */
export function dailySeed(dateString: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < dateString.length; i++) {
    hash ^= dateString.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

/** UTC YYYY-MM-DD string for the given date (defaults to now). */
export function todayDateString(date: Date = new Date()): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}
