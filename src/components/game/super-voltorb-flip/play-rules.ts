import type { Cell, GameStatus } from "./types";

// Pure rules lifted out of super-voltorb-flip.tsx. Same arithmetic, no React.

/** `?size=N` (N in 2..10) creates a non-default board for layout testing; anything else is 5. */
export function parseBoardSize(search: string): number {
  const q = new URLSearchParams(search).get("size");
  const n = q ? parseInt(q, 10) : NaN;
  return Number.isFinite(n) && n >= 2 && n <= 10 ? n : 5;
}

/** The debug panel's size knob: rounded, then held to 2..10. */
export function clampBoardSize(n: number): number {
  return Math.max(2, Math.min(10, Math.round(n)));
}

/** A round is being played (flipping or memo-ing). */
export function isRoundLive(status: GameStatus): boolean {
  return status === "playing" || status === "memo";
}

/** The round is settled; the board freezes until the win/lose flow restarts it. */
export function isRoundOver(status: GameStatus): boolean {
  return status === "lose" || status === "win" || status === "quit";
}

/** Zero-padded digits for the score and row/column counters. */
export function padDigits(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

export type TileRisk = { definitive: boolean; highRisk: boolean };

/**
 * Risk pre-check for flipping (row, col): voltorb density among the unflipped
 * tiles of its row and column. Deterministic lines (0% or 100%) are never "high risk".
 */
export function tileRisk(
  cells: Cell[][],
  rowVoltorbs: number,
  colVoltorbs: number,
  row: number,
  col: number,
): TileRisk {
  const N = cells.length;
  const rowCells = cells[row] ?? [];
  const colCells = cells.map((r) => r[col]).filter((c): c is Cell => c !== undefined);
  const flippedInRow = rowCells.filter((c) => c.isFlipped).length;
  const flippedInCol = colCells.filter((c) => c.isFlipped).length;
  const remainingRow = Math.max(1, N - flippedInRow);
  const remainingCol = Math.max(1, N - flippedInCol);
  const rowRisk = (rowVoltorbs * 100) / remainingRow;
  const colRisk = (colVoltorbs * 100) / remainingCol;
  const definitive = rowRisk === 0 || rowRisk === 100 || colRisk === 0 || colRisk === 100;
  const highRisk = !definitive && (rowRisk >= 75 || colRisk >= 75);
  return { definitive, highRisk };
}

/** Per-flip coin rollup: ~100 ticks however large the target. */
export function tallyStride(target: number): number {
  return Math.max(1, Math.ceil(target / 100));
}

const MAX_PAYOUT_ITERATIONS = 100;

/** Bank drain: bounded to 100 iterations, small hauls still tick one coin per step. */
export function payoutPlan(earned: number): { coinsPerTick: number; iterations: number } {
  const coinsPerTick = Math.max(1, Math.ceil(earned / MAX_PAYOUT_ITERATIONS));
  return { coinsPerTick, iterations: Math.ceil(earned / coinsPerTick) };
}

export type StatsOutcome = "won" | "lost" | "quit";

/** What the statistics record for a settled round; a lost round banks nothing. */
export function roundStatsResult(
  status: "win" | "lose" | "quit",
  currentScore: number,
): { outcome: StatsOutcome; coins: number } {
  return {
    outcome: status === "win" ? "won" : status === "lose" ? "lost" : "quit",
    coins: status === "lose" ? 0 : currentScore,
  };
}
