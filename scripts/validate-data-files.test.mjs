import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isValidLeadRow,
  isValidLeaderboardRow,
  isValidPgLeaderboardRow,
  validateJsonl,
  validateJsonArray,
  validateDataDir,
} from "./validate-data-files.mjs";

describe("row validators", () => {
  it("accepts a canonical lead row and rejects one missing a required field", () => {
    expect(
      isValidLeadRow({ name: "A", email: "a@b.com", note: "", source: "chatbot", timestamp: "t" }),
    ).toBe(true);
    expect(isValidLeadRow({ name: "A", email: "a@b.com" })).toBe(false);
  });

  it("accepts a canonical leaderboard row and rejects a wrong-typed field", () => {
    expect(isValidLeaderboardRow({ name: "A", score: 1, level: 1, createdAt: "t" })).toBe(true);
    expect(isValidLeaderboardRow({ name: "A", score: "1", level: 1, createdAt: "t" })).toBe(false);
  });

  it("accepts a canonical password-game row and rejects a missing field", () => {
    expect(isValidPgLeaderboardRow({ name: "A", seed: 1, time: 1, rules: 1, createdAt: "t" })).toBe(
      true,
    );
    expect(isValidPgLeaderboardRow({ name: "A", seed: 1, time: 1 })).toBe(false);
  });
});

describe("validateJsonl", () => {
  it("counts valid rows and flags invalid/malformed lines by line number", () => {
    const text = [
      JSON.stringify({ name: "A", email: "a@b.com", note: "", source: "s", timestamp: "t" }),
      "{not json",
      JSON.stringify({ name: "B" }),
      "",
    ].join("\n");
    const result = validateJsonl(text, isValidLeadRow);
    expect(result.total).toBe(3);
    expect(result.valid).toBe(1);
    expect(result.invalidAt).toEqual([2, 3]);
  });
});

describe("validateJsonArray", () => {
  it("counts valid rows and flags invalid indices", () => {
    const text = JSON.stringify([{ name: "A", score: 1, level: 1, createdAt: "t" }, { name: "B" }]);
    const result = validateJsonArray(text, isValidLeaderboardRow);
    expect(result.total).toBe(2);
    expect(result.valid).toBe(1);
    expect(result.invalidAt).toEqual([2]);
  });

  it("flags a non-array JSON value as a parse error", () => {
    const result = validateJsonArray(JSON.stringify({ not: "an array" }), isValidLeaderboardRow);
    expect(result.parseError).toBe(true);
  });

  it("flags malformed JSON text as a parse error", () => {
    const result = validateJsonArray("{ not json", isValidLeaderboardRow);
    expect(result.parseError).toBe(true);
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

  it("reports a good directory as fully valid across all three files", async () => {
    await fs.writeFile(
      path.join(dir, "leads.jsonl"),
      JSON.stringify({ name: "A", email: "a@b.com", note: "", source: "s", timestamp: "t" }) + "\n",
    );
    await fs.writeFile(
      path.join(dir, "leaderboard.json"),
      JSON.stringify([{ name: "A", score: 1, level: 1, createdAt: "t" }]),
    );
    await fs.writeFile(
      path.join(dir, "password-game-leaderboard.json"),
      JSON.stringify([{ name: "A", seed: 1, time: 1, rules: 1, createdAt: "t" }]),
    );

    const report = validateDataDir(dir);
    expect(report).toHaveLength(3);
    expect(report.every((r) => r.readable && r.valid > 0)).toBe(true);
  });

  it("reports each file as unreadable when the directory is empty", async () => {
    const report = validateDataDir(dir);
    expect(report.every((r) => r.readable === false)).toBe(true);
  });

  it("flags a file with zero valid rows without throwing", async () => {
    await fs.writeFile(path.join(dir, "leaderboard.json"), JSON.stringify([{ bad: true }]));
    const report = validateDataDir(dir);
    const lb = report.find((r) => r.file === "leaderboard.json");
    if (!lb) throw new Error("expected a leaderboard.json report row");
    expect(lb.readable).toBe(true);
    expect(lb.valid).toBe(0);
  });
});
