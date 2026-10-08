// Pure helpers for the death card. No React, no storage.

/** Ease-out count from 0 to `target` over `durationMs`; always an integer. */
export function countUp(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  if (elapsedMs <= 0) return 0;
  const t = elapsedMs / durationMs;
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return Math.floor(target * eased);
}
