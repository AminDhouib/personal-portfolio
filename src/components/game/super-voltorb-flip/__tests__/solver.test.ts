import { describe, it, expect } from "vitest";
import { generateLayout } from "../hgss";
import { formatOdds, solve, validateClues, type LineClue, type SolverInput } from "../solver";
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

describe("formatOdds", () => {
  it("never rounds a possible outcome to 0% or a possible miss to 100%", () => {
    expect(formatOdds(0)).toBe("0%");
    expect(formatOdds(0.001)).toBe("<1%");
    expect(formatOdds(0.5)).toBe("50%");
    expect(formatOdds(0.999)).toBe(">99%");
    expect(formatOdds(1)).toBe("100%");
  });
});
