import { describe, it, expect } from "vitest";
import { BOARD_CONFIGS, generateLayout, isRejected } from "../hgss";
import { ACCEPT_RATE, layoutCount } from "../solver-prior";
import {
  formatOdds,
  hgssWeight,
  solve,
  validateClues,
  type LineClue,
  type SolverInput,
} from "../solver";
import type { CellValue } from "../types";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cluesOf(cells: readonly CellValue[]): { rows: LineClue[]; cols: LineClue[] } {
  const line = (indices: number[]): LineClue => ({
    coins: indices.reduce((sum, i) => sum + (cells[i] === "V" ? 0 : (cells[i] as number)), 0),
    voltorbs: indices.filter((i) => cells[i] === "V").length,
  });
  const range = [0, 1, 2, 3, 4];
  return {
    rows: range.map((r) => line(range.map((c) => r * 5 + c))),
    cols: range.map((c) => line(range.map((r) => r * 5 + c))),
  };
}

const faceDown = (): SolverInput["revealed"] => Array(25).fill(null);

describe("validateClues", () => {
  it("rejects a line whose coins cannot fit its Voltorb count", () => {
    const ones = Array<CellValue>(25).fill(1);
    const { rows, cols } = cluesOf(ones);
    expect(validateClues({ rows: [{ coins: 16, voltorbs: 0 }, ...rows.slice(1)], cols })).toBe(
      "line",
    );
    expect(validateClues({ rows: [{ coins: 3, voltorbs: 1 }, ...rows.slice(1)], cols })).toBe(
      "line",
    );
  });

  it("rejects rows and columns that disagree on the totals", () => {
    const { rows, cols } = cluesOf(Array<CellValue>(25).fill(1));
    expect(validateClues({ rows: [{ coins: 6, voltorbs: 0 }, ...rows.slice(1)], cols })).toBe(
      "totals",
    );
  });

  it("accepts a real board's clues", () => {
    expect(validateClues(cluesOf(generateLayout(12, mulberry32(3))))).toBeNull();
  });
});

describe("solve", () => {
  it("an all-1s board has one layout, no HGSS match, and no tile worth flipping", () => {
    const result = solve({
      ...cluesOf(Array<CellValue>(25).fill(1)),
      revealed: faceDown(),
      level: null,
    });
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(result.layouts).toBe(1);
    expect(result.weighting).toBe("uniform");
    expect(result.tiles.every((t) => t.one === 1)).toBe(true);
    expect(result.best).toBeNull();
  });

  it("on real HGSS boards: odds sum to 1, the true value is always possible, Voltorb-free lines are safe", () => {
    let maxLayouts = 0;
    for (let id = 0; id < 80; id += 3) {
      const cells = generateLayout(id, mulberry32(500 + id));
      const clues = cluesOf(cells);
      const result = solve({ ...clues, revealed: faceDown(), level: null });
      expect(result.status, `board ${id}`).toBe("solved");
      if (result.status !== "solved") continue;
      expect(result.weighting).toBe("hgss");
      maxLayouts = Math.max(maxLayouts, result.layouts);
      result.tiles.forEach((t, i) => {
        expect(t.voltorb + t.one + t.two + t.three).toBeCloseTo(1, 9);
        const truth = cells[i];
        const p = truth === "V" ? t.voltorb : truth === 1 ? t.one : truth === 2 ? t.two : t.three;
        expect(p, `board ${id} tile ${i}`).toBeGreaterThan(0);
        const row = Math.floor(i / 5);
        const col = i % 5;
        if (clues.rows[row]?.voltorbs === 0 || clues.cols[col]?.voltorbs === 0) {
          expect(t.voltorb).toBe(0);
        }
      });
    }
    // Recorded so a slow enumeration shows up in review; not a hard limit.
    console.info(`max layouts over sampled boards: ${maxLayouts}`);
  });

  it("revealing every tile pins the layout", () => {
    const cells = generateLayout(40, mulberry32(9));
    const revealed = cells.map((c) => (c === "V" ? null : c));
    const result = solve({ ...cluesOf(cells), revealed, level: 5 });
    expect(result.status).toBe("solved");
    if (result.status !== "solved") return;
    expect(result.layouts).toBe(1);
    result.tiles.forEach((t, i) =>
      expect(cells[i] === "V" ? t.voltorb : 0).toBe(cells[i] === "V" ? 1 : 0),
    );
    expect(result.best).toBeNull();
  });

  it("a revealed value that contradicts the clues has no layout", () => {
    const cells = Array<CellValue>(25).fill(1);
    const revealed = faceDown().slice();
    revealed[0] = 3;
    expect(solve({ ...cluesOf(cells), revealed, level: null })).toEqual({
      status: "invalid",
      reason: "none",
    });
  });

  it("a level that cannot deal these clues falls back to equal weights", () => {
    // Lv.1 boards have 6 Voltorbs; no Lv.8 board does.
    const cells = generateLayout(3, mulberry32(4));
    const result = solve({ ...cluesOf(cells), revealed: faceDown(), level: 8 });
    expect(result.status).toBe("solved");
    if (result.status === "solved") expect(result.weighting).toBe("uniform");
  });

  it("picks a safe tile that can still hold a multiplier when one exists", () => {
    const cells = generateLayout(0, mulberry32(21));
    const result = solve({ ...cluesOf(cells), revealed: faceDown(), level: 1 });
    expect(result.status).toBe("solved");
    if (result.status !== "solved" || result.best === null) return;
    const best = result.tiles[result.best];
    const minRisk = Math.min(
      ...result.tiles.filter((t) => t.two + t.three > 0).map((t) => t.voltorb),
    );
    expect(best?.voltorb).toBe(minRisk);
    expect((best?.two ?? 0) + (best?.three ?? 0)).toBeGreaterThan(0);
  });
});

