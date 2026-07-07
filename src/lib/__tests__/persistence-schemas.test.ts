import { describe, it, expect } from "vitest";
import {
  leaderboardEntrySchema,
  pgLeaderboardEntrySchema,
  leadRecordSchema,
  type LeadRecord,
} from "../persistence-schemas";

describe("leaderboardEntrySchema", () => {
  it("accepts a canonical valid entry, including all optional fields", () => {
    const entry = {
      name: "Ada",
      score: 500,
      level: 3,
      seconds: 10,
      kills: 5,
      distance: 100,
      region: "us-east",
      game: "space-shooter",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(leaderboardEntrySchema.safeParse(entry)).toMatchObject({ success: true });
  });

  it("accepts a minimal valid entry with no optional fields (mirrors the DD1-001 default path)", () => {
    const entry = { name: "Ada", score: 500, level: 3, createdAt: "t" };
    expect(leaderboardEntrySchema.safeParse(entry)).toMatchObject({ success: true });
  });

  it("rejects a missing required field", () => {
    const entry = { score: 500, level: 3, createdAt: "t" };
    expect(leaderboardEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("rejects a wrong-typed required field", () => {
    const entry = { name: "Ada", score: "500", level: 3, createdAt: "t" };
    expect(leaderboardEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("safeParse never throws on garbage input", () => {
    expect(() => leaderboardEntrySchema.safeParse(null)).not.toThrow();
    expect(() => leaderboardEntrySchema.safeParse("not an object")).not.toThrow();
    expect(() => leaderboardEntrySchema.safeParse(42)).not.toThrow();
  });
});

describe("pgLeaderboardEntrySchema", () => {
  it("accepts a canonical valid entry", () => {
    const entry = { name: "Ada", seed: 7, time: 120, rules: 10, createdAt: "t" };
    expect(pgLeaderboardEntrySchema.safeParse(entry)).toMatchObject({ success: true });
  });

  it("rejects a missing required field", () => {
    const entry = { name: "Ada", seed: 7, time: 120 };
    expect(pgLeaderboardEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("rejects a wrong-typed required field", () => {
    const entry = { name: "Ada", seed: "7", time: 120, rules: 10, createdAt: "t" };
    expect(pgLeaderboardEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("safeParse never throws on garbage input", () => {
    expect(() => pgLeaderboardEntrySchema.safeParse(undefined)).not.toThrow();
    expect(() => pgLeaderboardEntrySchema.safeParse([])).not.toThrow();
  });
});

describe("leadRecordSchema", () => {
  it("accepts a canonical valid record", () => {
    // Typed as LeadRecord (not just the schema's own safeParse) so the
    // fixture itself catches drift between this test and the inferred type.
    const record: LeadRecord = {
      name: "Ada",
      email: "ada@example.com",
      note: "hire me",
      source: "chatbot",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    expect(leadRecordSchema.safeParse(record)).toMatchObject({ success: true });
  });

  it("rejects a missing required field", () => {
    const record = { name: "Ada", email: "ada@example.com" };
    expect(leadRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects a wrong-typed required field", () => {
    const record = {
      name: "Ada",
      email: "ada@example.com",
      note: "hire me",
      source: "chatbot",
      timestamp: 12345,
    };
    expect(leadRecordSchema.safeParse(record).success).toBe(false);
  });

  it("safeParse never throws on garbage input", () => {
    expect(() => leadRecordSchema.safeParse(null)).not.toThrow();
    expect(() => leadRecordSchema.safeParse(42)).not.toThrow();
  });
});
