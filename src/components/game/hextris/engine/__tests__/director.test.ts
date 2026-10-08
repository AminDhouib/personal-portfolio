import { describe, it, expect } from "vitest";
import {
  PATTERNS,
  comboWindowMs,
  fallRowsPerSecond,
  levelFor,
  makePiece,
  patternBeats,
  pace,
  pickPattern,
  refreshLevel,
  spawnIntervalMs,
  type PatternName,
} from "../director";
import { advance, rotate } from "../step";
import { COLOURS, TICK_MS, createRun, drainEvents, wrapSide } from "../state";
import type { EngineEvent, RunState } from "../types";
import { startedRun } from "./boards";

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

  it("raises the fall speed from 5.8 to 12 rows per second", () => {
    expect(fallRowsPerSecond(1)).toBeCloseTo(5.8, 9);
    expect(fallRowsPerSecond(35)).toBeCloseTo(12, 9);
    expect(fallRowsPerSecond(18)).toBeGreaterThan(5.8);
    expect(fallRowsPerSecond(18)).toBeLessThan(12);
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

describe("refreshLevel", () => {
  it("reports the whole level when it is crossed, not at the half (decision: floor)", () => {
    const s = createRun({ seed: 1 });
    // 0.06 per cell: 25 cells is level 2.5, 16 cells is level 1.96.
    s.cellsCleared = 16;
    refreshLevel(s);
    expect(s.events).toEqual([]);
    s.cellsCleared = 17;
    refreshLevel(s);
    expect(s.events).toEqual([{ type: "level", level: 2 }]);
    s.cellsCleared = 25;
    refreshLevel(s);
    expect(s.events).toHaveLength(1);
    s.cellsCleared = 34;
    refreshLevel(s);
    expect(s.events.at(-1)).toEqual({ type: "level", level: 3 });
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

describe("pattern shapes", () => {
  const s = createRun({ seed: 5 });
  const many = (name: PatternName) => Array.from({ length: 200 }, () => patternBeats(s, name));
  const gap = (a: number | undefined, b: number | undefined) =>
    ((((b ?? 0) - (a ?? 0)) % 6) + 6) % 6;

  it("single: one lane on one beat", () => {
    for (const beats of many("single")) expect(beats.map((b) => b.length)).toEqual([1]);
  });

  it("opposite pair: two lanes three apart on one beat", () => {
    for (const beats of many("opposite")) {
      expect(beats).toHaveLength(1);
      expect(gap(beats[0]?.[0], beats[0]?.[1])).toBe(3);
    }
  });

  it("triple fan: lanes 0, 2, 4 or 1, 3, 5 on one beat, both seen", () => {
    const seen = new Set<string>();
    for (const beats of many("fan")) {
      expect(beats).toHaveLength(1);
      const lanes = [...(beats[0] ?? [])].sort().join();
      expect(["0,2,4", "1,3,5"]).toContain(lanes);
      seen.add(lanes);
    }
    expect(seen.size).toBe(2);
  });

  it("ring of six: every lane on one beat", () => {
    for (const beats of many("ring")) {
      expect(beats).toHaveLength(1);
      expect([...(beats[0] ?? [])].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("sweep: six beats stepping one lane at a time, in both directions", () => {
    const dirs = new Set<number>();
    for (const beats of many("sweep")) {
      expect(beats.map((b) => b.length)).toEqual([1, 1, 1, 1, 1, 1]);
      const lanes = beats.map((b) => b[0]);
      const step = gap(lanes[0], lanes[1]);
      expect([1, 5]).toContain(step);
      for (let i = 1; i < 6; i++) expect(gap(lanes[i - 1], lanes[i])).toBe(step);
      dirs.add(step);
    }
    expect(dirs.size).toBe(2);
  });

  it("zipper: six beats alternating between two opposite lanes", () => {
    for (const beats of many("zipper")) {
      expect(beats.map((b) => b.length)).toEqual([1, 1, 1, 1, 1, 1]);
      const lanes = beats.map((b) => b[0]);
      const [a, b] = lanes;
      expect(gap(a, b)).toBe(3);
      expect(lanes).toEqual([a, b, a, b, a, b]);
    }
  });

  it("picks patterns in proportion to their weights once all are open", () => {
    expect(Object.fromEntries(PATTERNS.map((p) => [p.name, p.weight]))).toEqual({
      single: 10,
      opposite: 4,
      fan: 3,
      ring: 1,
      sweep: 2,
      zipper: 3,
    });
    const draws = 23_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < draws; i++) {
      const name = pickPattern(s, 35).name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const p of PATTERNS) {
      const expected = (draws * p.weight) / 23;
      expect(Math.abs((counts.get(p.name) ?? 0) - expected)).toBeLessThan(expected * 0.15);
    }
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

type Spawn = Extract<EngineEvent, { type: "spawn" }>;

/** Every spawn with the run time it came out at, ticking from GO for `ms`. */
function timedSpawns(s: RunState, ms: number): { at: number; spawn: Spawn }[] {
  const out: { at: number; spawn: Spawn }[] = [];
  for (let t = 0; t < ms; t += TICK_MS) {
    advance(s, TICK_MS);
    for (const e of drainEvents(s)) if (e.type === "spawn") out.push({ at: s.elapsedMs, spawn: e });
  }
  return out;
}

describe("the opening (spec section 10.9)", () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => 300 + i * 17);

  it("deals one colour to lanes a and a+1 at GO and to lane a+3 900 ms later", () => {
    const colours = new Set<number>();
    const lanes = new Set<number>();
    for (const seed of SEEDS) {
      const early = timedSpawns(startedRun(seed), 1000);
      expect(early, `seed ${seed}`).toHaveLength(3);
      const [p, q, r] = early;
      const a = p!.spawn.lane;
      expect(q!.spawn.lane).toBe(wrapSide(a + 1));
      expect(r!.spawn.lane).toBe(wrapSide(a + 3));
      expect(p!.at).toBeLessThanOrEqual(TICK_MS);
      expect(q!.at).toBe(p!.at);
      expect(r!.at - p!.at).toBeCloseTo(900, 6);
      for (const { spawn } of early) {
        expect(spawn.colour).toBe(p!.spawn.colour);
        expect(spawn.special).toBe("none");
      }
      colours.add(p!.spawn.colour);
      lanes.add(a);
    }
    // The colour and the lanes are random, not fixed.
    expect(colours.size).toBeGreaterThan(1);
    expect(lanes.size).toBeGreaterThan(2);
  });

  it("opens the same way whatever the level", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const s = startedRun(seed);
      s.level = 20;
      expect(timedSpawns(s, 1000)).toHaveLength(3);
    }
  });

  it("deals no other piece the opening's colour while an opening piece is falling", () => {
    let held = 0;
    for (const seed of SEEDS) {
      const s = startedRun(seed);
      let colour = -1;
      for (let i = 0; i < 3000 && (s.nextPieceId <= 3 || s.falling.some((p) => p.id <= 3)); i++) {
        const live = s.falling.some((p) => p.id <= 3);
        advance(s, TICK_MS);
        for (const e of drainEvents(s)) {
          if (e.type !== "spawn") continue;
          if (e.id === 1) colour = e.colour;
          if (e.id > 3 && live) {
            held++;
            expect(e.colour, `seed ${seed} piece ${e.id}`).not.toBe(colour);
          }
        }
      }
    }
    // The rule is exercised: several pieces come out while the opening is still falling.
    expect(held).toBeGreaterThan(SEEDS.length);
  });

  it("is one clockwise turn from a first match, and no match without it", () => {
    function playOpening(seed: number, turn: 0 | 1 | -1): EngineEvent[] {
      const s = startedRun(seed);
      const events: EngineEvent[] = [];
      const inFlight = (id: number) => s.falling.some((p) => p.id === id);
      let turned = false;
      // The opening is pieces 1 to 3. Play until the third lands, turning once when the pair has.
      for (let i = 0; i < 2000 && (s.nextPieceId <= 3 || inFlight(3)); i++) {
        advance(s, TICK_MS);
        events.push(...drainEvents(s));
        if (!turned && s.nextPieceId > 2 && !inFlight(1) && !inFlight(2)) {
          turned = true;
          if (turn !== 0) rotate(s, turn);
        }
      }
      return events;
    }
    for (const seed of SEEDS) {
      // Later pieces can land sooner on taller stacks and clear among themselves, so only
      // clears in the opening's colour count.
      const clears = (turn: 0 | 1 | -1) => {
        const events = playOpening(seed, turn);
        const first = events.find((e) => e.type === "spawn");
        const colour = first?.type === "spawn" ? first.colour : -1;
        return events.filter((e) => e.type === "clear" && e.colour === colour).length;
      };
      expect(clears(0), `seed ${seed} untouched`).toBe(0);
      expect(clears(-1), `seed ${seed} counter-clockwise`).toBe(0);
      expect(clears(1), `seed ${seed} clockwise`).toBe(1);
    }
  });
});

describe("the first minute (spec section 10.10)", () => {
  it("paces the director at level 4 or more with beats of at most 1100 ms until 60 s", () => {
    const s = startedRun(1);
    const at = (ms: number, level: number) => {
      s.elapsedMs = ms;
      s.level = level;
      return pace(s);
    };
    expect(at(0, 1)).toEqual({ level: 4, intervalMs: 1100 });
    expect(at(59_999, 2.3)).toEqual({ level: 4, intervalMs: 1100 });
    expect(at(30_000, 10)).toEqual({ level: 10, intervalMs: 1100 });
    expect(at(30_000, 20)).toEqual({ level: 20, intervalMs: spawnIntervalMs(20) });
    expect(spawnIntervalMs(20)).toBeLessThan(1100);
    expect(at(60_000, 2.3)).toEqual({ level: 2.3, intervalMs: spawnIntervalMs(2.3) });
  });

  it("averages a spawn every 1000 ms or less over the first 30 s, over 20 seeds", () => {
    const means: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = startedRun(500 + i * 31);
      // Spawn times do not depend on where pieces land, so keep the board empty and alive.
      let count = 0;
      for (let t = 0; t < 30_000; t += 250) {
        advance(s, 250);
        count += drainEvents(s).filter((e) => e.type === "spawn").length;
        s.sides = s.sides.map(() => []);
      }
      expect(s.phase).toBe("playing");
      means.push(30_000 / count);
    }
    const mean = means.reduce((a, b) => a + b, 0) / means.length;
    // It was about 1500 ms; the expected value is about 880 ms.
    expect(mean).toBeLessThanOrEqual(1000);
    expect(mean).toBeGreaterThan(700);
    for (const m of means) expect(m).toBeLessThan(1100);
  });
});

describe("spawning", () => {
  it("spawns on the beat for the real level after the first minute", () => {
    const s = startedRun(22);
    // Jump the clock past the first minute and the opening, with the director due.
    s.ticks = 60_000 / TICK_MS;
    s.elapsedMs = 60_000;
    s.nextSpawnAtMs = 60_000;
    s.falling = [];
    s.queue = [];
    s.nextPieceId = 10;
    const spawns = timedSpawns(s, 1500 * 4 + 50);
    // The level is about 2.4, below the pairs, so about one single per 1.45 s.
    expect(s.level).toBeLessThan(3);
    expect(spawns.length).toBeGreaterThanOrEqual(4);
    expect(spawns.length).toBeLessThanOrEqual(5);
  });
});
