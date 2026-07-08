import { describe, it, expect } from "vitest";
import {
  gameLeaderboardRowSchema,
  passwordGameLeaderboardEntrySchema,
  leadRecordSchema,
  PERSISTENCE_SCHEMA_VERSION,
} from "../persistence-schemas";
// The restore-drill validator mirrors the zod schemas structurally instead of
// importing them (it must run dependency-free against a backup artifact).
// This suite is the drift guard (P2-DATA-007): every fixture goes through
// BOTH implementations and the verdicts must match. Add a field to a zod
// schema without updating the mirror and this fails.
import {
  isValidLeadRow,
  isValidLeaderboardRow,
  isValidPgLeaderboardRow,
} from "../../../scripts/validate-data-files.mjs";

const ISO = "2026-07-08T00:00:00.000Z";
const UUID = "6f1e1e7e-9a4b-4c3e-8f2a-1b2c3d4e5f60";

const leadFixtures: Array<[string, unknown]> = [
  [
    "valid v2 lead",
    {
      schemaVersion: PERSISTENCE_SCHEMA_VERSION,
      id: UUID,
      name: "A",
      email: "a@b.com",
      note: "",
      source: "chatbot",
      page: "/ai",
      createdAt: ISO,
    },
  ],
  ["v1 lead (timestamp)", { name: "A", email: "a@b.com", note: "", source: "s", timestamp: ISO }],
  [
    "bad uuid",
    {
      schemaVersion: 1,
      id: "nope",
      name: "A",
      email: "a@b.com",
      note: "",
      source: "s",
      page: "/",
      createdAt: ISO,
    },
  ],
  [
    "bad createdAt",
    {
      schemaVersion: 1,
      id: UUID,
      name: "A",
      email: "a@b.com",
      note: "",
      source: "s",
      page: "/",
      createdAt: "12pm",
    },
  ],
  ["not an object", "lead"],
];

const rowFixtures: Array<[string, unknown]> = [
  ["minimal valid row", { name: "A", score: 1, level: 1, createdAt: ISO }],
  [
    "row with extras",
    {
      name: "A",
      score: 1,
      level: 1,
      seconds: 9,
      kills: 2,
      distance: 3,
      region: "R",
      createdAt: ISO,
    },
  ],
  ["wrong score type", { name: "A", score: "1", level: 1, createdAt: ISO }],
  ["bad createdAt", { name: "A", score: 1, level: 1, createdAt: "t" }],
  ["missing level", { name: "A", score: 1, createdAt: ISO }],
];

const pgFixtures: Array<[string, unknown]> = [
  ["valid v2 entry", { name: "A", seed: 1, elapsedSeconds: 10, ruleCount: 2, createdAt: ISO }],
  ["v1 field names", { name: "A", seed: 1, time: 10, rules: 2, createdAt: ISO }],
  ["bad createdAt", { name: "A", seed: 1, elapsedSeconds: 10, ruleCount: 2, createdAt: "t" }],
];

describe("zod schema <-> mjs mirror parity", () => {
  it.each(leadFixtures)("lead verdicts agree: %s", (_label, fixture) => {
    expect(isValidLeadRow(fixture)).toBe(leadRecordSchema.safeParse(fixture).success);
  });

  it.each(rowFixtures)("leaderboard row verdicts agree: %s", (_label, fixture) => {
    expect(isValidLeaderboardRow(fixture)).toBe(
      gameLeaderboardRowSchema.safeParse(fixture).success,
    );
  });

  it.each(pgFixtures)("password-game verdicts agree: %s", (_label, fixture) => {
    expect(isValidPgLeaderboardRow(fixture)).toBe(
      passwordGameLeaderboardEntrySchema.safeParse(fixture).success,
    );
  });
});
