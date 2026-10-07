// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DAILY_LEVEL,
  checkDailyScore,
  dailyBoard,
  dayNumber,
  isDayKey,
  previousDay,
} from "../daily-board";
import { levelOfBoard, maxPayout } from "../hgss";

describe("dailyBoard (golden vectors)", () => {
  // Computed once from the recipe above; if one of these changes, the recipe
  // changed and the seed prefix must be bumped to v2.
  const GOLDEN = [
    { day: "2026-10-07", boardId: 43, maxCoins: 512, layout: "22V2V1VVV11VV12V1V222122V" },
    { day: "2026-10-08", boardId: 43, maxCoins: 512, layout: "V12V212VVV21VV12VV22V1212" },
    { day: "2026-01-01", boardId: 41, maxCoins: 432, layout: "1VV111V23V3VV3VV21122V1V1" },
  ];

  for (const g of GOLDEN) {
    it(`deals ${g.day} exactly`, () => {
      const board = dailyBoard(g.day);
      expect(board.dayKey).toBe(g.day);
      expect(board.boardId).toBe(g.boardId);
      expect(board.maxCoins).toBe(g.maxCoins);
      expect(board.layout.join("")).toBe(g.layout);
    });
  }

  it("is the fixed daily level", () => {
    expect(DAILY_LEVEL).toBe(5);
  });

  it("is deterministic and differs between days", () => {
    expect(dailyBoard("2026-10-07")).toEqual(dailyBoard("2026-10-07"));
    expect(dailyBoard("2026-10-07").layout).not.toEqual(dailyBoard("2026-10-09").layout);
  });

  it("is a valid Lv.5 board for every day of 2026", () => {
    const start = Date.UTC(2026, 0, 1);
    const ids = new Set<number>();
    for (let i = 0; i < 365; i++) {
      const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      const board = dailyBoard(day);
      expect(levelOfBoard(board.boardId)).toBe(DAILY_LEVEL);
      expect(board.layout).toHaveLength(25);
      expect(board.maxCoins).toBe(maxPayout(board.layout));
      expect(board.voltorbs + board.safeTiles).toBe(25);
      expect(board.twos + board.threes).toBeGreaterThan(0);
      ids.add(board.boardId);
    }
    expect([...ids].sort((a, b) => a - b)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
  });
});

describe("day helpers", () => {
  it("dayNumber is the YYYYMMDD integer", () => {
    expect(dayNumber("2026-10-07")).toBe(20261007);
  });
  it("isDayKey accepts real calendar days only", () => {
    expect(isDayKey("2026-10-07")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("26-10-07")).toBe(false);
    expect(isDayKey("")).toBe(false);
  });
  it("previousDay crosses month, year and leap-day boundaries", () => {
    expect(previousDay("2026-10-07")).toBe("2026-10-06");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });
});

describe("checkDailyScore (2026-10-07: nine 2s, no 3s, ten Voltorbs, 15 safe tiles, max 512)", () => {
  const board = dailyBoard("2026-10-07");
  it("accepts every score this board can pay", () => {
    expect(checkDailyScore(board, 512, 9)).toBeNull(); // cleared: all nine 2s
    expect(checkDailyScore(board, 512, 15)).toBeNull(); // cleared after flipping every safe tile
    expect(checkDailyScore(board, 256, 8)).toBeNull();
    expect(checkDailyScore(board, 1, 1)).toBeNull(); // one 1 banked
    expect(checkDailyScore(board, 0, 0)).toBeNull(); // quit at once, or a loss
    expect(checkDailyScore(board, 0, 5)).toBeNull();
  });
  it("rejects a score above the board's maximum", () => {
    expect(checkDailyScore(board, 513, 15)).toBe("score above the board's maximum");
    expect(checkDailyScore(board, 1024, 15)).toBe("score above the board's maximum");
  });
  it("rejects a score that is not a product of the board's tiles", () => {
    expect(checkDailyScore(board, 5, 3)).toBe("score is not a product of 2s and 3s");
    expect(checkDailyScore(board, 3, 3)).toBe("score needs more 2s or 3s than the board holds");
    expect(checkDailyScore(board, 6, 3)).toBe("score needs more 2s or 3s than the board holds");
  });
  it("rejects too few flips for the coins, and coins with no flip", () => {
    expect(checkDailyScore(board, 512, 8)).toBe("too few flips for the score");
    expect(checkDailyScore(board, 2, 0)).toBe("coins without a flip");
  });
  it("rejects more flips than the board has safe tiles", () => {
    expect(checkDailyScore(board, 0, 16)).toBe("more flips than safe tiles");
    expect(checkDailyScore(board, 512, 16)).toBe("more flips than safe tiles");
  });
  it("works on a board with 2s and 3s (2026-01-01: four 2s, three 3s, max 432)", () => {
    const mixed = dailyBoard("2026-01-01");
    expect(checkDailyScore(mixed, 432, 7)).toBeNull();
    expect(checkDailyScore(mixed, 12, 3)).toBeNull(); // 2 * 2 * 3
    expect(checkDailyScore(mixed, 12, 2)).toBe("too few flips for the score");
    expect(checkDailyScore(mixed, 32, 5)).toBe("score needs more 2s or 3s than the board holds");
  });
});
