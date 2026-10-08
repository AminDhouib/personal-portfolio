import { describe, it, expect } from "vitest";
import {
  PATTERNS,
  comboWindowMs,
  fallRowsPerSecond,
  levelFor,
  makePiece,
  pickPattern,
  spawnIntervalMs,
} from "../director";
import { advance, start } from "../step";
import { COLOURS, createRun } from "../state";
import type { EngineEvent } from "../types";

function levels(): number[] {
  const out: number[] = [];
  for (let l = 1; l <= 35; l += 0.25) out.push(l);
  return out;
}

describe("tuning curves", () => {
  it("eases the spawn interval from 1500 ms to 480 ms, never rising with level", () => {
    expect(spawnIntervalMs(1)).toBe(1500);
    expect(spawnIntervalMs(35)).toBe(480);
    let previous = Infinity;
    for (const level of levels()) {
      const ms = spawnIntervalMs(level);
      expect(ms).toBeGreaterThanOrEqual(480);
      expect(ms).toBeLessThanOrEqual(1500);
      expect(ms).toBeLessThanOrEqual(previous);
      previous = ms;
    }
  });

  it("raises the fall speed from 2.6 to 8.5 rows per second", () => {
    expect(fallRowsPerSecond(1)).toBeCloseTo(2.6, 9);
    expect(fallRowsPerSecond(35)).toBeCloseTo(8.5, 9);
    expect(fallRowsPerSecond(18)).toBeGreaterThan(2.6);
    expect(fallRowsPerSecond(18)).toBeLessThan(8.5);
  });

  it("shrinks the combo window from 2800 ms to 1500 ms", () => {
    expect(comboWindowMs(1)).toBe(2800);
    expect(comboWindowMs(35)).toBe(1500);
    expect(comboWindowMs(10)).toBeLessThan(2800);
  });

  it("computes the level from cells cleared and play time, capped at 35", () => {
    expect(levelFor(0, 0)).toBe(1);
    expect(levelFor(100, 45_000)).toBeCloseTo(8, 9);
    expect(levelFor(10_000, 0)).toBe(35);
  });
});

describe("pickPattern", () => {
  it("never picks a pattern below its minimum level", () => {
    const s = createRun({ seed: 3 });
    for (const level of levels()) {
      for (let i = 0; i < 60; i++) {
        expect(pickPattern(s, level).minLevel).toBeLessThanOrEqual(level);
      }
    }
  });

  it("only picks singles at level 1 and reaches every pattern by level 12", () => {
    const s = createRun({ seed: 4 });
    for (let i = 0; i < 100; i++) expect(pickPattern(s, 1).name).toBe("single");
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(pickPattern(s, 12).name);
    expect([...seen].sort()).toEqual(PATTERNS.map((p) => p.name).sort());
  });
});

describe("makePiece", () => {
  it("never deals the same colour three times in a row", () => {
    const s = createRun({ seed: 11 });
    const colours = Array.from({ length: 3000 }, () => makePiece(s, 0).colour);
    for (let i = 2; i < colours.length; i++) {
      const triple = colours[i] === colours[i - 1] && colours[i] === colours[i - 2];
      expect(triple).toBe(false);
    }
    expect(new Set(colours).size).toBe(COLOURS);
  });

  it("deals no specials until the run has reached the unlock combos", () => {
    const s = createRun({ seed: 12 });
    const count = (special: string) =>
      Array.from({ length: 4000 }, () => makePiece(s, 0)).filter((p) => p.special === special)
        .length;
    expect(count("bomb") + count("rainbow")).toBe(0);
    s.bestCombo = 3;
    expect(count("bomb")).toBeGreaterThan(40);
    expect(count("rainbow")).toBe(0);
    s.bestCombo = 5;
    expect(count("rainbow")).toBeGreaterThan(20);
  });
});

describe("spawning", () => {
  it("opens a run with a single piece at the outer edge", () => {
    const s = createRun({ seed: 21 });
    start(s);
    advance(s, 100);
    const spawns = s.events.filter((e): e is Extract<EngineEvent, { type: "spawn" }> => {
      return e.type === "spawn";
    });
    expect(spawns).toHaveLength(1);
    expect(s.falling).toHaveLength(1);
  });

  it("keeps spawning on the beat for the current level", () => {
    const s = createRun({ seed: 22 });
    start(s);
    advance(s, 1500 * 4 + 50);
    const spawns = s.events.filter((e) => e.type === "spawn");
    // Level stays near 1 for six seconds, so roughly one beat per 1.5 s.
    expect(spawns.length).toBeGreaterThanOrEqual(4);
    expect(spawns.length).toBeLessThanOrEqual(6);
  });
});
