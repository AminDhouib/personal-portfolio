import { describe, it, expect } from "vitest";
import { advance, applyAction, releaseRush, rotate, setRush, start } from "../step";
import { TICK_MS, createRun, wrapSide } from "../state";
import type { EngineEvent, RunState, TimedAction } from "../types";

function playing(seed: number): RunState {
  const s = createRun({ seed });
  start(s);
  return s;
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
    expect(a.elapsedMs).toBeGreaterThan(0);
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

  it("does nothing before the run starts", () => {
    const s = createRun({ seed: 1 });
    advance(s, 5000);
    expect(s.elapsedMs).toBe(0);
    expect(s.falling).toEqual([]);
  });

  it("applies timed actions at the next tick boundary", () => {
    const s = playing(2);
    advance(s, 100, [{ atMs: 40, action: "rotate-cw" }]);
    expect(s.facing).toBe(1);
    expect(s.rotationAt).toBeCloseTo(5 * TICK_MS, 6);
  });

  it("starts a run from an action", () => {
    const s = createRun({ seed: 2 });
    advance(s, 100, [{ atMs: 0, action: "start" }]);
    expect(s.phase).toBe("playing");
    expect(s.events[0]).toEqual({ type: "run-start" });
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
    for (let i = 0; i < 2000 && settles(s).length < 2; i++) {
      advance(s, 50);
      // Keep every landing on side 0 by turning side 0 toward the lowest piece.
      const low = [...s.falling].sort((p, q) => p.distance - q.distance)[0];
      if (low) s.facing = wrapSide(low.lane);
    }
    const rows = settles(s).map((e) => [e.side, e.row]);
    expect(rows.slice(0, 2)).toEqual([
      [0, 0],
      [0, 1],
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
