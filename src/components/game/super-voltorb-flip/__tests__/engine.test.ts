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
import { BOARD_CONFIGS } from "../hgss";
import type { Cell } from "../types";

// Engine tests. The VoltorbFlip block pins the HGSS rules (hgss.ts) as the engine applies them; the Level/Board/shuffle blocks still characterize the formula path that only ?size=N boards use.
// Math.random is handled via invariant assertions over many iterations for randomized
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

  it("ignores flips once the round is won (the NF(P7)-a re-entry quirk is gone on purpose)", () => {
    const g = new VoltorbFlip();
    const cells = g.cells.flat();
    // Flip every non-Voltorb card in board order until the round is won.
    for (let i = 0; i < 25 && g.gameStatus === "playing"; i++) {
      const cell = cells[i];
      if (cell && cell.value !== "V") g.flipCell(Math.floor(i / 5), i % 5);
    }
    expect(g.gameStatus).toBe("win");
    const total = g.totalScore;
    const level = g.currentLevel;
    const score = g.currentScore;
    for (let i = 0; i < 25; i++) {
      const cell = cells[i];
      if (cell && !cell.isFlipped && cell.value !== "V") g.flipCell(Math.floor(i / 5), i % 5);
    }
    expect(g.gameStatus).toBe("win");
    expect(g.totalScore).toBe(total);
    expect(g.currentLevel).toBe(level);
    expect(g.currentScore).toBe(score);
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
    const maxScore = game.cells
      .flat()
      .reduce((product, cell) => (cell.value === "V" ? product : product * cell.value), 1);
    game.debugWinLevel();
    expect(game.gameStatus).toBe("win");
    expect(game.currentLevel).toBe(2);
    expect(game.totalScore).toBe(maxScore);
  });

  it("deals a board from the HGSS table for the current level on 5x5", () => {
    const g = new VoltorbFlip();
    const flat = g.cells.flat().map((c) => c.value);
    const voltorbs = flat.filter((v) => v === "V").length;
    // Every Lv.1 board has exactly 6 Voltorbs.
    expect(voltorbs).toBe(6);
    expect(BOARD_CONFIGS.slice(0, 10)).toContainEqual(
      expect.objectContaining({
        voltorbs: 6,
        twos: flat.filter((v) => v === 2).length,
        threes: flat.filter((v) => v === 3).length,
      }),
    );
  });

  it("a loss drops the level to the number of cards flipped", () => {
    const g = new VoltorbFlip();
    g.restore(5, 0);
    const cells = g.cells.flat();
    let flipped = 0;
    for (let i = 0; i < 25 && flipped < 2; i++) {
      const cell = cells[i];
      if (cell && cell.value !== "V") {
        g.flipCell(Math.floor(i / 5), i % 5);
        flipped += 1;
      }
    }
    const v = cells.findIndex((c) => c.value === "V");
    g.flipCell(Math.floor(v / 5), v % 5);
    expect(g.gameStatus).toBe("lose");
    expect(g.currentLevel).toBe(2);
  });

  it("quit banks the round's coins and records the round", () => {
    const g = new VoltorbFlip();
    const cells = g.cells.flat();
    const i = cells.findIndex((c) => c.value !== "V");
    g.flipCell(Math.floor(i / 5), i % 5);
    const payout = g.currentScore;
    g.quit();
    expect(g.gameStatus).toBe("quit");
    expect(g.totalScore).toBe(payout);
    expect(g.history.at(-1)).toEqual(expect.objectContaining({ outcome: "quit", cardsFlipped: 1 }));
    // One card flipped at Lv.1: stays at Lv.1.
    expect(g.currentLevel).toBe(1);
  });

  it("quit is ignored once the round has ended", () => {
    const g = new VoltorbFlip();
    const cells = g.cells.flat();
    const v = cells.findIndex((c) => c.value === "V");
    g.flipCell(Math.floor(v / 5), v % 5);
    g.quit();
    expect(g.gameStatus).toBe("lose");
  });

  it("restartGame deals from an injected rng", () => {
    const a = new VoltorbFlip();
    const b = new VoltorbFlip();
    const rng = () => {
      let s = 1;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    };
    a.restartGame(rng());
    b.restartGame(rng());
    expect(a.cells.flat().map((c) => c.value)).toEqual(b.cells.flat().map((c) => c.value));
  });

  it("keeps a five-round history that survives cloneGame and restore", () => {
    const g = new VoltorbFlip();
    expect(g.history).toHaveLength(5);
    g.quit();
    const clone = cloneGame(g);
    expect(clone.history).toEqual(g.history);
    const h = g.history;
    const r = new VoltorbFlip();
    r.restore(3, 50, h);
    expect(r.history).toEqual(h);
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

describe("VoltorbFlip.restore", () => {
  it("sets the displayed level and total, starts a fresh playing round, and survives cloneGame", () => {
    const game = new VoltorbFlip();
    game.restore(7, 3714);

    expect(game.currentLevel).toBe(7);
    expect(game.totalScore).toBe(3714);
    expect(game.currentScore).toBe(0);
    expect(game.gameStatus).toBe("playing");
    expect(game.cells.flat().every((c) => !c.isFlipped)).toBe(true);

    const clone = cloneGame(game);
    expect(clone.currentLevel).toBe(7);
    expect(clone.totalScore).toBe(3714);
  });

  it("caps the restored level at 8 (HGSS has no Lv.9)", () => {
    const game = new VoltorbFlip();
    game.restore(9, 10);
    expect(game.currentLevel).toBe(8);
  });
});
