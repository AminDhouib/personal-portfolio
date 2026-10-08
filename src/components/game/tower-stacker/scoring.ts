// Tower Stacker scoring. PURE and DOM-free on purpose: the server's arcade check
// (src/lib/arcade/games.ts) imports this file to bound a submitted score, so it must
// run under node (scoring.test.ts runs in the node environment as the guard).
// Imports nothing from engine.ts: the engine imports this file, never the reverse.

/** A trimmed landing. */
export const LAND_POINTS = 10;
/** Added per streak step on a perfect, up to BONUS_STREAK_CAP steps. */
export const PERFECT_BONUS = 10;
export const BONUS_STREAK_CAP = 5;

/** Points for a perfect that makes the streak `streak` long (1 = the first perfect). */
export function perfectPoints(streak: number): number {
  return LAND_POINTS + PERFECT_BONUS * Math.min(streak, BONUS_STREAK_CAP);
}

/** The points of `length` perfects in a row, starting from a streak of 0. */
export function chainPoints(length: number): number {
  if (length <= 0) return 0;
  const capped = Math.min(length, BONUS_STREAK_CAP);
  const head = capped * LAND_POINTS + (PERFECT_BONUS * capped * (capped + 1)) / 2;
  return head + (length - capped) * perfectPoints(BONUS_STREAK_CAP);
}

/**
 * The lowest and highest score a run can have with `blocks` landed floors, `perfects`
 * perfects and a longest streak of `streak`, or null when the counts contradict each
 * other. Highest: as many streaks of exactly `streak` as fit. Lowest: one streak of
 * `streak` and every other perfect on its own. A ceiling on client numbers, not proof
 * of an honest run (DESIGN.md).
 */
export function scoreRange(
  blocks: number,
  perfects: number,
  streak: number,
): { min: number; max: number } | null {
  if (perfects > blocks || streak > perfects) return null;
  if (perfects > 0 !== streak > 0) return null;
  const plain = (blocks - perfects) * LAND_POINTS;
  if (perfects === 0) return { min: plain, max: plain };
  const max =
    plain + Math.floor(perfects / streak) * chainPoints(streak) + chainPoints(perfects % streak);
  const min = plain + chainPoints(streak) + (perfects - streak) * perfectPoints(1);
  return { min, max };
}
