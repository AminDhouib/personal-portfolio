import { describe, it, expect } from "vitest";
import {
  clampBoardSize,
  isRoundLive,
  isRoundOver,
  padDigits,
  parseBoardSize,
  payoutPlan,
  roundStatsResult,
  tallyStride,
  tileRisk,
} from "../play-rules";
import type { Cell, CellValue } from "../types";

const cell = (value: CellValue, isFlipped = false): Cell => ({
  value,
  isFlipped,
  isFlagged: false,
  flags: { 1: false, 2: false, 3: false, V: false },
});
const grid = (n: number, flipped: [number, number][] = []): Cell[][] =>
  Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) =>
      cell(
        1,
        flipped.some(([fr, fc]) => fr === r && fc === c),
      ),
    ),
  );

describe("parseBoardSize", () => {
  it("defaults to 5", () => {
    expect(parseBoardSize("")).toBe(5);
    expect(parseBoardSize("?size=")).toBe(5);
    expect(parseBoardSize("?size=abc")).toBe(5);
  });
  it("accepts 2..10 and nothing outside it", () => {
    expect(parseBoardSize("?size=2")).toBe(2);
    expect(parseBoardSize("?size=10")).toBe(10);
    expect(parseBoardSize("?size=1")).toBe(5);
    expect(parseBoardSize("?size=11")).toBe(5);
    expect(parseBoardSize("?size=7.9")).toBe(7);
  });
});

describe("clampBoardSize", () => {
  it("rounds then clamps to 2..10", () => {
    expect(clampBoardSize(0)).toBe(2);
    expect(clampBoardSize(2.4)).toBe(2);
    expect(clampBoardSize(6.5)).toBe(7);
    expect(clampBoardSize(99)).toBe(10);
  });
});

describe("round status", () => {
  it("splits live from over", () => {
    expect(isRoundLive("playing")).toBe(true);
    expect(isRoundLive("memo")).toBe(true);
    expect(isRoundLive("win")).toBe(false);
    expect(isRoundOver("win")).toBe(true);
    expect(isRoundOver("lose")).toBe(true);
    expect(isRoundOver("quit")).toBe(true);
    expect(isRoundOver("playing")).toBe(false);
    expect(isRoundOver("memo")).toBe(false);
  });
});

describe("padDigits", () => {
  it("zero-pads and never truncates", () => {
    expect(padDigits(7, 2)).toBe("07");
    expect(padDigits(42, 5)).toBe("00042");
    expect(padDigits(123456, 5)).toBe("123456");
  });
});

describe("tileRisk", () => {
  it("is not high risk below 75%", () => {
    expect(tileRisk(grid(5), 2, 2, 0, 0)).toEqual({ definitive: false, highRisk: false });
  });
  it("is high risk at 75% density in either line", () => {
    const g = grid(4);
    expect(tileRisk(g, 3, 1, 0, 0)).toEqual({ definitive: false, highRisk: true });
    expect(tileRisk(g, 1, 3, 0, 0)).toEqual({ definitive: false, highRisk: true });
  });
  it("reads the column on its own at a non-zero (row, col)", () => {
    // column 2 has two flipped (3 voltorbs over 2 left = 150%); row stays at 1 over 3 = 33%
    const g = grid(4, [
      [1, 2],
      [2, 2],
    ]);
    expect(tileRisk(g, 1, 3, 2, 2)).toEqual({ definitive: false, highRisk: true });
    expect(tileRisk(g, 1, 3, 1, 2)).toEqual({ definitive: false, highRisk: true });
    // aimed at an untouched column the same voltorb count is only 50%
    expect(tileRisk(g, 1, 2, 1, 0)).toEqual({ definitive: false, highRisk: false });
  });
  it("reads the row on its own at a non-zero (row, col)", () => {
    // row 2 has two flipped (3 voltorbs over 2 left = 150%); column stays at 1 over 3 = 33%
    const g = grid(4, [
      [2, 1],
      [2, 3],
    ]);
    expect(tileRisk(g, 3, 1, 2, 1)).toEqual({ definitive: false, highRisk: true });
    expect(tileRisk(g, 2, 1, 0, 1)).toEqual({ definitive: false, highRisk: false });
  });
  it("treats 0% and 100% lines as definitive, never high risk", () => {
    expect(tileRisk(grid(5), 3, 0, 0, 0)).toEqual({ definitive: true, highRisk: false });
    expect(tileRisk(grid(5), 5, 4, 0, 0)).toEqual({ definitive: true, highRisk: false });
  });
  it("counts only unflipped tiles, with at least one remaining", () => {
    const g = grid(4, [
      [0, 1],
      [0, 2],
    ]);
    // row: 3 voltorbs over 2 unflipped = 150%, so high risk
    expect(tileRisk(g, 3, 1, 0, 0)).toEqual({ definitive: false, highRisk: true });
    // every tile of the row flipped: remaining floors at 1, 1 voltorb = 100%
    const g2 = grid(3, [
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(tileRisk(g2, 1, 1, 0, 0)).toEqual({ definitive: true, highRisk: false });
  });
});

describe("tallyStride and payoutPlan", () => {
  it("scales the rollup stride with the target", () => {
    expect(tallyStride(0)).toBe(1);
    expect(tallyStride(100)).toBe(1);
    expect(tallyStride(101)).toBe(2);
    expect(tallyStride(500)).toBe(5);
  });
  it("bounds the drain to 100 iterations", () => {
    expect(payoutPlan(30)).toEqual({ coinsPerTick: 1, iterations: 30 });
    expect(payoutPlan(100)).toEqual({ coinsPerTick: 1, iterations: 100 });
    expect(payoutPlan(250)).toEqual({ coinsPerTick: 3, iterations: 84 });
    expect(payoutPlan(0)).toEqual({ coinsPerTick: 1, iterations: 0 });
    expect(payoutPlan(10000)).toEqual({ coinsPerTick: 100, iterations: 100 });
  });
});

describe("roundStatsResult", () => {
  it("banks nothing on a loss", () => {
    expect(roundStatsResult("win", 12)).toEqual({ outcome: "won", coins: 12 });
    expect(roundStatsResult("lose", 12)).toEqual({ outcome: "lost", coins: 0 });
    expect(roundStatsResult("quit", 12)).toEqual({ outcome: "quit", coins: 12 });
  });
});
