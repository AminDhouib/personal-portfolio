// The death beat: a short hit-stop, then slow motion, then normal speed.
// Pure so the curve is testable; game-tick scales the dying physics step by it
// while the staged explosions and onDeath keep their wall clock.
export const HIT_STOP_MS = 90;
export const SLOW_MO_MS = 400;
export const SLOW_MO_SCALE = 0.35;

export function deathTimeScale(msSinceHit: number): number {
  if (msSinceHit < HIT_STOP_MS) return 0;
  if (msSinceHit < HIT_STOP_MS + SLOW_MO_MS) return SLOW_MO_SCALE;
  return 1;
}
