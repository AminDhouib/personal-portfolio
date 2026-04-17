import { describe, it, expect } from "vitest";
import { generateBoard, computeHints, applyDrop } from "../board";
import { LEVELS } from "../levels";

describe("generateBoard", () => {
  it("produces a 5x5 grid", () => {
    const { board } = generateBoard(1);
    expect(board).toHaveLength(5);
    expect(board[0]).toHaveLength(5);
  });

  it("every tile starts unflipped with empty memos", () => {
    const { board } = generateBoard(1);
    for (const row of board) {
      for (const tile of row) {
        expect(tile.flipped).toBe(false);
        expect(tile.animFrame).toBeNull();
        expect(tile.memos).toEqual([false, false, false, false]);
      }
    }
  });

  it("tile values match the config counts", () => {
    const { board, maxCoins } = generateBoard(1, () => 0);
    const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const row of board) {
      for (const tile of row) {
        counts[tile.value]++;
      }
    }
    const [twos, threes, voltorbs] = LEVELS[0][0];
    expect(counts[2]).toBe(twos);
    expect(counts[3]).toBe(threes);
    expect(counts[0]).toBe(voltorbs);
    expect(counts[1]).toBe(25 - twos - threes - voltorbs);
    expect(maxCoins).toBe(24);
  });

  it("generates different boards on repeated calls (randomness)", () => {
    const a = JSON.stringify(generateBoard(3).board.map((r) => r.map((t) => t.value)));
    const b = JSON.stringify(generateBoard(3).board.map((r) => r.map((t) => t.value)));
    expect(a === b).toBe(false);
  });
});

describe("computeHints", () => {
  it("returns 5 row hints and 5 column hints", () => {
    const { board } = generateBoard(1);
    const { rowHints, colHints } = computeHints(board);
    expect(rowHints).toHaveLength(5);
    expect(colHints).toHaveLength(5);
  });

  it("row hint sums match tile values in that row", () => {
    const { board } = generateBoard(1);
    const { rowHints } = computeHints(board);
    for (let r = 0; r < 5; r++) {
      let points = 0;
      let voltorbs = 0;
      for (let c = 0; c < 5; c++) {
        const v = board[r][c].value;
        if (v === 0) voltorbs++;
        else points += v;
      }
      expect(rowHints[r].points).toBe(points);
      expect(rowHints[r].voltorbs).toBe(voltorbs);
    }
  });
});

describe("applyDrop (softer level drop)", () => {
  it("no drop when all required tiles flipped", () => {
    expect(applyDrop(5, 4, 4)).toBe(5);
    expect(applyDrop(5, 4, 10)).toBe(5);
  });

  it("drops proportional to missing flips", () => {
    expect(applyDrop(5, 6, 0)).toBe(2); // drop = ceil(6/2) = 3
    expect(applyDrop(5, 6, 2)).toBe(3); // drop = ceil(4/2) = 2
    expect(applyDrop(5, 6, 4)).toBe(4); // drop = ceil(2/2) = 1
  });

  it("never drops below 1", () => {
    expect(applyDrop(1, 8, 0)).toBe(1);
    expect(applyDrop(2, 20, 0)).toBe(1);
  });
});
