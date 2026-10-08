import { describe, it, expect } from "vitest";
import { advance, rotate } from "../step";
import { drainEvents, sideFacingLane } from "../state";
import type { EngineEvent, RunState } from "../types";
import { boardState, startedRun } from "./boards";

function ofType<T extends EngineEvent["type"]>(events: EngineEvent[], type: T) {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}

// A started run whose director never spawns, so only the boundary and hand-placed pieces act.
function quietRun(): RunState {
  const s = startedRun(1);
  s.nextSpawnAtMs = 1e12;
  return s;
}

function tower(height: number): string {
  return "ab".repeat(height).slice(0, height);
}

describe("shrinking boundary", () => {
  it("does not shrink before the first rotation", () => {
    const s = quietRun();
    advance(s, 200_000);
    expect(s.limitRows).toBe(12);
    expect(s.boundaryArmed).toBe(false);
    expect(ofType(s.events, "boundary-warning")).toEqual([]);
  });

  it("then drops one row every 60 s, warning 10 s ahead, down to a floor of 4", () => {
    const s = quietRun();
    advance(s, 5000);
    rotate(s, 1);
    const armedAt = s.elapsedMs;
    drainEvents(s);
    const warnings: number[] = [];
    const drops: { at: number; limit: number }[] = [];
    for (let second = 0; second < 700; second++) {
      advance(s, 1000);
      for (const e of drainEvents(s)) {
        if (e.type === "boundary-warning") warnings.push(Math.round(s.elapsedMs - armedAt));
        if (e.type === "boundary-drop") {
          drops.push({ at: Math.round(s.elapsedMs - armedAt), limit: e.limit });
        }
      }
    }
    expect(drops.map((d) => d.limit)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
    expect(drops.map((d) => d.at)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => n * 60_000));
    expect(warnings).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => n * 60_000 - 10_000));
    expect(s.limitRows).toBe(4);
    expect(s.phase).toBe("playing");
  });

  it("does not run while paused", () => {
    const s = quietRun();
    rotate(s, 1);
    advance(s, 30_000);
    advance(s, 0, [{ atMs: 0, action: "toggle-pause" }]);
    advance(s, 120_000);
    expect(s.limitRows).toBe(12);
    advance(s, 0, [{ atMs: 0, action: "toggle-pause" }]);
    advance(s, 31_000);
    expect(s.limitRows).toBe(11);
  });

  it("ends the run when a drop leaves a side above the new limit", () => {
    const s = quietRun();
    s.sides[4] = boardState({ 4: tower(12) }).sides[4] ?? [];
    rotate(s, 1);
    advance(s, 61_000);
    expect(s.phase).toBe("over");
    expect(ofType(s.events, "game-over")).toEqual([
      { type: "game-over", side: 4, score: 0, cellsCleared: 0 },
    ]);
  });
});

describe("game over", () => {
  it("ends the run, naming the side, when a settled stack is above the limit", () => {
    const s = quietRun();
    s.sides[2] = boardState({ 2: tower(12) }).sides[2] ?? [];
    // Lane 2 faces side 2 at facing 0.
    expect(sideFacingLane(s, 2)).toBe(2);
    s.falling.push({ id: 99, lane: 2, distance: 12.5, colour: 2, special: "none" });
    advance(s, 2000);
    expect(s.phase).toBe("over");
    expect(s.sides[2]).toHaveLength(13);
    const over = ofType(s.events, "game-over");
    expect(over).toHaveLength(1);
    expect(over[0]?.side).toBe(2);
    const frozen = s.elapsedMs;
    advance(s, 5000);
    expect(s.elapsedMs).toBe(frozen);
    expect(ofType(s.events, "game-over")).toHaveLength(1);
  });

  it("lets a stack sit exactly at the limit", () => {
    const s = quietRun();
    s.sides[2] = boardState({ 2: tower(11) }).sides[2] ?? [];
    s.falling.push({ id: 99, lane: 2, distance: 11.5, colour: 2, special: "none" });
    advance(s, 2000);
    expect(s.sides[2]).toHaveLength(12);
    expect(s.phase).toBe("playing");
  });

  it("checks after clearing, so a landing that clears a tall stack is safe", () => {
    const s = quietRun();
    s.sides[2] = boardState({ 2: `${tower(10)}cc` }).sides[2] ?? [];
    s.falling.push({ id: 99, lane: 2, distance: 12.5, colour: 2, special: "none" });
    advance(s, 2000);
    expect(s.sides[2]).toHaveLength(10);
    expect(s.phase).toBe("playing");
  });
});
