import { describe, it, expect } from "vitest";
import { advance, applyAction, releaseRush, rotate, setRush, start } from "../step";
import { COUNTDOWN_MS, TICK_MS, createRun, drainEvents, wrapSide } from "../state";
import type { EngineEvent, RunState, TimedAction } from "../types";
import { startedRun } from "./boards";

function playing(seed: number): RunState {
  return startedRun(seed);
}

function script(seed: number): TimedAction[][] {
  // A fixed, varied input script: one chunk of actions per 250 ms step.
  const chunks: TimedAction[][] = [];
  for (let i = 0; i < 480; i++) {
    const chunk: TimedAction[] = [];
    if ((i * 7 + seed) % 5 === 0) chunk.push({ atMs: 30, action: "rotate-cw" });
    if ((i * 3 + seed) % 7 === 0) chunk.push({ atMs: 120, action: "rotate-ccw" });
    if (i % 23 === 0) chunk.push({ atMs: 10, action: "rush" });
    if (i % 23 === 2) chunk.push({ atMs: 200, action: "rush-off" });
    chunks.push(chunk);
  }
  return chunks;
}

function runScripted(seed: number): RunState {
  const s = playing(seed);
  for (const chunk of script(seed)) advance(s, 250, chunk);
  return s;
}

function settles(s: RunState) {
  return s.events.filter((e): e is Extract<EngineEvent, { type: "settle" }> => {
    return e.type === "settle";
  });
}

describe("advance", () => {
  it("is deterministic: the same seed and script give the same state after 120 s", () => {
    const a = runScripted(5);
    const b = runScripted(5);
    expect(a.phase).toBe("over");
    expect(a.cellsCleared).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(runScripted(6)).not.toEqual(a);
  });

  it("does not depend on frame rate", () => {
    const once = playing(9);
    advance(once, 1000);
    const frames = playing(9);
    for (let i = 0; i < 60; i++) advance(frames, 1000 / 60);
    expect(frames).toEqual(once);
    expect(once.elapsedMs).toBeCloseTo(1000, 6);
  });

  it("plays 40 s with turns the same at any frame rate, event for event", () => {
    function run(frameMs: number): { s: RunState; events: EngineEvent[] } {
      const s = playing(77);
      const events: EngineEvent[] = [];
      // Turn every 500 ms of play: both frame lengths divide 500 ms exactly.
      for (let half = 0; half < 80; half++) {
        const n = Math.round(500 / frameMs);
        for (let i = 0; i < n; i++) advance(s, frameMs);
        rotate(s, half % 3 === 0 ? -1 : 1);
        events.push(...drainEvents(s));
      }
      return { s, events };
    }
    const coarse = run(500);
    const fine = run(1000 / 60);
    expect(fine.events).toEqual(coarse.events);
    expect(fine.s).toEqual(coarse.s);
    expect(coarse.events.filter((e) => e.type === "settle").length).toBeGreaterThan(10);
  });

  it("runs the same ticks for many odd frames as for one call of the same total", () => {
    // No spawns, so an idle run lives the whole 100 s and only the clock is measured.
    const quiet = () => {
      const s = playing(3);
      s.nextSpawnAtMs = 1e12;
      return s;
    };
    const frames = quiet();
    for (let i = 0; i < 6000; i++) advance(frames, 16.7);
    const once = quiet();
    advance(once, 100_200);
    expect(frames.ticks).toBe(12_024);
    expect(frames).toEqual(once);
  });

  it("ignores a non-finite or negative frame and keeps running afterwards", () => {
    const s = playing(4);
    advance(s, 100);
    const before = structuredClone(s);
    advance(s, Number.NaN);
    advance(s, Number.POSITIVE_INFINITY);
    advance(s, -50);
    expect(s).toEqual(before);
    advance(s, 100);
    expect(s.elapsedMs).toBeGreaterThan(before.elapsedMs);
    expect(Number.isFinite(s.carryMs)).toBe(true);
  });

  it("does nothing before the run starts", () => {
    const s = createRun({ seed: 1 });
    advance(s, 5000);
    expect(s.elapsedMs).toBe(0);
    expect(s.falling).toEqual([]);
  });

  it("applies a timed action before the tick whose time span contains it", () => {
    const s = playing(2);
    // 40 ms falls in the fifth tick (33.3 to 41.7 ms), so four ticks have run.
    advance(s, 100, [{ atMs: 40, action: "rotate-cw" }]);
    expect(s.facing).toBe(1);
    expect(s.rotationAt).toBeCloseTo(4 * TICK_MS, 6);
  });

  it("applies an action at 0 ms before the first tick even with time carried over", () => {
    const s = playing(2);
    advance(s, 5);
    expect(s.ticks).toBe(0);
    advance(s, 100, [{ atMs: 0, action: "rotate-cw" }]);
    expect(s.rotationAt).toBe(0);
  });

  it("starts a run from an action", () => {
    const s = createRun({ seed: 2 });
    advance(s, 100, [{ atMs: 0, action: "start" }]);
    expect(s.phase).toBe("countdown");
    expect(s.events.slice(0, 2)).toEqual([{ type: "run-start" }, { type: "countdown", count: 3 }]);
  });
});