describe("HGSS deal weighting", () => {
  it("level-1 odds match how often each tile value actually occurs", () => {
    const level = 1;
    const deals = 2500;
    const bins = 10;
    const rng = mulberry32(11);
    const values: CellValue[] = ["V", 1, 2, 3];
    const sumP = Array<number>(bins).fill(0);
    const hits = Array<number>(bins).fill(0);
    const events = Array<number>(bins).fill(0);
    for (let d = 0; d < deals; d++) {
      const board = (level - 1) * 10 + Math.min(9, Math.floor(rng() * 10));
      const cells = generateLayout(board, rng);
      const result = solve({ ...cluesOf(cells), revealed: faceDown(), level });
      if (result.status !== "solved") throw new Error(`board ${board} did not solve`);
      result.tiles.forEach((t, i) => {
        [t.voltorb, t.one, t.two, t.three].forEach((p, v) => {
          const bin = Math.min(bins - 1, Math.floor(p * bins));
          sumP[bin] = (sumP[bin] ?? 0) + p;
          hits[bin] = (hits[bin] ?? 0) + (cells[i] === values[v] ? 1 : 0);
          events[bin] = (events[bin] ?? 0) + 1;
        });
      });
    }
    for (let b = 0; b < bins; b++) {
      const n = events[b] ?? 0;
      if (n < 5000) continue;
      expect(Math.abs((hits[b] ?? 0) / n - (sumP[b] ?? 0) / n), `bin ${b}`).toBeLessThan(0.03);
    }
  });

  it("weighs two same-clue layouts by the boards that can deal each", () => {
    // Boards 10 and 15 share card counts (7 Voltorbs, one 2, three 3s); 15 caps
    // free multipliers on the whole board at 2 instead of 3. Swapping the
    // values at the corners of a rectangle keeps every row and column clue, so
    // find a layout and its swap twin that 10 accepts both of and 15 rejects
    // only the twin. Weighed at the weighting-function level because other
    // layouts also fit the same clues, which would blur an odds-level ratio.
    const loose = BOARD_CONFIGS[10];
    const tight = BOARD_CONFIGS[15];
    if (!loose || !tight) throw new Error("missing configs");
    const rng = mulberry32(5);
    let pair: [CellValue[], CellValue[]] | null = null;
    for (let n = 0; n < 3000 && !pair; n++) {
      const a = generateLayout(10, rng);
      if (isRejected(a, tight)) continue;
      for (let r1 = 0; r1 < 5 && !pair; r1++) {
        for (let r2 = r1 + 1; r2 < 5 && !pair; r2++) {
          for (let c1 = 0; c1 < 5 && !pair; c1++) {
            for (let c2 = c1 + 1; c2 < 5 && !pair; c2++) {
              const x = a[r1 * 5 + c1] as CellValue;
              const y = a[r1 * 5 + c2] as CellValue;
              if (x === y || a[r2 * 5 + c1] !== y || a[r2 * 5 + c2] !== x) continue;
              const b = a.slice();
              b[r1 * 5 + c1] = y;
              b[r1 * 5 + c2] = x;
              b[r2 * 5 + c1] = x;
              b[r2 * 5 + c2] = y;
              if (!isRejected(b, loose) && isRejected(b, tight)) pair = [a, b];
            }
          }
        }
      }
    }
    if (!pair) throw new Error("no layout pair found");
    const [a, b] = pair;
    expect(cluesOf(a)).toEqual(cluesOf(b));

    const inverse = (id: number) =>
      1 /
      (layoutCount(BOARD_CONFIGS[id] as (typeof BOARD_CONFIGS)[number]) * (ACCEPT_RATE[id] ?? 1));
    // Level 2 allows boards 10 and 15 for these card counts, 1/10 each.
    expect(hgssWeight(b, 2) / (0.1 * inverse(10))).toBeCloseTo(1, 9);
    expect(hgssWeight(a, 2) / (0.1 * (inverse(10) + inverse(15)))).toBeCloseTo(1, 9);
    const ratio = hgssWeight(a, 2) / hgssWeight(b, 2);
    expect(ratio).toBeCloseTo(1 + inverse(15) / inverse(10), 9);
    expect(ratio).toBeGreaterThan(1);
    // Unknown level: still only boards 10 and 15 deal these counts, 1/80 each.
    expect(hgssWeight(a, null) / hgssWeight(b, null)).toBeCloseTo(ratio, 9);
    // A level with no board of these card counts cannot deal either layout.
    expect(hgssWeight(a, 5)).toBe(0);
  });
});

describe("formatOdds", () => {
  it("never rounds a possible outcome to 0% or a possible miss to 100%", () => {
    expect(formatOdds(0)).toBe("0%");
    expect(formatOdds(0.001)).toBe("<1%");
    expect(formatOdds(0.5)).toBe("50%");
    expect(formatOdds(0.999)).toBe(">99%");
    expect(formatOdds(1)).toBe("100%");
  });
});
