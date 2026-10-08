import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/components/game/password-game-2/engine/rng";
import { createRun, drainEvents, nextRandom, SIDES } from "../state";

describe("createRun", () => {
  it("starts empty, ready, at level 1 with the full boundary", () => {
    const s = createRun({ seed: 42 });
    expect(s.phase).toBe("ready");
    expect(s.sides).toHaveLength(SIDES);
    expect(s.sides.every((side) => side.length === 0)).toBe(true);
    expect(s.level).toBe(1);
    expect(s.limitRows).toBe(12);
    expect(s.score).toBe(0);
    expect(s.cellsCleared).toBe(0);
  });

  it("is a plain serialisable object", () => {
    const s = createRun({ seed: 42 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("starts with no pieces, combo 1, no momentum and the boundary disarmed", () => {
    const s = createRun({ seed: 7 });
    expect(s.falling).toEqual([]);
    expect(s.combo).toBe(1);
    expect(s.momentum).toBe(0);
    expect(s.boundaryArmed).toBe(false);
    expect(s.facing).toBe(0);
    expect(s.events).toEqual([]);
  });
});

describe("nextRandom", () => {
  it("is exactly the mulberry32 stream for the seed", () => {
    const s = createRun({ seed: 2024 });
    const reference = mulberry32(2024);
    for (let i = 0; i < 50; i++) expect(nextRandom(s)).toBe(reference());
  });

  it("is deterministic per seed and advances the stored state", () => {
    const a = createRun({ seed: 99 });
    const b = createRun({ seed: 99 });
    const drawsA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const drawsB = [nextRandom(b), nextRandom(b), nextRandom(b)];
    expect(drawsA).toEqual(drawsB);
    expect(new Set(drawsA).size).toBe(3);
    expect(a.rngState).toBe(b.rngState);
    for (const d of drawsA) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(1);
    }
  });

  it("gives different streams for different seeds", () => {
    expect(nextRandom(createRun({ seed: 1 }))).not.toBe(nextRandom(createRun({ seed: 2 })));
  });
});

describe("drainEvents", () => {
  it("hands over the queued events and leaves the queue empty", () => {
    const s = createRun({ seed: 1 });
    s.events.push({ type: "run-start" }, { type: "pause" });
    expect(drainEvents(s)).toEqual([{ type: "run-start" }, { type: "pause" }]);
    expect(s.events).toEqual([]);
    expect(drainEvents(s)).toEqual([]);
  });
});

describe("a new run", () => {
  it("starts with a fresh best combo, so specials are locked again", () => {
    const old = createRun({ seed: 1 });
    old.bestCombo = 9;
    old.sides[0]?.push({ colour: 1, special: "bomb" });
    const fresh = createRun({ seed: 1 });
    expect(fresh.bestCombo).toBe(1);
    expect(fresh.sides[0]).toEqual([]);
  });
});
