import { describe, it, expect } from "vitest";
import { findGroup, resolveClears } from "../match";
import type { EngineEvent, Pos } from "../types";
import { boardState, sidesOf } from "./boards";

function ofType<T extends EngineEvent["type"]>(events: EngineEvent[], type: T) {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}

function sorted(cells: Pos[]): Pos[] {
  return [...cells].sort((a, b) => a.side - b.side || a.row - b.row);
}

describe("findGroup", () => {
  it("connects same-colour cells up a side and across adjacent sides in a row", () => {
    const s = boardState({ 0: "aa", 1: "a", 3: "a" });
    expect(sorted(findGroup(s.sides, 0, 0).cells)).toEqual([
      { side: 0, row: 0 },
      { side: 0, row: 1 },
      { side: 1, row: 0 },
    ]);
  });

  it("does not connect cells on adjacent sides in different rows", () => {
    const s = boardState({ 0: "ba", 1: "a" });
    expect(findGroup(s.sides, 0, 1).cells).toHaveLength(1);
  });

  it("returns nothing for an empty position", () => {
    expect(findGroup(boardState({}).sides, 2, 0).cells).toEqual([]);
  });
});

describe("resolveClears", () => {
  it("clears three of a colour in one side", () => {
    const s = boardState({ 0: "aaa" });
    resolveClears(s, 0, 2);
    expect(sidesOf(s)[0]).toBe("");
    expect(s.cellsCleared).toBe(3);
    expect(s.score).toBe(9);
  });

  it("clears three in a row across sides 5, 0 and 1 (the sides wrap)", () => {
    const s = boardState({ 5: "a", 0: "a", 1: "a" });
    resolveClears(s, 0, 0);
    expect(sidesOf(s)).toEqual(["", "", "", "", "", ""]);
  });

  it("leaves a pair alone", () => {
    const s = boardState({ 0: "aa", 2: "a" });
    resolveClears(s, 0, 1);
    expect(sidesOf(s)[0]).toBe("aa");
    expect(s.score).toBe(0);
    expect(s.events).toEqual([]);
  });

  it("does not join different colours", () => {
    const s = boardState({ 0: "aba", 1: "cac" });
    resolveClears(s, 0, 2);
    expect(sidesOf(s).slice(0, 2)).toEqual(["aba", "cac"]);
  });

  it("drops the cells above a clear within their own side", () => {
    const s = boardState({ 5: "da", 0: "bac", 1: "ba" });
    resolveClears(s, 0, 1);
    expect(sidesOf(s)).toEqual(["bc", "b", "", "", "", "d"]);
    expect(ofType(s.events, "gravity")).toHaveLength(1);
  });

  it("clears again when the drop makes a new group, with the chain bonus", () => {
    const s = boardState({ 5: "caa", 0: "bab", 1: "cb" });
    resolveClears(s, 0, 1);
    expect(sidesOf(s)).toEqual(["", "c", "", "", "", "c"]);
    const clears = ofType(s.events, "clear");
    expect(clears.map((c) => [c.count, c.combo, c.chain, c.points])).toEqual([
      [3, 1, false, 9],
      [3, 3, true, 27],
    ]);
    expect(s.score).toBe(36);
    const [chain] = ofType(s.events, "chain");
    expect(chain?.combo).toBe(3);
    expect(chain?.points).toBe(27);
    expect(sorted(chain?.cells ?? [])).toEqual([
      { side: 0, row: 0 },
      { side: 0, row: 1 },
      { side: 1, row: 1 },
    ]);
  });

  it("lets a rainbow join a group of any colour", () => {
    for (const colour of ["a", "b", "c", "d"]) {
      const s = boardState({ 0: `${colour}*${colour}` });
      resolveClears(s, 0, 1);
      expect(sidesOf(s)[0]).toBe("");
    }
  });

  it("gives a settled rainbow the colour of its largest group", () => {
    const s = boardState({ 0: "*a", 1: "b", 5: "b" });
    resolveClears(s, 0, 0);
    expect(sidesOf(s)).toEqual(["a", "", "", "", "", ""]);
    expect(ofType(s.events, "clear")[0]?.colour).toBe(1);
  });

  it("matches a bomb only to its own colour", () => {
    const s = boardState({ 0: "bAb" });
    resolveClears(s, 0, 1);
    expect(sidesOf(s)[0]).toBe("bAb");
  });

  it("blasts two rows either way on its side and one row on the sides next to it", () => {
    const s = boardState({ 0: "cdAaa", 1: "bcdbd", 5: "d", 2: "dbdbd" });
    resolveClears(s, 0, 4);
    expect(sidesOf(s)).toEqual(["", "bd", "dbdbd", "", "", "d"]);
    expect(s.cellsCleared).toBe(8);
    expect(s.score).toBe(64);
    expect(ofType(s.events, "bomb")).toEqual([{ type: "bomb", side: 0, row: 2 }]);
    expect(ofType(s.events, "clear")[0]?.count).toBe(8);
  });

  it("reports the cleared positions and points on the clear event", () => {
    const s = boardState({ 0: "aa", 1: "ba" });
    resolveClears(s, 1, 1);
    const [clear] = ofType(s.events, "clear");
    expect(sorted(clear?.cells ?? [])).toEqual([
      { side: 0, row: 0 },
      { side: 0, row: 1 },
      { side: 1, row: 1 },
    ]);
    expect(clear?.points).toBe(9);
    expect(ofType(s.events, "score").at(-1)?.score).toBe(9);
  });
});
