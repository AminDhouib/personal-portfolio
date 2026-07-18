import { describe, expect, it } from "vitest";
import { cellsToPassword, insertText, deleteRange, makeCells, findCellIndex } from "../cells";

describe("cells", () => {
  it("builds cells from a string with stable ids", () => {
    const { cells, nextCellId } = makeCells("abc", 1);
    expect(cells.map((c) => c.ch).join("")).toBe("abc");
    expect(cells.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(nextCellId).toBe(4);
  });

  it("makeCells on an empty string yields no cells", () => {
    const { cells, nextCellId } = makeCells("", 5);
    expect(cells).toEqual([]);
    expect(nextCellId).toBe(5);
  });

  it("makeCells is code-point aware for astral characters", () => {
    const { cells, nextCellId } = makeCells("a\u{1F600}b", 1);
    expect(cells).toHaveLength(3);
    expect(cells[1]!.ch).toBe("\u{1F600}");
    expect(nextCellId).toBe(4);
  });

  it("password value excludes all four excluded statuses", () => {
    const { cells } = makeCells("abcdef", 1);
    cells[1] = { ...cells[1]!, status: "parasite" };
    cells[2] = { ...cells[2]!, status: "orbiting" };
    cells[3] = { ...cells[3]!, status: "abducted" };
    cells[4] = { ...cells[4]!, status: "ember" };
    expect(cellsToPassword(cells)).toBe("af");
  });

  it("garbage cells ARE included in the password value", () => {
    const { cells } = makeCells("ab", 1);
    cells.push({ id: 99, ch: "#", status: "garbage" });
    expect(cellsToPassword(cells)).toBe("ab#");
  });

  it("insertText splices at caret and returns new caret and nextCellId", () => {
    const { cells } = makeCells("ad", 1);
    const r = insertText(cells, 1, "bc", 3);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.caret).toBe(3);
    expect(r.nextCellId).toBe(5);
  });

  it("insertText adds exactly one cell for a single astral character", () => {
    const { cells, nextCellId } = makeCells("ab", 1);
    const r = insertText(cells, 1, "\u{1F4A9}", nextCellId);
    expect(r.cells).toHaveLength(3);
    expect(r.caret).toBe(2);
    expect(r.nextCellId).toBe(nextCellId + 1);
    expect(r.cells[1]!.ch).toBe("\u{1F4A9}");
  });

  it("deleteRange removes cells and clamps caret", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 1, 3);
    expect(cellsToPassword(r.cells)).toBe("ad");
    expect(r.caret).toBe(1);
  });

  it("deleteRange with a negative from is a no-op with caret 0", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, -1, 0);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.cells).toHaveLength(4);
    expect(r.caret).toBe(0);
  });

  it("deleteRange at the very end removes the trailing cell", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 3, 4);
    expect(cellsToPassword(r.cells)).toBe("abc");
    expect(r.caret).toBe(3);
  });

  it("deleteRange past the end clamps and does not grow the array", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 4, 9);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.cells).toHaveLength(4);
    expect(r.caret).toBe(4);
  });

  it("deleteRange with a from past the end caps the caret at the array length", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 9, 12);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.cells).toHaveLength(4);
    expect(r.caret).toBe(4);
  });

  it("deleteRange with an empty range is a no-op", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 2, 2);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.caret).toBe(2);
  });

  it("findCellIndex locates a cell by id", () => {
    const { cells } = makeCells("abc", 1);
    expect(findCellIndex(cells, 2)).toBe(1);
  });

  it("findCellIndex returns -1 for an absent id", () => {
    const { cells } = makeCells("abc", 1);
    expect(findCellIndex(cells, 999)).toBe(-1);
  });
});
