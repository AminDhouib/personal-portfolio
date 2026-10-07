import { BOARD_CONFIGS, isRejected } from "./hgss";
import { ACCEPT_RATE, layoutCount } from "./solver-prior";
import type { CellValue } from "./types";

// Exact Voltorb Flip odds from the clues. Every 5x5 layout that fits the row
// and column clues (and any revealed tiles) is enumerated, then weighted by
// how HGSS deals boards: a layout's weight is the sum, over board configs
// with its card counts that the chosen level allows, of
//   prior(config) / (layoutCount(config) * ACCEPT_RATE[config])
// when the config's free-multiplier caps accept it. When no config can
// produce any fitting layout (a typo, or a board from another game), every
// fitting layout counts equally and the result says so.

export type LineClue = { coins: number; voltorbs: number };
export type Revealed = 1 | 2 | 3 | null;

export type SolverInput = {
  rows: readonly LineClue[];
  cols: readonly LineClue[];
  /** Row-major; a number for a tile already flipped, null for a face-down tile. */
  revealed: readonly Revealed[];
  /** The level shown in the game (1-8), or null when unknown. */
  level: number | null;
};

export type TileOdds = { voltorb: number; one: number; two: number; three: number };

export type SolverResult =
  | {
      status: "solved";
      /** Fitting layouts, before weighting. */
      layouts: number;
      weighting: "hgss" | "uniform";
      tiles: TileOdds[];
      /** The face-down tile to flip next, or null when no face-down tile can be a 2 or 3. */
      best: number | null;
    }
  | { status: "invalid"; reason: "line" | "totals" | "none" }
  | { status: "too-many" };

/** Layout visits after which the solver gives up and asks for a revealed tile. */
export const MAX_LAYOUTS = 2_000_000;

const VALUES: readonly CellValue[] = ["V", 1, 2, 3];

// Every way to fill one line of five tiles, grouped by its clue.
const LINES_BY_CLUE: ReadonlyMap<string, readonly CellValue[][]> = (() => {
  const map = new Map<string, CellValue[][]>();
  for (let code = 0; code < 1024; code++) {
    const line: CellValue[] = [];
    let coins = 0;
    let voltorbs = 0;
    for (let i = 0; i < 5; i++) {
      const value = VALUES[(code >> (2 * i)) & 3] ?? 1;
      line.push(value);
      if (value === "V") voltorbs += 1;
      else coins += value;
    }
    const key = `${coins}:${voltorbs}`;
    const list = map.get(key) ?? [];
    list.push(line);
    map.set(key, list);
  }
  return map;
})();

// Configs by card counts: "voltorbs:twos:threes" -> board ids.
const CONFIGS_BY_COUNTS: ReadonlyMap<string, readonly number[]> = (() => {
  const map = new Map<string, number[]>();
  BOARD_CONFIGS.forEach((c, id) => {
    const key = `${c.voltorbs}:${c.twos}:${c.threes}`;
    map.set(key, [...(map.get(key) ?? []), id]);
  });
  return map;
})();

const INVERSE_SIZE: readonly number[] = BOARD_CONFIGS.map(
  (c, id) => 1 / (layoutCount(c) * (ACCEPT_RATE[id] ?? 1)),
);

const lineFits = (clue: LineClue) =>
  Number.isInteger(clue.coins) &&
  Number.isInteger(clue.voltorbs) &&
  clue.voltorbs >= 0 &&
  clue.voltorbs <= 5 &&
  clue.coins >= 5 - clue.voltorbs &&
  clue.coins <= 3 * (5 - clue.voltorbs);

export function validateClues(input: Pick<SolverInput, "rows" | "cols">): "line" | "totals" | null {
  const lines = [...input.rows, ...input.cols];
  if (input.rows.length !== 5 || input.cols.length !== 5 || !lines.every(lineFits)) return "line";
  const sum = (list: readonly LineClue[], key: keyof LineClue) =>
    list.reduce((s, c) => s + c[key], 0);
  if (sum(input.rows, "coins") !== sum(input.cols, "coins")) return "totals";
  if (sum(input.rows, "voltorbs") !== sum(input.cols, "voltorbs")) return "totals";
  return null;
}

function prior(id: number, level: number | null): number {
  if (level === null) return 1 / 80;
  return Math.floor(id / 10) + 1 === level ? 1 / 10 : 0;
}

function hgssWeight(cells: readonly CellValue[], level: number | null): number {
  let voltorbs = 0;
  let twos = 0;
  let threes = 0;
  for (const cell of cells) {
    if (cell === "V") voltorbs += 1;
    else if (cell === 2) twos += 1;
    else if (cell === 3) threes += 1;
  }
  let weight = 0;
  for (const id of CONFIGS_BY_COUNTS.get(`${voltorbs}:${twos}:${threes}`) ?? []) {
    const config = BOARD_CONFIGS[id];
    const p = prior(id, level);
    if (config && p > 0 && !isRejected(cells, config)) weight += p * (INVERSE_SIZE[id] ?? 0);
  }
  return weight;
}

