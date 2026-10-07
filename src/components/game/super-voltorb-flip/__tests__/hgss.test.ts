import { describe, it, expect } from "vitest";
import {
  BOARD_CONFIGS,
  EMPTY_ROUND,
  HISTORY_SIZE,
  MAX_LEVEL,
  PAYOUT_CAP,
  generateLayout,
  isRejected,
  levelOfBoard,
  maxPayout,
  nextLevel,
  pickBoardId,
  placeCards,
  type RoundSummary,
} from "../hgss";
import type { CellValue } from "../types";

// A deterministic rng: cycles through the given values.
function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

// mulberry32, for property-style runs over many seeds.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (
  outcome: RoundSummary["outcome"],
  cardsFlipped: number,
  level: number,
): RoundSummary => ({
  outcome,
  cardsFlipped,
  boardId: (level - 1) * 10,
});

// History is oldest first; the last entry is the round that just ended.
const history = (...rounds: RoundSummary[]): RoundSummary[] => {
  const padded = [...Array<RoundSummary>(HISTORY_SIZE).fill(EMPTY_ROUND), ...rounds];
  return padded.slice(padded.length - HISTORY_SIZE);
};

describe("BOARD_CONFIGS (sBoardConfigs, voltorb_flip_game.c)", () => {
  it("has 80 boards, 10 per level", () => {
    expect(BOARD_CONFIGS).toHaveLength(80);
  });

  // Every row of the decomp table: [voltorbs, twos, threes, maxFreePerRowCol, maxFreeTotal, payout].
  // prettier-ignore
  const decomp: Array<[number, number, number, number, number, number]> = [
    [6, 3, 1, 3, 3, 24], [6, 0, 3, 2, 2, 27], [6, 5, 0, 3, 4, 32], [6, 2, 2, 3, 3, 36], [6, 4, 1, 3, 4, 48],
    [6, 3, 1, 3, 3, 24], [6, 0, 3, 2, 2, 27], [6, 5, 0, 3, 4, 32], [6, 2, 2, 3, 3, 36], [6, 4, 1, 3, 4, 48],
    [7, 1, 3, 2, 3, 54], [7, 6, 0, 3, 4, 64], [7, 3, 2, 2, 3, 72], [7, 0, 4, 2, 3, 81], [7, 5, 1, 3, 4, 96],
    [7, 1, 3, 2, 2, 54], [7, 6, 0, 3, 3, 64], [7, 3, 2, 2, 2, 72], [7, 0, 4, 2, 2, 81], [7, 5, 1, 3, 3, 96],
    [8, 2, 3, 2, 3, 108], [8, 7, 0, 3, 4, 128], [8, 4, 2, 3, 4, 144], [8, 1, 4, 2, 3, 162], [8, 6, 1, 4, 3, 192],
    [8, 2, 3, 2, 2, 108], [8, 7, 0, 3, 3, 128], [8, 4, 2, 3, 3, 144], [8, 1, 4, 2, 2, 162], [8, 6, 1, 3, 3, 192],
    [8, 3, 3, 4, 3, 216], [8, 0, 5, 2, 3, 243], [10, 8, 0, 4, 5, 256], [10, 5, 2, 3, 4, 288], [10, 2, 4, 3, 4, 324],
    [8, 3, 3, 3, 3, 216], [8, 0, 5, 2, 2, 243], [10, 8, 0, 4, 4, 256], [10, 5, 2, 3, 3, 288], [10, 2, 4, 3, 3, 324],
    [10, 7, 1, 4, 5, 384], [10, 4, 3, 3, 4, 432], [10, 1, 5, 3, 4, 486], [10, 9, 0, 4, 5, 512], [10, 6, 2, 4, 5, 576],
    [10, 7, 1, 4, 4, 384], [10, 4, 3, 3, 3, 432], [10, 1, 5, 3, 3, 486], [10, 9, 0, 4, 4, 512], [10, 6, 2, 4, 4, 576],
    [10, 3, 4, 3, 4, 648], [10, 0, 6, 3, 4, 729], [10, 8, 1, 4, 5, 768], [10, 5, 3, 4, 5, 864], [10, 2, 5, 3, 4, 972],
    [10, 3, 4, 3, 3, 648], [10, 0, 6, 3, 3, 729], [10, 8, 1, 4, 4, 768], [10, 5, 3, 4, 4, 864], [10, 2, 5, 3, 3, 972],
    [10, 7, 2, 4, 5, 1152], [10, 4, 4, 4, 5, 1296], [13, 1, 6, 3, 4, 1458], [13, 9, 1, 5, 6, 1536], [10, 6, 3, 4, 5, 1728],
    [10, 7, 2, 4, 4, 1152], [10, 4, 4, 4, 4, 1296], [13, 1, 6, 3, 3, 1458], [13, 9, 1, 5, 5, 1536], [10, 6, 3, 4, 4, 1728],
    [10, 0, 7, 3, 4, 2187], [10, 8, 2, 5, 6, 2304], [10, 5, 4, 4, 5, 2592], [10, 2, 6, 4, 5, 2916], [10, 7, 3, 5, 6, 3456],
    [10, 0, 7, 3, 3, 2187], [10, 8, 2, 5, 5, 2304], [10, 5, 4, 4, 4, 2592], [10, 2, 6, 4, 4, 2916], [10, 7, 3, 5, 5, 3456],
  ];

  it.each(decomp.map((row, id) => [id, ...row] as const))(
    "board %i is %i voltorbs, %i twos, %i threes, free caps %i per line and %i total, payout %i",
    (id, voltorbs, twos, threes, maxFreePerRowCol, maxFreeTotal, payout) => {
      expect(BOARD_CONFIGS[id]).toEqual({
        voltorbs,
        twos,
        threes,
        maxFreePerRowCol,
        maxFreeTotal,
      });
      expect(2 ** twos * 3 ** threes).toBe(payout);
    },
  );
});

