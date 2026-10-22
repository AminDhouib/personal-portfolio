/** A source of numbers in [0, 1); Math.random in the game, a stub in tests. */
export type Rng = () => number;

/**
 * The canvas offset for one shake frame: a fresh random direction each frame, scaled by the
 * decayed amplitude. Cosmetic only (not gameplay RNG); x is drawn before y.
 */
export function shakeOffset(amp: number, rng: Rng = Math.random): { dx: number; dy: number } {
  const dx = (rng() * 2 - 1) * amp;
  const dy = (rng() * 2 - 1) * amp;
  return { dx, dy };
}
