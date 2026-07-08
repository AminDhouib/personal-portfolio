import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SCHEMA_VERSION,
  isValidLeadRow,
  isValidLeaderboardRow,
  isValidPgLeaderboardRow,
  validateLeaderboardFile,
  validatePgLeaderboardFile,
  validateJsonl,
  validateDataDir,
} from "./validate-data-files.mjs";

const ISO = "2026-07-08T00:00:00.000Z";
const UUID = "6f1e1e7e-9a4b-4c3e-8f2a-1b2c3d4e5f60";

const LEAD = {
  schemaVersion: SCHEMA_VERSION,
  id: UUID,
  name: "A",
  email: "a@b.com",
  note: "",
  source: "chatbot",
  page: "/",
  createdAt: ISO,
};
const ROW = { name: "A", score: 1, level: 1, createdAt: ISO };
const PG_ROW = { name: "A", seed: 1, elapsedSeconds: 1, ruleCount: 1, createdAt: ISO };

describe("row validators (v2)", () => {
  it("accepts a canonical lead line and rejects the v1 shape", () => {
    expect(isValidLeadRow(LEAD)).toBe(true);
    expect(
      isValidLeadRow({ name: "A", email: "a@b.com", note: "", source: "s", timestamp: ISO }),
    ).toBe(false);
    expect(isValidLeadRow({ ...LEAD, id: "not-a-uuid" })).toBe(false);
    expect(isValidLeadRow({ ...LEAD, createdAt: "yesterday" })).toBe(false);
  });

  it("accepts a canonical leaderboard row and rejects wrong types / bad dates", () => {
    expect(isValidLeaderboardRow(ROW)).toBe(true);
    expect(isValidLeaderboardRow({ ...ROW, seconds: 10, region: "Ottawa" })).toBe(true);
    expect(isValidLeaderboardRow({ ...ROW, score: "1" })).toBe(false);
    expect(isValidLeaderboardRow({ ...ROW, createdAt: "t" })).toBe(false);
  });

  it("accepts a canonical password-game row and rejects v1 field names", () => {
    expect(isValidPgLeaderboardRow(PG_ROW)).toBe(true);
    expect(isValidPgLeaderboardRow({ name: "A", seed: 1, time: 1, rules: 1, createdAt: ISO })).toBe(
      false,
    );
  });
});

describe("envelope validators (v2)", () => {
  it("accepts a versioned boards envelope, empty or populated", () => {
    expect(validateLeaderboardFile({ schemaVersion: 1, boards: {} })).toMatchObject({
      total: 0,
      valid: 0,
      parseError: false,
    });
    expect(
      validateLeaderboardFile({ schemaVersion: 1, boards: { hextris: [ROW, ROW] } }),
    ).toMatchObject({ total: 2, valid: 2 });
  });

  it("flags the v1 flat array and wrong versions as malformed", () => {
    expect(validateLeaderboardFile([ROW]).parseError).toBe(true);
    expect(validateLeaderboardFile({ schemaVersion: 2, boards: {} })).toMatchObject({
      parseError: true,
      wrongVersion: true,
    });
  });

  it("reports invalid rows by board and index", () => {
    const res = validateLeaderboardFile({
      schemaVersion: 1,
      boards: { hextris: [ROW, { name: "x" }] },
    });
    expect(res.valid).toBe(1);
    expect(res.invalidAt).toEqual(["hextris[1]"]);
  });

  it("validates the password-game entries envelope the same way", () => {
    expect(validatePgLeaderboardFile({ schemaVersion: 1, entries: [PG_ROW] })).toMatchObject({
      total: 1,
      valid: 1,
    });
    expect(validatePgLeaderboardFile([PG_ROW]).parseError).toBe(true);
    expect(
      validatePgLeaderboardFile({ schemaVersion: 1, entries: [PG_ROW, { name: "x" }] }).invalidAt,
    ).toEqual([2]);
  });
});

describe("validateJsonl", () => {
  it("counts valid rows and flags invalid/malformed lines by line number", () => {
    const text = [JSON.stringify(LEAD), "{not json", JSON.stringify({ name: "B" })].join("\n");
    const res = validateJsonl(text, isValidLeadRow);
    expect(res).toMatchObject({ total: 3, valid: 1 });
    expect(res.invalidAt).toEqual([2, 3]);
  });
});

describe("validateDataDir", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "validate-data-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reports all three files with mixed validity", async () => {
    await fs.writeFile(path.join(dir, "leads.jsonl"), JSON.stringify(LEAD) + "\n", "utf-8");
    await fs.writeFile(
      path.join(dir, "leaderboard.json"),
      JSON.stringify({ schemaVersion: 1, boards: { hextris: [ROW] } }),
      "utf-8",
    );
    // password-game file intentionally absent
    const report = validateDataDir(dir);
    const byFile = Object.fromEntries(report.map((r) => [r.file, r]));
    expect(byFile["leads.jsonl"]).toMatchObject({ readable: true, total: 1, valid: 1 });
    expect(byFile["leaderboard.json"]).toMatchObject({ readable: true, total: 1, valid: 1 });
    expect(byFile["password-game-leaderboard.json"].readable).toBe(false);
  });
});
