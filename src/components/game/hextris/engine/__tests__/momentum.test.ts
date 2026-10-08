import { describe, it, expect } from "vitest";
import { refreshLevel } from "../director";
import { resolveClears } from "../match";
import { MOMENTUM_MAX, addMomentum, panic } from "../momentum";
import { applyAction } from "../step";
import type { EngineEvent } from "../types";
import { boardState, sidesOf } from "./boards";

function ofType<T extends EngineEvent["type"]>(events: EngineEvent[], type: T) {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}

describe("momentum", () => {
  it("adds 1.5 per cleared cell plus the combo level of each clear", () => {
    const s = boardState({ 0: "aaa" });
    resolveClears(s, 0, 2);
    expect(s.momentum).toBe(3 * 1.5 + 1);
    expect(ofType(s.events, "momentum").at(-1)?.value).toBe(5.5);
  });

  it("caps at 100", () => {
    const s = boardState({});
    for (let i = 0; i < 50; i++) addMomentum(s, 4, 3);
    expect(s.momentum).toBe(MOMENTUM_MAX);
    expect(MOMENTUM_MAX).toBe(100);
  });
});

describe("panic", () => {
  // Decision (spec 4.6 and 6.6 are silent): panic cells count toward cellsCleared, so they
  // raise the level and the arcade `kills`, as the plan's Task 5 asks. Counting them keeps the
  // arcade check's "score needs kills" rule true for a panic-only score.
  it("at 100 clears every settled cell for 30 each and resets momentum", () => {
    const s = boardState({ 0: "ab", 3: "cd", 5: "a" });
    s.momentum = 100;
    s.combo = 3;
    s.comboUntilMs = 2000;
    s.score = 50;
    s.cellsCleared = 7;
    expect(panic(s)).toBe(true);
    expect(sidesOf(s).join("")).toBe("");
    expect(s.score).toBe(50 + 5 * 30);
    expect(s.cellsCleared).toBe(12);
    expect(s.momentum).toBe(0);
    expect(s.combo).toBe(3);
    expect(s.comboUntilMs).toBe(2000);
    expect(ofType(s.events, "panic")).toEqual([{ type: "panic", cells: 5, points: 150 }]);
    expect(ofType(s.events, "momentum").at(-1)?.value).toBe(0);
  });

  it("counts toward the level like any other cleared cell", () => {
    const s = boardState({ 0: "abcdabcdab", 1: "cdabcdabcd" });
    s.momentum = 100;
    panic(s);
    refreshLevel(s);
    expect(s.cellsCleared).toBe(20);
    expect(s.level).toBeCloseTo(1 + 0.06 * 20, 9);
  });

  it("is refused below 100", () => {
    const s = boardState({ 0: "ab" });
    s.momentum = 99.5;
    expect(panic(s)).toBe(false);
    expect(sidesOf(s)[0]).toBe("ab");
    expect(s.momentum).toBe(99.5);
  });

  it("is refused while paused, after game over, or on an empty board", () => {
    const paused = boardState({ 0: "ab" });
    paused.momentum = 100;
    paused.phase = "paused";
    expect(panic(paused)).toBe(false);
    const over = boardState({ 0: "ab" });
    over.momentum = 100;
    over.phase = "over";
    expect(panic(over)).toBe(false);
    const empty = boardState({});
    empty.momentum = 100;
    expect(panic(empty)).toBe(false);
    expect(empty.momentum).toBe(100);
  });

  it("is reachable as an engine action", () => {
    const s = boardState({ 1: "abc" });
    s.momentum = 100;
    applyAction(s, "panic");
    expect(sidesOf(s)[1]).toBe("");
    expect(s.score).toBe(90);
  });
});
