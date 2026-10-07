import type { CellValue } from "./types";

// HeartGold/SoulSilver Voltorb Flip rules, ported from the pret/pokeheartgold
// decompilation (commit 9d8b759), src/voltorb_flip/voltorb_flip_game.c. Display
// levels run 1-8 here; the decomp stores them reversed (internal 7 is Lv.1).

export type BoardConfig = {
  voltorbs: number;
  twos: number;
  threes: number;
  /** Most "free" x2/x3 cards (no Voltorb in their row or column) allowed in one line. */
  maxFreePerRowCol: number;
  /** Most free x2/x3 cards allowed on the whole board. */
  maxFreeTotal: number;
};

export type RoundOutcome = "none" | "quit" | "won" | "lost";

export type RoundSummary = {
  outcome: RoundOutcome;
  /** Non-Voltorb cards flipped, 1s included. */
  cardsFlipped: number;
  boardId: number;
};

export const MAX_LEVEL = 8;
export const HISTORY_SIZE = 5;
export const PAYOUT_CAP = 50000;
const BOARD_CELLS = 25;
const PLACE_ATTEMPTS = 100;
const DEAL_ATTEMPTS = 1000;

export const EMPTY_ROUND: RoundSummary = { outcome: "none", cardsFlipped: 0, boardId: 0 };

const config = (
  voltorbs: number,
  twos: number,
  threes: number,
  maxFreePerRowCol: number,
  maxFreeTotal: number,
): BoardConfig => ({ voltorbs, twos, threes, maxFreePerRowCol, maxFreeTotal });

// sBoardConfigs: ten boards per level, Lv.1 first. Within a level the second
// five repeat the first five with tighter free caps.
// prettier-ignore
export const BOARD_CONFIGS: readonly BoardConfig[] = [
  // Lv.1
  config(6, 3, 1, 3, 3), config(6, 0, 3, 2, 2), config(6, 5, 0, 3, 4), config(6, 2, 2, 3, 3), config(6, 4, 1, 3, 4),
  config(6, 3, 1, 3, 3), config(6, 0, 3, 2, 2), config(6, 5, 0, 3, 4), config(6, 2, 2, 3, 3), config(6, 4, 1, 3, 4),
  // Lv.2
  config(7, 1, 3, 2, 3), config(7, 6, 0, 3, 4), config(7, 3, 2, 2, 3), config(7, 0, 4, 2, 3), config(7, 5, 1, 3, 4),
  config(7, 1, 3, 2, 2), config(7, 6, 0, 3, 3), config(7, 3, 2, 2, 2), config(7, 0, 4, 2, 2), config(7, 5, 1, 3, 3),
  // Lv.3
  config(8, 2, 3, 2, 3), config(8, 7, 0, 3, 4), config(8, 4, 2, 3, 4), config(8, 1, 4, 2, 3), config(8, 6, 1, 4, 3),
  config(8, 2, 3, 2, 2), config(8, 7, 0, 3, 3), config(8, 4, 2, 3, 3), config(8, 1, 4, 2, 2), config(8, 6, 1, 3, 3),
  // Lv.4
  config(8, 3, 3, 4, 3), config(8, 0, 5, 2, 3), config(10, 8, 0, 4, 5), config(10, 5, 2, 3, 4), config(10, 2, 4, 3, 4),
  config(8, 3, 3, 3, 3), config(8, 0, 5, 2, 2), config(10, 8, 0, 4, 4), config(10, 5, 2, 3, 3), config(10, 2, 4, 3, 3),
  // Lv.5
  config(10, 7, 1, 4, 5), config(10, 4, 3, 3, 4), config(10, 1, 5, 3, 4), config(10, 9, 0, 4, 5), config(10, 6, 2, 4, 5),
  config(10, 7, 1, 4, 4), config(10, 4, 3, 3, 3), config(10, 1, 5, 3, 3), config(10, 9, 0, 4, 4), config(10, 6, 2, 4, 4),
  // Lv.6
  config(10, 3, 4, 3, 4), config(10, 0, 6, 3, 4), config(10, 8, 1, 4, 5), config(10, 5, 3, 4, 5), config(10, 2, 5, 3, 4),
  config(10, 3, 4, 3, 3), config(10, 0, 6, 3, 3), config(10, 8, 1, 4, 4), config(10, 5, 3, 4, 4), config(10, 2, 5, 3, 3),
  // Lv.7
  config(10, 7, 2, 4, 5), config(10, 4, 4, 4, 5), config(13, 1, 6, 3, 4), config(13, 9, 1, 5, 6), config(10, 6, 3, 4, 5),
  config(10, 7, 2, 4, 4), config(10, 4, 4, 4, 4), config(13, 1, 6, 3, 3), config(13, 9, 1, 5, 5), config(10, 6, 3, 4, 4),
  // Lv.8
  config(10, 0, 7, 3, 4), config(10, 8, 2, 5, 6), config(10, 5, 4, 4, 5), config(10, 2, 6, 4, 5), config(10, 7, 3, 5, 6),
  config(10, 0, 7, 3, 3), config(10, 8, 2, 5, 5), config(10, 5, 4, 4, 4), config(10, 2, 6, 4, 4), config(10, 7, 3, 5, 5),
];

