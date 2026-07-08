import { describe, it, expect } from "vitest";
import {
  gameLeaderboardRowSchema,
  gameLeaderboardFileSchema,
  emptyGameLeaderboardFile,
  passwordGameLeaderboardEntrySchema,
  passwordGameLeaderboardFileSchema,
  emptyPasswordGameLeaderboardFile,
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
