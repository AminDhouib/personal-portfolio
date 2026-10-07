import { describe, it, expect } from "vitest";
import { MEMO_UNDO_LIMIT, isUndoKey, popMemo, pushMemo, type MemoChange } from "../memo-undo";

const change = (row: number, col: number, flag: MemoChange["flag"] = 1): MemoChange => ({
  row,
  col,
  flag,
});
const allFaceDown = () => true;

describe("pushMemo", () => {
  it("appends and never mutates the input", () => {
    const base: MemoChange[] = [change(0, 0)];
    const next = pushMemo(base, change(1, 1, "V"));
    expect(base).toHaveLength(1);
    expect(next).toEqual([change(0, 0), change(1, 1, "V")]);
  });

  it("keeps only the newest MEMO_UNDO_LIMIT entries", () => {
    let stack: MemoChange[] = [];
    for (let i = 0; i < MEMO_UNDO_LIMIT + 5; i++) stack = pushMemo(stack, change(0, i % 5, 2));
    expect(stack).toHaveLength(MEMO_UNDO_LIMIT);
  });
});

describe("popMemo", () => {
  it("returns the newest change and the rest", () => {
    const { stack, change: popped } = popMemo([change(0, 0), change(1, 2, 3)], allFaceDown);
    expect(popped).toEqual(change(1, 2, 3));
    expect(stack).toEqual([change(0, 0)]);
  });

  it("skips entries whose tile has been flipped since", () => {
    const faceDown = (row: number, col: number) => !(row === 1 && col === 1);
    const { stack, change: popped } = popMemo(
      [change(0, 0), change(1, 1), change(1, 1, 2)],
      (row, col) => faceDown(row, col),
    );
    // (1,1) is face up: both its entries are skipped; (0,0) is the one to undo.
    expect(popped).toEqual(change(0, 0));
    expect(stack).toEqual([]);
  });

  it("an empty stack, or one with nothing undoable, yields null and an empty stack", () => {
    expect(popMemo([], allFaceDown)).toEqual({ stack: [], change: null });
    expect(popMemo([change(0, 0)], () => false)).toEqual({ stack: [], change: null });
  });
});

describe("isUndoKey", () => {
  const ev = (init: Partial<KeyboardEvent>) => ({
    key: "z",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });
  it("is Ctrl+Z or Cmd+Z, in either case", () => {
    expect(isUndoKey(ev({ ctrlKey: true }))).toBe(true);
    expect(isUndoKey(ev({ metaKey: true, key: "Z" }))).toBe(true);
  });
  it("is not plain z, Shift+Ctrl+Z (redo), Alt+Ctrl+Z or another key", () => {
    expect(isUndoKey(ev({}))).toBe(false);
    expect(isUndoKey(ev({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isUndoKey(ev({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isUndoKey(ev({ ctrlKey: true, key: "y" }))).toBe(false);
  });
});
