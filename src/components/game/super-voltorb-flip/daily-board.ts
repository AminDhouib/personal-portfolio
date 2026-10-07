import { mulberry32, fnv1a } from "../password-game-2/engine/rng";
import { generateLayout, maxPayout, pickBoardId } from "./hgss";
import type { CellValue } from "./types";

// The Daily board: one fixed board per UTC day, the same for everyone. PURE and
// DOM-free on purpose: the server validator (src/lib/arcade/games.ts) imports
// this file to regenerate the day's board and bound a submitted score, so it
// must run under node (daily-board.test.ts runs in the node environment as the
// guard). Do not import React, the DOM or anything with side effects here.

/** The displayed level the Daily board is dealt at (DESIGN.md: why Lv.5). */
export const DAILY_LEVEL = 5;

/** Bump the version if the recipe below ever changes; old days must not shift. */
export const DAILY_SEED_PREFIX = "svf-daily-v1-";

export type DailyBoard = {
  /** "YYYY-MM-DD", UTC. */
  dayKey: string;
  boardId: number;
  layout: CellValue[];
  /** Coins a cleared board pays (the product of its 2s and 3s). */
  maxCoins: number;
  voltorbs: number;
  twos: number;
  threes: number;
  /** Tiles that are not a Voltorb. */
  safeTiles: number;
};

export function dailyBoard(dayKey: string): DailyBoard {
  const rng = mulberry32(fnv1a(`${DAILY_SEED_PREFIX}${dayKey}`));
  const boardId = pickBoardId(DAILY_LEVEL, rng);
  const layout = generateLayout(boardId, rng);
  let voltorbs = 0;
  let twos = 0;
  let threes = 0;
  for (const cell of layout) {
    if (cell === "V") voltorbs += 1;
    else if (cell === 2) twos += 1;
    else if (cell === 3) threes += 1;
  }
  return {
    dayKey,
    boardId,
    layout,
    maxCoins: maxPayout(layout),
    voltorbs,
    twos,
    threes,
    safeTiles: layout.length - voltorbs,
  };
}

/** "2026-10-07" -> 20261007, the integer the arcade detail carries. */
export function dayNumber(dayKey: string): number {
  return Number(dayKey.replace(/-/g, ""));
}

/** A real calendar day written YYYY-MM-DD. */
export function isDayKey(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** The UTC day before `dayKey`. */
export function previousDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Why `score` with `flips` safe tiles flipped is impossible on `board`, or null
 * when the board can produce it. A round's coins are the product of the safe
 * tiles flipped, so a score is 0 or 2^a * 3^b with a no more than the board's
 * 2s and b no more than its 3s, reached with at least a + b flips (the rest of
 * the flips are 1s) and at most all the safe tiles. This is a ceiling on what
 * the board allows, not proof of an honest run (DESIGN.md: arcade scores are
 * trusted up to plausibility ceilings).
 */
export function checkDailyScore(board: DailyBoard, score: number, flips: number): string | null {
  if (flips > board.safeTiles) return "more flips than safe tiles";
  if (score === 0) return null;
  if (score > board.maxCoins) return "score above the board's maximum";
  if (flips < 1) return "coins without a flip";
  let rest = score;
  let a = 0;
  let b = 0;
  while (rest % 2 === 0) {
    rest /= 2;
    a += 1;
  }
  while (rest % 3 === 0) {
    rest /= 3;
    b += 1;
  }
  if (rest !== 1) return "score is not a product of 2s and 3s";
  if (a > board.twos || b > board.threes) {
    return "score needs more 2s or 3s than the board holds";
  }
  if (flips < a + b) return "too few flips for the score";
  return null;
}