describe("countdown", () => {
  function begun(seed = 8): RunState {
    const s = createRun({ seed });
    start(s);
    return s;
  }

  it("enters the countdown at -2400 ms with a 3", () => {
    const s = begun();
    expect(s.phase).toBe("countdown");
    expect(s.elapsedMs).toBe(-COUNTDOWN_MS);
    expect(s.events).toEqual([{ type: "run-start" }, { type: "countdown", count: 3 }]);
  });

  it("counts 2 at 800 ms, 1 at 1600 ms and goes at 2400 ms with the clock at 0", () => {
    const s = begun();
    drainEvents(s);
    const seen: [string, number][] = [];
    for (let i = 0; i < 400; i++) {
      advance(s, TICK_MS);
      for (const e of drainEvents(s)) {
        const at = Math.round(s.elapsedMs + COUNTDOWN_MS);
        if (e.type === "countdown") seen.push([`countdown ${e.count}`, at]);
        if (e.type === "go") seen.push(["go", at]);
      }
    }
    expect(seen).toEqual([
      ["countdown 2", 800],
      ["countdown 1", 1600],
      ["go", 2400],
    ]);
    const s2 = begun();
    advance(s2, COUNTDOWN_MS - 1);
    expect(s2.phase).toBe("countdown");
    advance(s2, 1);
    expect(s2.phase).toBe("playing");
    expect(s2.elapsedMs).toBe(0);
    expect(s2.ticks).toBe(0);
  });

  it("spawns and drops nothing before go, then spawns straight after", () => {
    const s = begun();
    advance(s, COUNTDOWN_MS);
    expect(s.events.filter((e) => e.type === "spawn")).toEqual([]);
    expect(s.falling).toEqual([]);
    expect(s.level).toBe(1);
    advance(s, TICK_MS);
    expect(s.falling.length).toBeGreaterThan(0);
  });

  it("lets the player rotate and press rush, but not panic", () => {
    const s = begun();
    advance(s, 500, [
      { atMs: 100, action: "rotate-cw" },
      { atMs: 200, action: "rush" },
    ]);
    expect(s.facing).toBe(1);
    expect(s.events.some((e) => e.type === "rotate")).toBe(true);
    expect(s.rush).toBe(true);
    s.momentum = 100;
    s.sides[0]?.push({ colour: 0, special: "none" });
    applyAction(s, "panic");
    expect(s.events.some((e) => e.type === "panic")).toBe(false);
    advance(s, COUNTDOWN_MS);
    expect(s.phase).toBe("playing");
    expect(s.rush).toBe(true);
  });

  it("starts the boundary timer at go when the first rotation comes early", () => {
    const s = begun();
    rotate(s, 1);
    expect(s.boundaryArmed).toBe(true);
    expect(s.nextShrinkAtMs).toBe(60_000);
  });

  it("holds while paused and resumes into the countdown", () => {
    const s = begun();
    advance(s, 1000);
    applyAction(s, "toggle-pause");
    expect(s.phase).toBe("paused");
    const held = s.elapsedMs;
    advance(s, 5000);
    expect(s.elapsedMs).toBe(held);
    applyAction(s, "toggle-pause");
    expect(s.phase).toBe("countdown");
    advance(s, 1400);
    expect(s.phase).toBe("playing");
  });
});

