import { describe, it, expect } from "vitest";
import {
  gameLeaderboardRowSchema,
  gameLeaderboardFileSchema,
  emptyGameLeaderboardFile,
  passwordGameLeaderboardEntrySchema,
  passwordGameLeaderboardFileSchema,
  emptyPasswordGameLeaderboardFile,
  arcadeBoardRowSchema,
  arcadeBestRowSchema,
  arcadeTokenRowSchema,
  arcadeYouRowSchema,
  legacyLeaderboardRowSchema,
} from "../persistence-schemas";

const ISO = "2026-07-08T00:00:00.000Z";

const VALID_ROW = { name: "Pilot", score: 100, level: 3, createdAt: ISO };
const VALID_PG_ENTRY = {
  name: "Anonymous",
  seed: 42,
  elapsedSeconds: 300,
  ruleCount: 12,
  createdAt: ISO,
};

describe("gameLeaderboardRowSchema", () => {
  it("accepts a minimal row and a row with all per-game extras", () => {
    expect(gameLeaderboardRowSchema.safeParse(VALID_ROW).success).toBe(true);
    expect(
      gameLeaderboardRowSchema.safeParse({
        ...VALID_ROW,
        seconds: 12,
        kills: 3,
        distance: 400,
        region: "Ottawa, Canada",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-ISO createdAt", () => {
    expect(
      gameLeaderboardRowSchema.safeParse({ ...VALID_ROW, createdAt: "yesterday" }).success,
    ).toBe(false);
    expect(gameLeaderboardRowSchema.safeParse({ ...VALID_ROW, createdAt: "" }).success).toBe(false);
  });
});

describe("gameLeaderboardFileSchema", () => {
  it("accepts the empty file and a populated boards record", () => {
    expect(gameLeaderboardFileSchema.safeParse(emptyGameLeaderboardFile()).success).toBe(true);
    expect(
      gameLeaderboardFileSchema.safeParse({
        schemaVersion: 1,
        boards: { "space-shooter": [VALID_ROW], hextris: [] },
      }).success,
    ).toBe(true);
  });

  it("rejects the v1 on-disk shape (flat array, no envelope)", () => {
    expect(
      gameLeaderboardFileSchema.safeParse([{ ...VALID_ROW, game: "space-shooter" }]).success,
    ).toBe(false);
  });

  it("rejects a wrong schemaVersion", () => {
    expect(gameLeaderboardFileSchema.safeParse({ schemaVersion: 2, boards: {} }).success).toBe(
      false,
    );
  });
});

describe("passwordGameLeaderboard schemas", () => {
  it("accepts a valid entry and the empty file", () => {
    expect(passwordGameLeaderboardEntrySchema.safeParse(VALID_PG_ENTRY).success).toBe(true);
    expect(
      passwordGameLeaderboardFileSchema.safeParse(emptyPasswordGameLeaderboardFile()).success,
    ).toBe(true);
  });

  it("rejects v1 field names (time/rules)", () => {
    const v1 = { name: "A", seed: 1, time: 300, rules: 12, createdAt: ISO };
    expect(passwordGameLeaderboardEntrySchema.safeParse(v1).success).toBe(false);
  });

  it("rejects the v1 on-disk shape (flat array)", () => {
    expect(passwordGameLeaderboardFileSchema.safeParse([VALID_PG_ENTRY]).success).toBe(false);
  });
});

describe("arcade row pins", () => {
  const BOARD_ROW = {
    rank: 1,
    handle: "Ada",
    score: 4200,
    detail: { seconds: 60, kills: 40, distance: 1500 },
    achievedAt: ISO,
    isYou: false,
  };

  it("board row: accepts numbers and ISO strings as-is", () => {
    expect(arcadeBoardRowSchema.parse(BOARD_ROW)).toEqual(BOARD_ROW);
  });

  it("board row: coerces driver types (BIGINT string score, Date achievedAt)", () => {
    const parsed = arcadeBoardRowSchema.parse({
      ...BOARD_ROW,
      rank: "3",
      score: "9007199254740",
      achievedAt: new Date(ISO),
    });
    expect(parsed.rank).toBe(3);
    expect(parsed.score).toBe(9_007_199_254_740);
    expect(parsed.achievedAt).toBe(ISO);
  });

  it("board row: detail may carry the legacy marker", () => {
    const parsed = arcadeBoardRowSchema.parse({
      ...BOARD_ROW,
      detail: { seconds: 1, legacy: true },
    });
    expect(parsed.detail).toEqual({ seconds: 1, legacy: true });
  });

  it("board row: rejects null, empty and unsafe numeric strings and floats", () => {
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, score: null }).success).toBe(false);
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, score: "" }).success).toBe(false);
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, score: "12abc" }).success).toBe(false);
    expect(
      arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, score: "1234567890123456" }).success,
    ).toBe(false);
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, score: 1.5 }).success).toBe(false);
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, achievedAt: "yesterday" }).success).toBe(
      false,
    );
    expect(
      arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, achievedAt: new Date("nope") }).success,
    ).toBe(false);
  });

  it("board row: is strict, so a leaked column (player_id) fails instead of reaching the client", () => {
    expect(
      arcadeBoardRowSchema.safeParse({
        ...BOARD_ROW,
        player_id: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
    expect(arcadeBoardRowSchema.safeParse({ ...BOARD_ROW, isYou: undefined }).success).toBe(false);
  });

  it("you and best rows coerce the same way", () => {
    expect(arcadeYouRowSchema.parse({ rank: "2", score: "500" })).toEqual({ rank: 2, score: 500 });
    expect(arcadeBestRowSchema.parse({ score: "500", rank: 2 })).toEqual({ score: 500, rank: 2 });
    expect(arcadeYouRowSchema.safeParse({ rank: 2, score: 500, extra: 1 }).success).toBe(false);
  });

  it("token row requires a non-empty token_hash string and nothing else", () => {
    expect(arcadeTokenRowSchema.parse({ token_hash: "abc" })).toEqual({ token_hash: "abc" });
    expect(arcadeTokenRowSchema.safeParse({ token_hash: "" }).success).toBe(false);
    expect(arcadeTokenRowSchema.safeParse({}).success).toBe(false);
  });
});

describe("legacy leaderboard row pin", () => {
  const LEGACY_ROW = {
    id: 7,
    game: "hextris",
    name: "Ada",
    score: 20000,
    level: 17,
    seconds: 120,
    kills: 300,
    distance: null,
    created_at: new Date(ISO),
  };

  it("accepts a driver row and turns the Date into an ISO string", () => {
    expect(legacyLeaderboardRowSchema.parse(LEGACY_ROW)).toEqual({
      ...LEGACY_ROW,
      created_at: ISO,
    });
  });

  it("keeps NULL detail columns null (old rows and games that never sent them)", () => {
    const parsed = legacyLeaderboardRowSchema.parse({
      ...LEGACY_ROW,
      seconds: null,
      kills: null,
      distance: null,
    });
    expect([parsed.seconds, parsed.kills, parsed.distance]).toEqual([null, null, null]);
  });

  it("accepts only the two arcade games", () => {
    expect(
      legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, game: "space-shooter" }).success,
    ).toBe(true);
    expect(
      legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, game: "tower-stacker" }).success,
    ).toBe(false);
  });

  it("rejects an arcade game that never had legacy rows (a newer game must not read the frozen table)", () => {
    expect(
      legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, game: "super-voltorb-flip" }).success,
    ).toBe(false);
  });

  it("is strict and rejects fractional or missing numbers", () => {
    expect(legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, region: "Canada" }).success).toBe(
      false,
    );
    expect(legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, score: 1.5 }).success).toBe(false);
    expect(legacyLeaderboardRowSchema.safeParse({ ...LEGACY_ROW, level: null }).success).toBe(
      false,
    );
  });
});
