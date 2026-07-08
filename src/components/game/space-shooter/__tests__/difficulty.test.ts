import { describe, it, expect, vi, afterEach } from "vitest";
import {
  difficulty,
  elapsedSeconds,
  comboMultiplier,
  comboColor,
  unlockedVariants,
} from "../difficulty";
import type { GameRefs } from "../types";

// Characterization tests: pin the CURRENT behavior of the pure difficulty
// helpers. These are not aspirational -- every asserted value was derived by
// evaluating the shipped formulas, so they lock in the implementation as-is.
//
// difficulty() and elapsedSeconds() both read `performance.now() - g.startedAt`,
// so the elapsed seconds `t` is controlled by fixing `g.startedAt` and stubbing
// performance.now(). Only the two fields those functions touch are populated on
// the stub ref -- the rest of GameRefs is irrelevant here.

function refAt(elapsedMs: number, isMobile: boolean): GameRefs {
  // startedAt is pinned to 0 and performance.now() is stubbed to `elapsedMs`,
  // so (now - startedAt) / 1000 === elapsedMs / 1000 seconds.
  return { startedAt: 0, isMobile } as unknown as GameRefs;
}

describe("difficulty helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("elapsedSeconds", () => {
    it("returns whole seconds since startedAt", () => {
      vi.spyOn(performance, "now").mockReturnValue(5000);
      expect(elapsedSeconds(refAt(5000, false))).toBe(5);
    });

    it("returns 0 at t=0 and fractional seconds mid-way", () => {
      const g = refAt(0, false);
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(elapsedSeconds(g)).toBe(0);
      vi.spyOn(performance, "now").mockReturnValue(2500);
      expect(elapsedSeconds(g)).toBe(2.5);
    });
  });

  describe("difficulty (desktop)", () => {
    const cases: Array<[number, number]> = [
      [0, 0.25], // sqrt(0)*0.22 + 0.25 = 0.25
      [1, 0.47], // sqrt(1)*0.22 + 0.25 = 0.47
      [4, 0.69], // sqrt(4)=2 -> 2*0.22 + 0.25 = 0.69
      [25, 1.35], // sqrt(25)=5 -> 5*0.22 + 0.25 = 1.35
      [100, 2.45], // sqrt(100)=10 -> 10*0.22 + 0.25 = 2.45
    ];
    for (const [seconds, expected] of cases) {
      it(`t=${seconds}s -> ${expected}`, () => {
        vi.spyOn(performance, "now").mockReturnValue(seconds * 1000);
        expect(difficulty(refAt(seconds * 1000, false))).toBeCloseTo(expected, 10);
      });
    }

    it("caps the base ramp at 3.0 for large t", () => {
      // ramp hits 3.0 at t = ((3 - 0.25) / 0.22)^2 = 156.25s; anything beyond stays 3.0.
      vi.spyOn(performance, "now").mockReturnValue(156.25 * 1000);
      expect(difficulty(refAt(156.25 * 1000, false))).toBeCloseTo(3.0, 10);
      vi.spyOn(performance, "now").mockReturnValue(10_000 * 1000);
      expect(difficulty(refAt(10_000 * 1000, false))).toBe(3.0);
    });
  });

  describe("difficulty (mobile)", () => {
    it("scales the desktop value by 0.88", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(difficulty(refAt(0, true))).toBeCloseTo(0.25 * 0.88, 10);
    });

    it("caps at 3.0 * 0.88 = 2.64 for large t", () => {
      vi.spyOn(performance, "now").mockReturnValue(10_000 * 1000);
      expect(difficulty(refAt(10_000 * 1000, true))).toBeCloseTo(2.64, 10);
    });
  });

  describe("comboMultiplier", () => {
    // Pin every threshold boundary of the step function.
    const cases: Array<[number, number]> = [
      [0, 1],
      [2, 1], // < 3
      [3, 1.5], // >= 3, < 5
      [4, 1.5],
      [5, 2], // >= 5, < 10
      [9, 2],
      [10, 3], // >= 10, < 20
      [19, 3],
      [20, 5], // >= 20, < 40
      [39, 5],
      [40, 10], // >= 40
      [1000, 10],
    ];
    for (const [combo, mult] of cases) {
      it(`combo ${combo} -> x${mult}`, () => {
        expect(comboMultiplier(combo)).toBe(mult);
      });
    }
  });

  describe("comboColor", () => {
    // The color thresholds are offset from the multiplier thresholds -- pin them
    // independently rather than assuming they line up.
    const cases: Array<[number, string]> = [
      [0, "#a3e635"], // < 5
      [4, "#a3e635"],
      [5, "#22d3ee"], // >= 5, < 10
      [9, "#22d3ee"],
      [10, "#facc15"], // >= 10, < 20
      [19, "#facc15"],
      [20, "#fb923c"], // >= 20, < 40
      [39, "#fb923c"],
      [40, "#f472b6"], // >= 40
      [1000, "#f472b6"],
    ];
    for (const [combo, color] of cases) {
      it(`combo ${combo} -> ${color}`, () => {
        expect(comboColor(combo)).toBe(color);
      });
    }
  });

  describe("unlockedVariants", () => {
    it("returns only 'basic' at t=0 and at the first threshold boundary", () => {
      expect(unlockedVariants(0)).toEqual(["basic"]);
      // Thresholds use strict >, so exactly 25s has NOT unlocked heavy yet.
      expect(unlockedVariants(25)).toEqual(["basic"]);
    });

    it("adds variants as the exclusive-lower-bound thresholds are passed", () => {
      expect(unlockedVariants(26)).toEqual(["basic", "heavy"]);
      expect(unlockedVariants(51)).toEqual(["basic", "heavy", "speeder"]);
      expect(unlockedVariants(91)).toEqual(["basic", "heavy", "speeder", "shooter"]);
      expect(unlockedVariants(131)).toEqual(["basic", "heavy", "speeder", "shooter", "zapper"]);
    });

    it("unlocks the full set past 170s, in insertion order", () => {
      expect(unlockedVariants(171)).toEqual([
        "basic",
        "heavy",
        "speeder",
        "shooter",
        "zapper",
        "drone",
      ]);
      // Well beyond the last threshold: still the same complete set.
      expect(unlockedVariants(100_000)).toEqual([
        "basic",
        "heavy",
        "speeder",
        "shooter",
        "zapper",
        "drone",
      ]);
    });
  });
});
