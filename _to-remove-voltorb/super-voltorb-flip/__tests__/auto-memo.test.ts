import { describe, it, expect } from "vitest";
import { deduceAll } from "../auto-memo";
import { computeHints } from "../board";
import type { Tile, TileValue } from "../types";

function makeBoard(values: TileValue[][]): Tile[][] {
  return values.map((row) =>
    row.map((value) => ({
      value,
      flipped: false,
      animFrame: null,
      memos: [false, false, false, false] as const,
    })),
  );
}

describe("deduceAll", () => {
  it("rules out voltorb for every tile in a zero-voltorb row", () => {
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    const { rowHints, colHints } = computeHints(board);
    const memos = deduceAll(board, rowHints, colHints);
    for (let c = 0; c < 5; c++) {
      expect(memos[0][c][0]).toBe(false); // voltorb ruled out
    }
  });

  it("marks all-ones row (points == 5, voltorbs == 0) as all ones", () => {
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    const { rowHints, colHints } = computeHints(board);
    expect(rowHints[0].points).toBe(5);
    expect(rowHints[0].voltorbs).toBe(0);
    const memos = deduceAll(board, rowHints, colHints);
    for (let c = 0; c < 5; c++) {
      expect(memos[0][c][1]).toBe(true);
      expect(memos[0][c][2]).toBe(false);
      expect(memos[0][c][3]).toBe(false);
      expect(memos[0][c][0]).toBe(false);
    }
  });

  it("returns empty memos for flipped tiles", () => {
    const board = makeBoard([
      [1, 1, 1, 1, 1],
      [0, 2, 1, 1, 3],
      [1, 1, 0, 1, 1],
      [1, 3, 1, 2, 0],
      [2, 1, 1, 1, 1],
    ]);
    board[0][0].flipped = true;
    const { rowHints, colHints } = computeHints(board);
    const memos = deduceAll(board, rowHints, colHints);
    expect(memos[0][0]).toEqual([false, false, false, false]);
  });
});
