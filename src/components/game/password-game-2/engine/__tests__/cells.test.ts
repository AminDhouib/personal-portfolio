import { describe, expect, it } from "vitest";
import { cellsToPassword, insertText, deleteRange, makeCells, findCellIndex } from "../cells";

describe("cells", () => {
  it("builds cells from a string with stable ids", () => {
    const { cells, nextCellId } = makeCells("abc", 1);
    expect(cells.map((c) => c.ch).join("")).toBe("abc");
    expect(cells.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(nextCellId).toBe(4);
  });

  it("password value excludes parasite/orbiting/abducted/ember cells", () => {
    const { cells } = makeCells("abcd", 1);
    cells[1] = { ...cells[1]!, status: "parasite" };
    cells[3] = { ...cells[3]!, status: "orbiting" };
    expect(cellsToPassword(cells)).toBe("ac");
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

  it("deleteRange removes cells and clamps caret", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 1, 3);
    expect(cellsToPassword(r.cells)).toBe("ad");
    expect(r.caret).toBe(1);
  });

  it("findCellIndex locates a cell by id", () => {
    const { cells } = makeCells("abc", 1);
    expect(findCellIndex(cells, 2)).toBe(1);
  });
});