describe("levelOfBoard and pickBoardId (sBoardIdDistribution, SelectBoardId)", () => {
  it("maps board ids 0-9 to Lv.1 and 70-79 to Lv.8", () => {
    expect(levelOfBoard(0)).toBe(1);
    expect(levelOfBoard(9)).toBe(1);
    expect(levelOfBoard(70)).toBe(8);
    expect(levelOfBoard(79)).toBe(8);
  });

  it("picks uniformly among the level's ten boards", () => {
    expect(pickBoardId(1, () => 0)).toBe(0);
    expect(pickBoardId(1, () => 0.999999)).toBe(9);
    expect(pickBoardId(4, () => 0.35)).toBe(33);
    expect(pickBoardId(8, () => 0.5)).toBe(75);
  });

  it("clamps the level into 1-8", () => {
    expect(pickBoardId(0, () => 0)).toBe(0);
    expect(pickBoardId(9, () => 0)).toBe(70);
  });
});

describe("nextLevel (CalcNextLevel)", () => {
  it("starts a fresh session at Lv.1", () => {
    expect(nextLevel(history())).toBe(1);
  });

  it("a win moves up one level, from Lv.1 through Lv.6", () => {
    for (let level = 1; level <= 6; level++) {
      expect(nextLevel(history(round("won", 9, level)))).toBe(level + 1);
    }
  });

  it("a win at Lv.7 stays at Lv.7 without the streak", () => {
    expect(nextLevel(history(round("won", 9, 7)))).toBe(7);
  });

  it("a win at Lv.8 stays at Lv.8", () => {
    expect(nextLevel(history(round("won", 9, 8)))).toBe(8);
  });

  it("a loss or a quit drops to the number of cards flipped, never below Lv.1 or above the current level", () => {
    expect(nextLevel(history(round("lost", 0, 5)))).toBe(1);
    expect(nextLevel(history(round("lost", 1, 5)))).toBe(1);
    expect(nextLevel(history(round("lost", 3, 5)))).toBe(3);
    expect(nextLevel(history(round("lost", 5, 5)))).toBe(5);
    expect(nextLevel(history(round("lost", 12, 5)))).toBe(5);
    expect(nextLevel(history(round("quit", 2, 4)))).toBe(2);
    expect(nextLevel(history(round("quit", 9, 4)))).toBe(4);
  });

  it("a loss at Lv.8 drops to Lv.7 at most", () => {
    expect(nextLevel(history(round("lost", 12, 8)))).toBe(7);
  });

  it("five rounds in a row without a loss and with 8+ cards flipped jump to Lv.8 from Lv.5 or higher", () => {
    expect(
      nextLevel(
        history(
          round("won", 8, 2),
          round("won", 8, 3),
          round("won", 9, 4),
          round("quit", 8, 5),
          round("won", 10, 5),
        ),
      ),
    ).toBe(8);
  });

  it("the streak needs the last round at Lv.5 or higher", () => {
    expect(
      nextLevel(
        history(
          round("won", 8, 1),
          round("won", 8, 2),
          round("won", 8, 3),
          round("won", 8, 4),
          round("won", 8, 4),
        ),
      ),
    ).toBe(5);
  });

  it("one loss or one round under 8 cards breaks the streak", () => {
    expect(
      nextLevel(
        history(
          round("won", 8, 3),
          round("lost", 8, 4),
          round("won", 8, 4),
          round("won", 8, 5),
          round("won", 8, 6),
        ),
      ),
    ).toBe(7);
    expect(
      nextLevel(
        history(
          round("won", 8, 3),
          round("won", 7, 4),
          round("won", 8, 5),
          round("won", 8, 6),
          round("won", 8, 6),
        ),
      ),
    ).toBe(7);
  });
});