export function solve(input: SolverInput): SolverResult {
  const invalid = validateClues(input);
  if (invalid) return { status: "invalid", reason: invalid };

  const rowOptions = input.rows.map((clue, r) =>
    (LINES_BY_CLUE.get(`${clue.coins}:${clue.voltorbs}`) ?? []).filter((line) =>
      line.every((value, c) => {
        const shown = input.revealed[r * 5 + c];
        return shown === null || shown === undefined || shown === value;
      }),
    ),
  );

  const hgss = new Float64Array(100);
  const uniform = new Float64Array(100);
  let hgssTotal = 0;
  let layouts = 0;
  let tooMany = false;
  const cells: CellValue[] = Array<CellValue>(25).fill(1);
  const colCoins = [0, 0, 0, 0, 0];
  const colVoltorbs = [0, 0, 0, 0, 0];

  const visit = (row: number): void => {
    if (tooMany) return;
    if (row === 5) {
      for (let c = 0; c < 5; c++) {
        if (colCoins[c] !== input.cols[c]?.coins || colVoltorbs[c] !== input.cols[c]?.voltorbs) {
          return;
        }
      }
      layouts += 1;
      if (layouts > MAX_LAYOUTS) {
        tooMany = true;
        return;
      }
      const weight = hgssWeight(cells, input.level);
      hgssTotal += weight;
      cells.forEach((value, i) => {
        const slot = i * 4 + VALUES.indexOf(value);
        uniform[slot] = (uniform[slot] ?? 0) + 1;
        hgss[slot] = (hgss[slot] ?? 0) + weight;
      });
      return;
    }
    const rowsLeft = 4 - row;
    for (const line of rowOptions[row] ?? []) {
      let fits = true;
      for (let c = 0; c < 5 && fits; c++) {
        const value = line[c] ?? 1;
        const target = input.cols[c];
        if (!target) return;
        const v = (colVoltorbs[c] ?? 0) + (value === "V" ? 1 : 0);
        const coins = (colCoins[c] ?? 0) + (value === "V" ? 0 : value);
        const vLeft = target.voltorbs - v;
        const coinsLeft = target.coins - coins;
        // The rows still to come must be able to finish this column exactly.
        if (vLeft < 0 || vLeft > rowsLeft) fits = false;
        else if (coinsLeft < rowsLeft - vLeft || coinsLeft > 3 * (rowsLeft - vLeft)) fits = false;
      }
      if (!fits) continue;
      for (let c = 0; c < 5; c++) {
        const value = line[c] ?? 1;
        cells[row * 5 + c] = value;
        if (value === "V") colVoltorbs[c] = (colVoltorbs[c] ?? 0) + 1;
        else colCoins[c] = (colCoins[c] ?? 0) + value;
      }
      visit(row + 1);
      for (let c = 0; c < 5; c++) {
        const value = line[c] ?? 1;
        if (value === "V") colVoltorbs[c] = (colVoltorbs[c] ?? 0) - 1;
        else colCoins[c] = (colCoins[c] ?? 0) - value;
      }
      if (tooMany) return;
    }
  };
  visit(0);

  if (tooMany) return { status: "too-many" };
  if (layouts === 0) return { status: "invalid", reason: "none" };

  const useHgss = hgssTotal > 0;
  const weights = useHgss ? hgss : uniform;
  const total = useHgss ? hgssTotal : layouts;
  const tiles: TileOdds[] = Array.from({ length: 25 }, (_, i) => ({
    voltorb: (weights[i * 4] ?? 0) / total,
    one: (weights[i * 4 + 1] ?? 0) / total,
    two: (weights[i * 4 + 2] ?? 0) / total,
    three: (weights[i * 4 + 3] ?? 0) / total,
  }));

  let best: number | null = null;
  tiles.forEach((tile, i) => {
    if (input.revealed[i] !== null && input.revealed[i] !== undefined) return;
    const multiplier = tile.two + tile.three;
    if (multiplier <= 0) return;
    const current = best === null ? undefined : tiles[best];
    if (
      !current ||
      tile.voltorb < current.voltorb ||
      (tile.voltorb === current.voltorb && multiplier > current.two + current.three)
    ) {
      best = i;
    }
  });

  return { status: "solved", layouts, weighting: useHgss ? "hgss" : "uniform", tiles, best };
}

/** Odds as a short label that never shows 0% or 100% unless it is exact. */
export function formatOdds(p: number): string {
  if (p <= 0) return "0%";
  if (p >= 1) return "100%";
  if (p < 0.005) return "<1%";
  if (p > 0.995) return ">99%";
  return `${Math.round(p * 100)}%`;
}
