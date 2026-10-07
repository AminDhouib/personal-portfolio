import { describe, it, expect } from "vitest";
import { isCursorKey, memoKeyFlag, moveCursor } from "../cursor";

describe("moveCursor", () => {
  it("moves one tile with the arrows", () => {
    expect(moveCursor({ row: 2, col: 2 }, "ArrowUp", 5)).toEqual({ row: 1, col: 2 });
    expect(moveCursor({ row: 2, col: 2 }, "ArrowDown", 5)).toEqual({ row: 3, col: 2 });
    expect(moveCursor({ row: 2, col: 2 }, "ArrowLeft", 5)).toEqual({ row: 2, col: 1 });
    expect(moveCursor({ row: 2, col: 2 }, "ArrowRight", 5)).toEqual({ row: 2, col: 3 });
  });

  it("stops at the edges instead of wrapping", () => {
    expect(moveCursor({ row: 0, col: 0 }, "ArrowUp", 5)).toEqual({ row: 0, col: 0 });
    expect(moveCursor({ row: 0, col: 0 }, "ArrowLeft", 5)).toEqual({ row: 0, col: 0 });
    expect(moveCursor({ row: 4, col: 4 }, "ArrowDown", 5)).toEqual({ row: 4, col: 4 });
    expect(moveCursor({ row: 4, col: 4 }, "ArrowRight", 5)).toEqual({ row: 4, col: 4 });
  });

  it("Home and End jump to the ends of the row", () => {
    expect(moveCursor({ row: 3, col: 2 }, "Home", 5)).toEqual({ row: 3, col: 0 });
    expect(moveCursor({ row: 3, col: 2 }, "End", 5)).toEqual({ row: 3, col: 4 });
  });

  it("clamps to a smaller board", () => {
    expect(moveCursor({ row: 1, col: 1 }, "ArrowRight", 2)).toEqual({ row: 1, col: 1 });
  });
});

describe("isCursorKey", () => {
  it("accepts the six cursor keys and nothing else", () => {
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(isCursorKey(k)).toBe(true);
    }
    for (const k of ["Enter", " ", "a", "Tab", "PageDown", "1"]) {
      expect(isCursorKey(k)).toBe(false);
    }
  });
});

describe("memoKeyFlag", () => {
  it("maps 1, 2, 3 and V (either case) to a memo flag", () => {
    expect(memoKeyFlag("1")).toBe(1);
    expect(memoKeyFlag("2")).toBe(2);
    expect(memoKeyFlag("3")).toBe(3);
    expect(memoKeyFlag("v")).toBe("V");
    expect(memoKeyFlag("V")).toBe("V");
  });

  it("returns null for every other key", () => {
    for (const k of ["0", "4", "x", "Enter", " ", "ArrowUp", ""]) {
      expect(memoKeyFlag(k)).toBeNull();
    }
  });
});