describe("landing", () => {
  it("lands a piece on the side facing its lane when it makes contact", () => {
    const s = playing(31);
    advance(s, TICK_MS);
    const piece = s.falling[0];
    expect(piece).toBeDefined();
    rotate(s, 1);
    rotate(s, 1);
    for (let i = 0; i < 400 && settles(s).length === 0; i++) advance(s, 50);
    const [landed] = settles(s);
    expect(landed?.side).toBe(wrapSide(piece!.lane - 2));
    expect(landed?.side).not.toBe(piece!.lane);
    expect(landed?.row).toBe(0);
    expect(s.sides[landed!.side]).toHaveLength(1);
  });

  it("stacks a second piece on top of the first in the same side", () => {
    const s = playing(32);
    s.nextSpawnAtMs = 1e12;
    s.falling.push(
      { id: 1, lane: 2, distance: 4, colour: 0, special: "none" },
      { id: 2, lane: 2, distance: 2, colour: 1, special: "none" },
    );
    for (let i = 0; i < 2000 && settles(s).length < 2; i++) advance(s, 50);
    const side = wrapSide(2 - s.facing);
    const rows = settles(s).map((e) => [e.side, e.row]);
    expect(rows).toEqual([
      [side, 0],
      [side, 1],
    ]);
  });
});

describe("rotate", () => {
  it("turns one side per call, wraps, and emits a rotate event", () => {
    const s = playing(1);
    rotate(s, 1);
    expect(s.facing).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ type: "rotate", dir: 1 });
    rotate(s, -1);
    rotate(s, -1);
    expect(s.facing).toBe(5);
    expect(s.lastInputMs).toBe(s.elapsedMs);
  });

  it("does nothing before the start, while paused or after game over", () => {
    const ready = createRun({ seed: 1 });
    rotate(ready, 1);
    expect(ready.facing).toBe(0);
    const paused = playing(1);
    applyAction(paused, "toggle-pause");
    rotate(paused, 1);
    expect(paused.facing).toBe(0);
    const over = playing(1);
    over.phase = "over";
    rotate(over, 1);
    expect(over.facing).toBe(0);
  });

  it("eases the drawn angle from where it was, so the animation never jumps", () => {
    const s = playing(1);
    rotate(s, 1);
    expect(s.rotationFrom).toBe(-1);
    rotate(s, 1);
    // The first turn has not eased at all yet, so the second starts two steps back.
    expect(s.rotationFrom).toBe(-2);
  });
});

describe("rush", () => {
  function dropOver(s: RunState, ms: number): number {
    const piece = s.falling[0]!;
    const before = piece.distance;
    advance(s, ms);
    return before - s.falling.find((p) => p.id === piece.id)!.distance;
  }

  it("multiplies the fall speed by four while held and releaseRush restores it", () => {
    const s = playing(41);
    advance(s, TICK_MS);
    const normal = dropOver(s, 100);
    setRush(s, true);
    const rushed = dropOver(s, 100);
    expect(rushed / normal).toBeCloseTo(4, 2);
    releaseRush(s);
    expect(s.rush).toBe(false);
    expect(dropOver(s, 100) / normal).toBeCloseTo(1, 2);
  });

  // Decision (spec section 2.6 is silent): a pause ends the rush, and the player presses it
  // again after resuming. The engine never hears a key lifted while paused.
  it("is released by a pause, so a key lifted while paused cannot stick it on", () => {
    const s = playing(42);
    setRush(s, true);
    applyAction(s, "toggle-pause");
    expect(s.rush).toBe(false);
    applyAction(s, "toggle-pause");
    expect(s.rush).toBe(false);
  });

  it("cannot be switched on while paused", () => {
    const s = playing(43);
    applyAction(s, "toggle-pause");
    setRush(s, true);
    expect(s.rush).toBe(false);
  });
});

describe("pause", () => {
  it("freezes play time while paused and emits pause and resume", () => {
    const s = playing(51);
    advance(s, 500);
    applyAction(s, "toggle-pause");
    const frozen = s.elapsedMs;
    advance(s, 2000);
    expect(s.elapsedMs).toBe(frozen);
    applyAction(s, "toggle-pause");
    advance(s, 500);
    expect(s.elapsedMs).toBeGreaterThan(frozen);
    const types = s.events.map((e) => e.type);
    expect(types).toContain("pause");
    expect(types).toContain("resume");
  });
});
