import { describe, it, expect } from "vitest";
import {
  gameLeaderboardRowSchema,
  gameLeaderboardFileSchema,
  emptyGameLeaderboardFile,
  passwordGameLeaderboardEntrySchema,
  passwordGameLeaderboardFileSchema,
  emptyPasswordGameLeaderboardFile,
  leadRecordSchema,
  PERSISTENCE_SCHEMA_VERSION,
} from "../persistence-schemas";

// Pinning tests for the v2 persisted shapes (pass-2 break+reset). These
// assert BOTH directions: what v2 accepts, and that v1-era shapes are
// rejected (the store's version/quarantine machinery depends on rejection).

const ISO = "2026-07-08T00:00:00.000Z";

const VALID_ROW = { name: "Pilot", score: 100, level: 3, createdAt: ISO };
const VALID_PG_ENTRY = {
  name: "Anonymous",
  seed: 42,
  elapsedSeconds: 300,
  ruleCount: 12,
  createdAt: ISO,
};
const VALID_LEAD = {
  schemaVersion: PERSISTENCE_SCHEMA_VERSION,
  id: "6f1e1e7e-9a4b-4c3e-8f2a-1b2c3d4e5f60",
  name: "Ada",
  email: "ada@example.com",
  note: "",
  source: "chatbot",
  page: "/",
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

describe("leadRecordSchema", () => {
  it("accepts a fully-stamped v2 line", () => {
    expect(leadRecordSchema.safeParse(VALID_LEAD).success).toBe(true);
  });

  it("rejects the v1 line shape (timestamp, no id/page/version)", () => {
    const v1 = {
      name: "Ada",
      email: "ada@example.com",
      note: "",
      source: "chatbot",
      timestamp: ISO,
    };
    expect(leadRecordSchema.safeParse(v1).success).toBe(false);
  });

  it("rejects a malformed id and a non-ISO createdAt", () => {
    expect(leadRecordSchema.safeParse({ ...VALID_LEAD, id: "not-a-uuid" }).success).toBe(false);
    expect(leadRecordSchema.safeParse({ ...VALID_LEAD, createdAt: "12pm" }).success).toBe(false);
  });
});