export function levelOfBoard(boardId: number): number {
  return Math.floor(boardId / 10) + 1;
}

const clampLevel = (level: number) => Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));

// SelectBoardId: sBoardIdDistribution gives each of the level's ten boards a
// 10% share.
export function pickBoardId(level: number, rng: () => number): number {
  const slot = Math.min(9, Math.floor(rng() * 10));
  return (clampLevel(level) - 1) * 10 + slot;
}

// CalcNextLevel. `history` is oldest first and ends with the round that just
// finished; it always holds HISTORY_SIZE entries (EMPTY_ROUND pads a new session).
export function nextLevel(history: readonly RoundSummary[]): number {
  const prev = history[history.length - 1] ?? EMPTY_ROUND;
  const at = levelOfBoard(prev.boardId);
  const won = prev.outcome === "won";
  if (won && at >= 8) return 8;
  // Lv.8 streak: at Lv.5 or higher, and every round in the history was not a
  // loss and flipped at least 8 cards (a quit counts as not lost).
  if (
    at >= 5 &&
    history.length === HISTORY_SIZE &&
    history.every((r) => r.cardsFlipped >= 8 && r.outcome !== "lost")
  ) {
    return 8;
  }
  for (let level = 7; level >= 2; level--) {
    if ((at >= level && prev.cardsFlipped >= level) || (at >= level - 1 && won)) return level;
  }
  return 1;
}

// PlaceCardsOnBoard for the non-1 cards: random cells, only over a 1, and the
// call gives up after 100 failed attempts in total.
export function placeCards(
  cells: CellValue[],
  value: CellValue,
  n: number,
  rng: () => number,
): void {
  let attempts = 0;
  for (let i = 0; i < n; i++) {
    const id = Math.min(BOARD_CELLS - 1, Math.floor(rng() * BOARD_CELLS));
    if (cells[id] === 1) {
      cells[id] = value;
    } else {
      attempts += 1;
      if (attempts >= PLACE_ATTEMPTS) break;
      i -= 1;
    }
  }
}

// RetryBoardGen: true when the deal gives away too many multipliers for free.
export function isRejected(cells: readonly CellValue[], boardConfig: BoardConfig): boolean {
  const voltorbsInRow = [0, 0, 0, 0, 0];
  const voltorbsInCol = [0, 0, 0, 0, 0];
  cells.forEach((cell, i) => {
    if (cell !== "V") return;
    voltorbsInRow[Math.floor(i / 5)] = (voltorbsInRow[Math.floor(i / 5)] ?? 0) + 1;
    voltorbsInCol[i % 5] = (voltorbsInCol[i % 5] ?? 0) + 1;
  });
  const freeInRow = [0, 0, 0, 0, 0];
  const freeInCol = [0, 0, 0, 0, 0];
  let free = 0;
  cells.forEach((cell, i) => {
    if (cell !== 2 && cell !== 3) return;
    const row = Math.floor(i / 5);
    const col = i % 5;
    if (voltorbsInRow[row] === 0 || voltorbsInCol[col] === 0) {
      freeInRow[row] = (freeInRow[row] ?? 0) + 1;
      freeInCol[col] = (freeInCol[col] ?? 0) + 1;
      free += 1;
    }
  });
  if (boardConfig.maxFreeTotal <= free) return true;
  for (let i = 0; i < 5; i++) {
    if (
      boardConfig.maxFreePerRowCol <= (freeInCol[i] ?? 0) ||
      boardConfig.maxFreePerRowCol <= (freeInRow[i] ?? 0)
    ) {
      return true;
    }
  }
  return false;
}

// GenerateBoard: deal Voltorbs, then 2s, then 3s over a board of 1s, and deal
// again while the free caps reject it, up to 1000 times (the last deal stands).
// Row-major: index = row * 5 + col.
export function generateLayout(boardId: number, rng: () => number): CellValue[] {
  const boardConfig = BOARD_CONFIGS[boardId];
  if (!boardConfig) throw new Error(`Unknown Voltorb Flip board ${boardId}`);
  let cells: CellValue[] = [];
  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    cells = Array<CellValue>(BOARD_CELLS).fill(1);
    placeCards(cells, "V", boardConfig.voltorbs, rng);
    placeCards(cells, 2, boardConfig.twos, rng);
    placeCards(cells, 3, boardConfig.threes, rng);
    if (!isRejected(cells, boardConfig)) break;
  }
  return cells;
}

// CalcBoardMaxPayout: the product of every non-Voltorb card, capped.
export function maxPayout(cells: readonly CellValue[]): number {
  let payout = 1;
  for (const cell of cells) {
    if (cell !== "V") payout *= cell;
  }
  return Math.min(PAYOUT_CAP, payout);
}
