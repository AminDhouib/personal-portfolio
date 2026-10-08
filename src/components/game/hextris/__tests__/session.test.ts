import { describe, expect, it } from "vitest";
import { arcadeSubmission, isRecordableRun, recordHighScore, runSeed } from "../session";

describe("isRecordableRun", () => {
  it("rejects a 0-point run", () => {
    expect(isRecordableRun(0)).toBe(false);
  });

  it("accepts a positive score", () => {
    expect(isRecordableRun(1)).toBe(true);
  });

  it("rejects a negative score", () => {
    expect(isRecordableRun(-5)).toBe(false);
  });
});

describe("recordHighScore", () => {
  it("keeps the best three, highest first", () => {
    expect(recordHighScore([], 40)).toEqual([40]);
    expect(recordHighScore([90, 10], 40)).toEqual([90, 40, 10]);
    expect(recordHighScore([90, 40, 10], 50)).toEqual([90, 50, 40]);
    expect(recordHighScore([90, 40, 10], 5)).toEqual([90, 40, 10]);
  });

  it("leaves the list alone for a run that scored nothing", () => {
    expect(recordHighScore([90, 40], 0)).toEqual([90, 40]);
  });

  it("does not change the list it is given", () => {
    const list = [90, 40, 10];
    recordHighScore(list, 50);
    expect(list).toEqual([90, 40, 10]);
  });
});

describe("arcadeSubmission", () => {
  const run = { score: 4321, level: 7.8, elapsedMs: 125_999, cellsCleared: 88 };

  it("sends the run's whole level, whole seconds and cleared cells", () => {
    expect(arcadeSubmission("Kite", run)).toEqual({
      name: "Kite",
      score: 4321,
      level: 7,
      seconds: 125,
      kills: 88,
    });
  });

  it("never sends a level below 1", () => {
    expect(arcadeSubmission("Kite", { ...run, level: 0.5 }).level).toBe(1);
  });

  it("trims the name, caps it at 12 characters and falls back to Player", () => {
    expect(arcadeSubmission("  Kite  ", run).name).toBe("Kite");
    expect(arcadeSubmission("abcdefghijklmnop", run).name).toBe("abcdefghijkl");
    expect(arcadeSubmission("   ", run).name).toBe("Player");
  });
});

describe("runSeed", () => {
  const draw = () => 99;

  it("draws a fresh seed when no override is allowed or given", () => {
    expect(runSeed("?seed=7", false, draw)).toBe(99);
    expect(runSeed("", true, draw)).toBe(99);
  });

  it("honours ?seed when overrides are allowed", () => {
    expect(runSeed("?seed=7", true, draw)).toBe(7);
    expect(runSeed("?x=1&seed=4294967295", true, draw)).toBe(4294967295);
    expect(runSeed("?seed=0", true, draw)).toBe(0);
  });

  it("ignores a seed that is not a 32-bit unsigned integer", () => {
    for (const bad of ["?seed=", "?seed=-1", "?seed=1.5", "?seed=4294967296", "?seed=abc"]) {
      expect(runSeed(bad, true, draw)).toBe(99);
    }
  });
});
