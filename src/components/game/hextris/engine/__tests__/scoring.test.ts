import { describe, it, expect } from "vitest";
import { resolveClears } from "../match";
import { CHAIN_WINDOW_MS, clearPoints, expireCombo } from "../scoring";
import type { EngineEvent, RunState } from "../types";
import { boardState, sidesOf } from "./boards";

function ofType<T extends EngineEvent["type"]>(events: EngineEvent[], type: T) {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}

// Clears a fresh three-in-a-row on side 3 at the run's current time.
function clearThree(s: RunState): void {
  s.sides[3] = [
    { colour: 2, special: "none" },
    { colour: 2, special: "none" },
    { colour: 2, special: "none" },
  ];
  resolveClears(s, 3, 2);
}

describe("clearPoints", () => {
  it("is cells squared times the combo level", () => {
    expect(clearPoints(4, 2)).toBe(32);
    expect(clearPoints(3, 1)).toBe(9);
  });
});

describe("combo", () => {
  it("rises by one for a clear inside the window and resets to 1 outside it", () => {
    const s = boardState({});
    clearThree(s);
    expect(s.combo).toBe(1);
    s.elapsedMs += 1000;
    clearThree(s);
    expect(s.combo).toBe(2);
    expect(s.score).toBe(9 + 18);
    s.elapsedMs += 5000;
    clearThree(s);
    expect(s.combo).toBe(1);
    expect(s.score).toBe(9 + 18 + 9);
  });

  it("rises by two for a clear within the chain window of the last one", () => {
    const s = boardState({});
    clearThree(s);
    s.elapsedMs += CHAIN_WINDOW_MS;
    clearThree(s);
    expect(s.combo).toBe(3);
    const last = ofType(s.events, "clear").at(-1);
    expect(last?.chain).toBe(true);
    expect(ofType(s.events, "chain")).toHaveLength(1);
  });

  it("gives only +1 just past the chain window", () => {
    const s = boardState({});
    clearThree(s);
    s.elapsedMs += CHAIN_WINDOW_MS + 1;
    clearThree(s);
    expect(s.combo).toBe(2);
    expect(ofType(s.events, "clear").at(-1)?.chain).toBe(false);
    expect(ofType(s.events, "chain")).toEqual([]);
  });

  it("sizes the window by the level at the time of the clear", () => {
    const s = boardState({});
    s.level = 35;
    clearThree(s);
    expect(s.comboUntilMs).toBe(s.elapsedMs + 1500);
    s.level = 18;
    s.elapsedMs += 1000;
    clearThree(s);
    expect(s.comboUntilMs - s.elapsedMs).toBeGreaterThan(1500);
    expect(s.comboUntilMs - s.elapsedMs).toBeLessThan(2800);
  });

  it("restarts the window on every clear and reports combo changes", () => {
    const s = boardState({});
    clearThree(s);
    expect(s.comboUntilMs).toBe(s.elapsedMs + 2800);
    s.elapsedMs += 2000;
    clearThree(s);
    expect(s.comboUntilMs).toBe(s.elapsedMs + 2800);
    expect(ofType(s.events, "combo").map((e) => e.combo)).toEqual([2]);
  });

  it("expires once the window has passed", () => {
    const s = boardState({});
    clearThree(s);
    s.elapsedMs += 1000;
    clearThree(s);
    s.elapsedMs += 1000;
    expireCombo(s);
    expect(s.combo).toBe(2);
    s.elapsedMs += 5000;
    expireCombo(s);
    expect(s.combo).toBe(1);
    expireCombo(s);
    expect(ofType(s.events, "combo-expired")).toHaveLength(1);
  });

  it("remembers the best combo of the run", () => {
    const s = boardState({});
    clearThree(s);
    s.elapsedMs += 100;
    clearThree(s);
    s.elapsedMs += 10_000;
    clearThree(s);
    expect(s.combo).toBe(1);
    expect(s.bestCombo).toBe(3);
  });
});

describe("clean sweep", () => {
  it("pays 1000 times the combo when a clear of 10 or more empties the board", () => {
    const s = boardState({ 0: "aaaa", 1: "aaa", 2: "aaa" });
    resolveClears(s, 0, 3);
    expect(sidesOf(s).join("")).toBe("");
    expect(s.score).toBe(100 + 1000);
    expect(ofType(s.events, "clean-sweep")).toEqual([
      expect.objectContaining({ type: "clean-sweep", combo: 1, points: 1000 }),
    ]);
    expect(ofType(s.events, "clean-sweep")[0]?.cells).toHaveLength(10);
  });

  it("uses the updated combo level", () => {
    const s = boardState({});
    clearThree(s);
    s.elapsedMs += 1000;
    s.sides[0] = [...Array(4)].map(() => ({ colour: 0, special: "none" }) as const);
    s.sides[1] = [...Array(3)].map(() => ({ colour: 0, special: "none" }) as const);
    s.sides[2] = [...Array(3)].map(() => ({ colour: 0, special: "none" }) as const);
    resolveClears(s, 0, 3);
    expect(s.score).toBe(9 + 100 * 2 + 1000 * 2);
  });

  it("pays nothing for a clear under 10 cells or one that leaves cells behind", () => {
    const small = boardState({ 0: "aaa", 1: "aaa", 2: "aaa" });
    resolveClears(small, 0, 2);
    expect(small.score).toBe(81);
    const partial = boardState({ 0: "aaaa", 1: "aaa", 2: "aaa", 4: "b" });
    resolveClears(partial, 0, 3);
    expect(partial.score).toBe(100);
    expect(ofType(partial.events, "clean-sweep")).toEqual([]);
  });
});

describe("event payloads", () => {
  it("give every event its own copy of the cleared cells", () => {
    const s = boardState({ 0: "aaaa", 1: "aaa", 2: "aaa" });
    s.lastClearAtMs = 0;
    s.comboUntilMs = 2800;
    s.elapsedMs = 1000;
    resolveClears(s, 0, 3);
    const clear = ofType(s.events, "clear")[0];
    const combo = ofType(s.events, "combo")[0];
    const sweep = ofType(s.events, "clean-sweep")[0];
    expect(clear && combo && sweep).toBeTruthy();
    const before = structuredClone(sweep?.cells);
    clear?.cells.splice(0, 5);
    const first = combo?.cells[0];
    if (first) first.side = 99;
    expect(sweep?.cells).toEqual(before);
    expect(combo?.cells).toHaveLength(10);
  });
});
