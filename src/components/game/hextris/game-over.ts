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

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A CSS scale and offset for the canvas; NO_FIT leaves it where it is. */
export interface BoardFit {
  scale: number;
  dx: number;
  dy: number;
}

export const NO_FIT: BoardFit = { scale: 1, dx: 0, dy: 0 };

/**
 * Where the board goes while the game-over sheet is up, so the sheet never covers it. The board
 * fills the canvas's shorter side (render/layout.ts), so it is scaled to the shorter side of the
 * free space above the sheet (a phone's bottom sheet) or left of it (a desktop side panel),
 * whichever is bigger, and centred there. It never grows. `canvas` is the canvas's own size and
 * `sheet` the sheet's box in the same coordinates, both untransformed.
 */
export function boardFit(canvas: { w: number; h: number }, sheet: Box): BoardFit {
  const short = Math.min(canvas.w, canvas.h);
  if (short <= 0 || sheet.w <= 0 || sheet.h <= 0) return NO_FIT;
  if (sheet.y >= canvas.h || sheet.x >= canvas.w) return NO_FIT;
  const free: Box[] = [
    { x: 0, y: 0, w: canvas.w, h: sheet.y },
    { x: 0, y: 0, w: sheet.x, h: canvas.h },
  ].filter((box) => box.w > 0 && box.h > 0);
  let best: BoardFit | null = null;
  for (const box of free) {
    const scale = Math.min(1, Math.min(box.w, box.h) / short);
    if (best && scale <= best.scale) continue;
    best = { scale, dx: box.x + box.w / 2 - canvas.w / 2, dy: box.y + box.h / 2 - canvas.h / 2 };
  }
  return best ?? NO_FIT;
}
