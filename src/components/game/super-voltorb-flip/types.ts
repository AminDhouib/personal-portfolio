// ---------------------------------------------------------------------------
// src/utils/constants.ts — COLORS and LEVELS table (1:1).
// ---------------------------------------------------------------------------

export const COLORS: string[] = ["#e77352", "#5eae43", "#efa539", "#3194ff", "#c872e7"];

export type FlagValues = { 1: boolean; 2: boolean; 3: boolean; V: boolean };

export type CellValue = 1 | 2 | 3 | "V";

export type Cell = {
  value: CellValue;
  flags: FlagValues;
  isFlipped: boolean;
  isFlagged: boolean;
};

export type RowColValues = {
  coins: number;
  voltorbs: number;
};

export type GameStatus = "playing" | "win" | "lose" | "memo";