describe("placeCards (PlaceCardsOnBoard)", () => {
  it("places cards only on 1s, retrying collisions", () => {
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    // Ids 0, 0 (collision, retried), 1. 1.5 / 25 keeps floor(x * 25) clear of float edges.
    placeCards(cells, "V", 2, seq([0, 0, 1.5 / 25]));
    expect(cells.filter((c) => c === "V")).toHaveLength(2);
    expect(cells[0]).toBe("V");
    expect(cells[1]).toBe("V");
  });

  it("gives up after 100 failed attempts in one call", () => {
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    cells[0] = 2;
    placeCards(cells, "V", 1, () => 0);
    expect(cells.filter((c) => c === "V")).toHaveLength(0);
  });
});

describe("isRejected (RetryBoardGen)", () => {
  const config = { voltorbs: 1, twos: 2, threes: 0, maxFreePerRowCol: 2, maxFreeTotal: 3 };

  it("counts a multiplier as free when its row or its column has no Voltorb", () => {
    // Voltorb at (0,0); twos at (0,1) and (1,1). (0,1): row 0 has a Voltorb, column 1 has none,
    // so it is free. (1,1): row 1 and column 1 have none, so it is free. Two free in column 1.
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    cells[0] = "V";
    cells[1] = 2;
    cells[6] = 2;
    expect(isRejected(cells, config)).toBe(true);
  });

  it("accepts a board under both caps", () => {
    // Voltorbs at (0,0) and (1,1) cover rows 0-1 and columns 0-1; the two at (0,1) is not free.
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    cells[0] = "V";
    cells[6] = "V";
    cells[1] = 2;
    expect(isRejected(cells, { ...config, voltorbs: 2, twos: 1 })).toBe(false);
  });

  it("rejects when the free total reaches maxFreeTotal", () => {
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    cells[0] = 2;
    cells[12] = 2;
    cells[24] = 2;
    expect(isRejected(cells, { ...config, maxFreePerRowCol: 5 })).toBe(true);
  });
});

describe("generateLayout (GenerateBoard)", () => {
  it("deals the configured counts on 5x5 for every board over many seeds", () => {
    for (let id = 0; id < 80; id++) {
      const config = BOARD_CONFIGS[id];
      if (!config) throw new Error(`missing board ${id}`);
      for (let seed = 1; seed <= 20; seed++) {
        const cells = generateLayout(id, mulberry32(seed * 1000 + id));
        expect(cells).toHaveLength(25);
        expect(cells.filter((c) => c === "V")).toHaveLength(config.voltorbs);
        expect(cells.filter((c) => c === 2)).toHaveLength(config.twos);
        expect(cells.filter((c) => c === 3)).toHaveLength(config.threes);
      }
    }
  });

  it("almost always deals a board the free-multiplier caps accept", () => {
    let rejected = 0;
    for (let id = 0; id < 80; id++) {
      const config = BOARD_CONFIGS[id];
      if (!config) throw new Error(`missing board ${id}`);
      for (let seed = 1; seed <= 20; seed++) {
        if (isRejected(generateLayout(id, mulberry32(seed * 7919 + id)), config)) rejected += 1;
      }
    }
    // 1000 retries per deal make a rejected final board vanishingly rare.
    expect(rejected).toBe(0);
  });

  it("is deterministic for a given rng", () => {
    expect(generateLayout(42, mulberry32(7))).toEqual(generateLayout(42, mulberry32(7)));
  });
});

describe("maxPayout (CalcBoardMaxPayout)", () => {
  it("multiplies every non-Voltorb card", () => {
    const cells: CellValue[] = Array<CellValue>(25).fill(1);
    cells[0] = 2;
    cells[1] = 3;
    cells[2] = "V";
    expect(maxPayout(cells)).toBe(6);
  });

  it("caps at 50000", () => {
    const cells: CellValue[] = Array<CellValue>(25).fill(3);
    expect(maxPayout(cells)).toBe(PAYOUT_CAP);
  });
});

describe("constants", () => {
  it("HGSS has eight levels and a five-round history", () => {
    expect(MAX_LEVEL).toBe(8);
    expect(HISTORY_SIZE).toBe(5);
  });
});
