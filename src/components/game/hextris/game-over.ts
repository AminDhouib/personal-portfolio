// The game-over sheet's model: whether the run is a new best, the score count-up and the restart
// lockout. Pure; the shell feeds it the wall-clock time since the run ended.

/** The score counts up from 0 over this long. */
export const COUNT_UP_MS = 900;
/**
 * Nothing restarts for this long after game over, so the player reads the score first (it
 * replaces the old "must click Play again" rule).
 */
export const RESTART_LOCKOUT_MS = 1200;

export interface GameOverInput {
  score: number;
  /** The best stored before this run, or null when no run has been stored yet. */
  previousBest: number | null;
  /** The side that overflowed (the engine's `game-over` event). */
  side: number;
  nowMs: number;
  overAtMs: number;
}

export interface GameOverView {
  /** Beat a stored best. The first run ever is never a new best (there was nothing to beat). */
  isNewBest: boolean;
  isFirstRun: boolean;
  countUpValue: number;
  canRestart: boolean;
  side: number;
}

/** The score shown `ageMs` into the count-up: an ease-out cubic from 0, whole numbers only. */
export function countUpValue(score: number, ageMs: number): number {
  if (ageMs <= 0) return 0;
  if (ageMs >= COUNT_UP_MS) return score;
  const left = 1 - ageMs / COUNT_UP_MS;
  return Math.floor(score * (1 - left * left * left));
}

export function gameOverView(input: GameOverInput): GameOverView {
  const ageMs = input.nowMs - input.overAtMs;
  const isFirstRun = input.previousBest === null;
  return {
    isNewBest: input.previousBest !== null && input.score > input.previousBest,
    isFirstRun,
    countUpValue: countUpValue(input.score, ageMs),
    canRestart: ageMs >= RESTART_LOCKOUT_MS,
    side: input.side,
  };
}
