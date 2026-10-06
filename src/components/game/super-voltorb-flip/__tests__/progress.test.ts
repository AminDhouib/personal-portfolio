import { describe, it, expect, afterEach } from "vitest";
import { parseProgress, loadProgress, MAX_LEVEL, MAX_TOTAL_SCORE } from "../progress";

afterEach(() => {
  window.localStorage.clear();
});

describe("parseProgress", () => {
  it("round-trips a valid save", () => {
    expect(parseProgress({ currentLevel: 7, totalScore: 3714 })).toEqual({
      currentLevel: 7,
      totalScore: 3714,
    });
  });

  it("clamps an out-of-range level and total into range", () => {
    expect(parseProgress({ currentLevel: 99, totalScore: 10_000_000 })).toEqual({
      currentLevel: MAX_LEVEL,
      totalScore: MAX_TOTAL_SCORE,
    });
    expect(parseProgress({ currentLevel: 0, totalScore: 0 })).toEqual({
      currentLevel: 1,
      totalScore: 0,
    });
    expect(parseProgress({ currentLevel: -3, totalScore: 5 })?.currentLevel).toBe(1);
  });

  it("returns null for null, strings, arrays and missing fields", () => {
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress("nope")).toBeNull();
    expect(parseProgress([])).toBeNull();
    expect(parseProgress({ currentLevel: 3 })).toBeNull();
    expect(parseProgress({ totalScore: 3 })).toBeNull();
    expect(parseProgress({ currentLevel: "3", totalScore: 3 })).toBeNull();
  });

  it("returns null for NaN and non-integer values", () => {
    expect(parseProgress({ currentLevel: Number.NaN, totalScore: 10 })).toBeNull();
    expect(parseProgress({ currentLevel: 2, totalScore: Number.NaN })).toBeNull();
    expect(parseProgress({ currentLevel: 2.5, totalScore: 10 })).toBeNull();
  });

  it("returns null for a negative total", () => {
    expect(parseProgress({ currentLevel: 4, totalScore: -1 })).toBeNull();
  });
});

describe("loadProgress", () => {
  it("returns null when nothing is stored", () => {
    expect(loadProgress()).toBeNull();
  });

  it("reads back what the persist effect writes", () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 5, totalScore: 120 }),
    );
    expect(loadProgress()).toEqual({ currentLevel: 5, totalScore: 120 });
  });

  it("returns null for corrupt JSON without throwing", () => {
    window.localStorage.setItem("svf:progress", "{not json");
    expect(loadProgress()).toBeNull();
  });
});
