import { describe, it, expect, vi, afterEach } from "vitest";
import {
  indexToCoordinate,
  generateLevelComposition,
  Level,
  shuffle,
  Board,
  VoltorbFlip,
  cloneGame,
} from "../engine";
import type { Cell } from "../types";

// Characterization tests (RC-3-lite): pin CURRENT behavior of engine.ts,
// including quirks, via its public API only. No engine.ts edits. Math.random
// is handled via invariant assertions over many iterations for randomized
// paths, and vi.spyOn only where an exact value is asserted -- neither
// touches engine code.

describe("indexToCoordinate", () => {
  it("maps index 0 to [0, 0] at the default grid size", () => {
    expect(indexToCoordinate(0)).toEqual([0, 0]);
  });

  it("maps index 6 to [1, 1] at a non-default grid size (5)", () => {
    expect(indexToCoordinate(6, 5)).toEqual([1, 1]);
  });

  it("maps index 24 to [4, 4] at a non-default grid size (5)", () => {
    expect(indexToCoordinate(24, 5)).toEqual([4, 4]);
  });
});

describe("generateLevelComposition", () => {
  it("keeps x2/x3/voltorb counts within the documented clamps across levels and board sizes", () => {
    for (let level = 0; level <= 8; level++) {
      for (let boardSize = 2; boardSize <= 10; boardSize++) {
        for (let iter = 0; iter < 20; iter++) {
          const { x2, x3, v } = generateLevelComposition(level, boardSize);
          const total = boardSize * boardSize;
          const L = Math.max(0, Math.min(7, level));
          const maxX2 = Math.min(total, 2 + Math.floor(L * 1.5));
          const maxX3 = Math.min(total, 1 + L);

          expect(x2).toBeGreaterThanOrEqual(0);
          expect(x3).toBeGreaterThanOrEqual(0);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(x2).toBeLessThanOrEqual(maxX2);
          expect(x3).toBeLessThanOrEqual(maxX3);
          // The composition never overflows the board. Note: on very small
          // boards (e.g. boardSize 2, total 4) the re-clamp of v after
          // jitter can leave zero filler "1" tiles (sum === total) rather
          // than the "always >= 1 filler" guarantee that holds at typical
          // sizes -- pinned as-is, not "fixed" (RC-3-lite is tests-only).
          expect(x2 + x3 + v).toBeLessThanOrEqual(total);
        }
      }
    }
  });
});

describe("Level", () => {
  it("levelData has the expected shape and coins formula", () => {
    const level = new Level(3, 5);
    const data = level.levelData;
    expect(Object.keys(data).sort()).toEqual(["coins", "voltorbs", "x2", "x3"]);
    expect(data.voltorbs).toBeGreaterThanOrEqual(1);
    expect(data.coins).toBe(Math.pow(2, data.x2) * Math.pow(3, data.x3));
  });
});

