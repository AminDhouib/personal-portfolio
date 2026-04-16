import { LEVELS } from "./levels";
import { EMPTY_MEMOS, type Tile, type LineHint, type TileValue } from "./types";

export type GeneratedBoard = {
  board: Tile[][];
  maxCoins: number;
  twos: number;
  threes: number;
  voltorbs: number;
};

/**
 * Generate a new 5x5 Voltorb Flip board for the given level (1-8).
 * @param level 1-indexed level number
 * @param rng optional RNG function returning [0, 1); defaults to Math.random
 */
export function generateBoard(level: number, rng: () => number = Math.random): GeneratedBoard {
  const levelIdx = Math.max(0, Math.min(7, level - 1));
  const configs = LEVELS[levelIdx];
  const configIdx = Math.floor(rng() * configs.length) % configs.length;
  const [twos, threes, voltorbs, maxCoins] = configs[configIdx];

  const values: TileValue[] = Array.from({ length: 25 }, () => 1 as TileValue);
  const pool = Array.from({ length: 25 }, (_, i) => i);

  const placeCount = (value: TileValue, count: number) => {
    for (let i = 0; i < count; i++) {
      const pickIdx = Math.floor(rng() * pool.length) % pool.length;
      const tileIdx = pool.splice(pickIdx, 1)[0];
      values[tileIdx] = value;
    }
  };

  placeCount(2, twos);
  placeCount(3, threes);
  placeCount(0, voltorbs);

  const board: Tile[][] = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => ({
      value: values[r * 5 + c],
      flipped: false,
      animFrame: null,
      memos: EMPTY_MEMOS,
    })),
  );

  return { board, maxCoins, twos, threes, voltorbs };
}

/**
 * Compute row and column hints (point sum + voltorb count) for a board.
 */
export function computeHints(board: Tile[][]): { rowHints: LineHint[]; colHints: LineHint[] } {
  const rowHints: LineHint[] = Array.from({ length: 5 }, () => ({ points: 0, voltorbs: 0 }));
  const colHints: LineHint[] = Array.from({ length: 5 }, () => ({ points: 0, voltorbs: 0 }));

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const v = board[r][c].value;
      if (v === 0) {
        rowHints[r].voltorbs++;
        colHints[c].voltorbs++;
      } else {
        rowHints[r].points += v;
        colHints[c].points += v;
      }
    }
  }

  return { rowHints, colHints };
}

/**
 * Apply the Super Mode softer level drop based on successful flips.
 * @param currentLevel current level (1-8)
 * @param requiredFlips number of 2s + 3s on the board (goal)
 * @param successfulFlips non-Voltorb tiles flipped this round
 * @returns new level (minimum 1)
 */
export function applyDrop(
  currentLevel: number,
  requiredFlips: number,
  successfulFlips: number,
): number {
  const drop = Math.max(0, Math.ceil((requiredFlips - successfulFlips) / 2));
  return Math.max(1, currentLevel - drop);
}
