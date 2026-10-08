// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BONUS_STREAK_CAP, LAND_POINTS, chainPoints, perfectPoints, scoreRange } from "../scoring";

describe("perfectPoints", () => {
  it("is 10 plus 10 per streak step, capped at 5 steps", () => {
    expect(LAND_POINTS).toBe(10);
    expect(BONUS_STREAK_CAP).toBe(5);
    expect([1, 2, 3, 4, 5, 6, 40].map(perfectPoints)).toEqual([20, 30, 40, 50, 60, 60, 60]);
  });
});

describe("chainPoints", () => {
  it("sums a chain of perfects, in closed form past the cap", () => {
    expect(chainPoints(0)).toBe(0);
    expect(chainPoints(1)).toBe(20);
    expect(chainPoints(3)).toBe(90);
    expect(chainPoints(5)).toBe(200);
    expect(chainPoints(7)).toBe(320);
    expect(chainPoints(99_999)).toBe(200 + (99_999 - 5) * 60);
  });
});

describe("scoreRange", () => {
  it("is exact when there are no perfects", () => {
    expect(scoreRange(7, 0, 0)).toEqual({ min: 70, max: 70 });
    expect(scoreRange(0, 0, 0)).toEqual({ min: 0, max: 0 });
  });

  it("bounds 20 floors with 6 perfects and a best streak of 3 to [290, 320]", () => {
    // plain = 14 * 10; max: two chains of 3 (90 each); min: one chain of 3 plus three singles (20 each)
    expect(scoreRange(20, 6, 3)).toEqual({ min: 290, max: 320 });
  });

  it("matches the scripted seed-7 run (7 floors, 5 perfects, streak 5, 220 points)", () => {
    expect(scoreRange(7, 5, 5)).toEqual({ min: 220, max: 220 });
  });

  it("returns null for counts that contradict each other", () => {
    expect(scoreRange(5, 6, 1)).toBeNull(); // more perfects than floors
    expect(scoreRange(9, 4, 5)).toBeNull(); // streak longer than the perfects
    expect(scoreRange(9, 2, 0)).toBeNull(); // perfects with no streak
    expect(scoreRange(9, 0, 1)).toBeNull(); // a streak with no perfect
  });
});