describe("shuffle", () => {
  it("returns a new array without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const result = shuffle(input);
    expect(result).not.toBe(input);
    expect(input).toEqual(copy);
  });

  it("preserves the length and the multiset of elements", () => {
    const input = [1, 2, 3, "V", 1, 2];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it("produces an exact permutation when Math.random is stubbed to a constant", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Math.random() stubbed to 0 => Math.floor(0 * (i + 1)) === 0 for every
      // i, so Fisher-Yates swaps index i with index 0 on every iteration.
      // For [1,2,3,4,5] that yields, in order: swap(4,0)->[5,2,3,4,1],
      // swap(3,0)->[4,2,3,5,1], swap(2,0)->[3,2,4,5,1], swap(1,0)->[2,3,4,5,1].
      const result = shuffle([1, 2, 3, 4, 5]);
      expect(result).toEqual([2, 3, 4, 5, 1]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Board", () => {
  it("has a cells grid of size x size", () => {
    const board = new Board(new Level(2, 5), 5);
    expect(board.cells).toHaveLength(5);
    for (const row of board.cells) {
      expect(row).toHaveLength(5);
    }
  });

  it("row/column voltorb and coin sums match the per-cell values", () => {
    const size = 5;
    const board = new Board(new Level(4, size), size);
    let totalVoltorbsFromCells = 0;

    for (let r = 0; r < size; r++) {
      let rowCoins = 0;
      let rowVoltorbs = 0;
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r]?.[c] as Cell;
        if (cell.value === "V") {
          rowVoltorbs++;
          totalVoltorbsFromCells++;
        } else {
          rowCoins += cell.value;
        }
      }
      expect(board.rowValues[r]?.voltorbs).toBe(rowVoltorbs);
      expect(board.rowValues[r]?.coins).toBe(rowCoins);
    }

    for (let c = 0; c < size; c++) {
      let colCoins = 0;
      let colVoltorbs = 0;
      for (let r = 0; r < size; r++) {
        const cell = board.cells[r]?.[c] as Cell;
        if (cell.value === "V") {
          colVoltorbs++;
        } else {
          colCoins += cell.value;
        }
      }
      expect(board.colValues[c]?.voltorbs).toBe(colVoltorbs);
      expect(board.colValues[c]?.coins).toBe(colCoins);
    }

    const totalVoltorbsFromRows = board.rowValues.reduce((sum, r) => sum + r.voltorbs, 0);
    const totalVoltorbsFromCols = board.colValues.reduce((sum, c) => sum + c.voltorbs, 0);
    expect(totalVoltorbsFromRows).toBe(totalVoltorbsFromCells);
    expect(totalVoltorbsFromCols).toBe(totalVoltorbsFromCells);
  });

  it("maxLevelScore is the product of every non-1 tile placed on the board", () => {
    const size = 5;
    const level = new Level(5, size);
    const board = new Board(level, size);
    let product = 1;
    for (const row of board.cells) {
      for (const cell of row) {
        if (cell.value !== "V" && cell.value !== 1) product *= cell.value;
      }
    }
    expect(board.maxLevelScore).toBe(product);
  });

  it("flipCell throws on out-of-bounds coordinates", () => {
    const board = new Board(new Level(0, 5), 5);
    expect(() => board.flipCell(-1, 0)).toThrow("Invalid row or column");
    expect(() => board.flipCell(5, 0)).toThrow("Invalid row or column");
    expect(() => board.flipCell(0, -1)).toThrow("Invalid row or column");
    expect(() => board.flipCell(0, 5)).toThrow("Invalid row or column");
  });

  it("flipCell on an already-flipped cell returns 1 without changing its value", () => {
    const board = new Board(new Level(0, 5), 5);
    const firstValue = board.flipCell(0, 0);
    const secondValue = board.flipCell(0, 0);
    expect(secondValue).toBe(1);
    // Sanity: the underlying cell keeps its original (possibly non-1) value.
    expect(board.cells[0]?.[0]?.value).toBe(firstValue);
  });

  it("flagCell toggles a flag and sets isFlagged, and is a no-op on a flipped cell", () => {
    const board = new Board(new Level(0, 5), 5);
    board.flagCell(1, 1, "V");
    expect(board.cells[1]?.[1]?.flags.V).toBe(true);
    expect(board.cells[1]?.[1]?.isFlagged).toBe(true);

    board.flagCell(1, 1, "V");
    expect(board.cells[1]?.[1]?.flags.V).toBe(false);
    expect(board.cells[1]?.[1]?.isFlagged).toBe(false);

    board.flipCell(2, 2);
    const flagsBefore = { ...board.cells[2]?.[2]?.flags };
    board.flagCell(2, 2, "V");
    expect(board.cells[2]?.[2]?.flags).toEqual(flagsBefore);
  });
});

describe("VoltorbFlip", () => {
  it("constructs with the documented defaults", () => {
    const game = new VoltorbFlip();
    expect(game.gameStatus).toBe("playing");
    expect(game.currentScore).toBe(0);
    expect(game.totalScore).toBe(0);
    expect(game.currentLevel).toBe(1);
    expect(game.cells).toHaveLength(5);
    expect(game.cells[0]).toHaveLength(5);
  });

  it("toggleMemo flips playing <-> memo", () => {
    const game = new VoltorbFlip();
    game.toggleMemo();
    expect(game.gameStatus).toBe("memo");
    game.toggleMemo();
    expect(game.gameStatus).toBe("playing");
  });

  it("flipping a voltorb cell ends the game in a loss", () => {
    const game = new VoltorbFlip();
    let found = false;
    for (let r = 0; r < game.cells.length && !found; r++) {
      const row = game.cells[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c]?.value === "V") {
          game.flipCell(r, c);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
    expect(game.gameStatus).toBe("lose");
  });

  it("flipping every non-voltorb cell (1s first, then 2s/3s) reaches maxLevelScore and wins", () => {
    const game = new VoltorbFlip();
    const targetScore = game.cells.reduce((product, row) => {
      let rowProduct = product;
      for (const cell of row) {
        if (cell.value !== "V" && cell.value !== 1) rowProduct *= cell.value;
      }
      return rowProduct;
    }, 1);

    const ones: Array<[number, number]> = [];
    const others: Array<[number, number]> = [];
    for (let r = 0; r < game.cells.length; r++) {
      const row = game.cells[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const value = row[c]?.value;
        if (value === "V") continue;
        if (value === 1) ones.push([r, c]);
        else others.push([r, c]);
      }
    }

    for (const [r, c] of [...ones, ...others]) {
      game.flipCell(r, c);
    }

    expect(game.currentScore).toBe(targetScore);
    expect(game.gameStatus).toBe("win");
    expect(game.currentLevel).toBe(2);
    expect(game.totalScore).toBe(targetScore);
  });

  it("NF(P7)-a: every 1-valued flip after winning re-enters the win block (current behavior, not fixed here)", () => {
    const game = new VoltorbFlip();
    const ones: Array<[number, number]> = [];
    const others: Array<[number, number]> = [];
    for (let r = 0; r < game.cells.length; r++) {
      const row = game.cells[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const value = row[c]?.value;
        if (value === "V") continue;
        if (value === 1) ones.push([r, c]);
        else others.push([r, c]);
      }
    }

    // Need at least two spare "1" cells left after the win, to show the
    // quirk re-fires repeatedly (not just once).
    expect(ones.length).toBeGreaterThanOrEqual(2);

    for (const [r, c] of others) {
      game.flipCell(r, c);
    }
    expect(game.gameStatus).toBe("win");
    const scoreAtWin = game.currentScore;
    const levelAtWin = game.currentLevel;
    const totalAtWin = game.totalScore;

    // Pinned quirk: currentScore * 1 === currentScore, so it never departs
    // from maxLevelScore once reached -- every further "1" flip satisfies
    // the win condition again. currentLevel keeps advancing (capped at 9,
    // since the internal _currentLevel caps at 8) and totalScore keeps
    // accumulating scoreAtWin on every re-entry, uncapped.
    game.flipCell(ones[0]![0], ones[0]![1]);
    expect(game.currentScore).toBe(scoreAtWin);
    expect(game.gameStatus).toBe("win");
    expect(game.currentLevel).toBe(levelAtWin + 1);
    expect(game.totalScore).toBe(totalAtWin + scoreAtWin);

    game.flipCell(ones[1]![0], ones[1]![1]);
    expect(game.currentScore).toBe(scoreAtWin);
    expect(game.gameStatus).toBe("win");
    expect(game.currentLevel).toBe(Math.min(levelAtWin + 2, 9));
    expect(game.totalScore).toBe(totalAtWin + scoreAtWin * 2);
  });

  it("restartGame resets status and score and rebuilds the board", () => {
    const game = new VoltorbFlip();
    game.flipCell(0, 0);
    game.restartGame();
    expect(game.gameStatus).toBe("playing");
    expect(game.currentScore).toBe(0);
    expect(game.cells).toHaveLength(5);
  });

  it("debugWinLevel sets win status, advances the level, and adds to totalScore", () => {
    const game = new VoltorbFlip();
    const totalBefore = game.totalScore;
    game.debugWinLevel();
    expect(game.gameStatus).toBe("win");
    expect(game.currentLevel).toBe(2);
    expect(game.totalScore).toBeGreaterThan(totalBefore);
  });
});

describe("cloneGame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("structuredClone branch: clone is an independent VoltorbFlip instance", () => {
    const game = new VoltorbFlip();
    const clone = cloneGame(game);

    expect(clone).toBeInstanceOf(VoltorbFlip);
    expect(clone.gameStatus).toBe(game.gameStatus);
    expect(clone.cells).toEqual(game.cells);

    clone.flipCell(0, 0);
    // Mutating the clone's board must not affect the original.
    expect(clone.cells[0]?.[0]?.isFlipped).toBe(true);
    expect(game.cells[0]?.[0]?.isFlipped).toBe(false);
  });

  it("safeJsonParse fallback branch (structuredClone absent): clone is still a working VoltorbFlip with reattached prototypes", () => {
    vi.stubGlobal("structuredClone", undefined);

    const game = new VoltorbFlip();
    const clone = cloneGame(game);

    expect(clone).toBeInstanceOf(VoltorbFlip);
    expect(clone.gameStatus).toBe(game.gameStatus);
    expect(clone.cells).toEqual(game.cells);

    clone.flipCell(0, 0);
    expect(clone.cells[0]?.[0]?.isFlipped).toBe(true);
    expect(game.cells[0]?.[0]?.isFlipped).toBe(false);
  });
});
