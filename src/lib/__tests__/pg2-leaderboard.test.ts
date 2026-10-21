import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { dailySeed, dailySeedForDay } from "@/components/game/password-game-2/engine/rng";
import {
  DAILY_GRACE_MS,
  MAX_TOTAL_ROWS,
  PG2_SCHEMA_STATEMENTS,
  PROTECTED_TOP_ROWS,
  SEED_MAX,
  acceptedDailySeeds,
  isAcceptedDailySeed,
  parseSeedParam,
} from "../pg2-leaderboard";

function collapse(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** Every statement in db/init.sql with comments dropped, split on ';' and whitespace-collapsed. */
function initSqlStatements(): string[] {
  const text = readFileSync(path.resolve(process.cwd(), "db/init.sql"), "utf8");
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map(collapse)
    .filter((statement) => statement.length > 0);
}

describe("parseSeedParam", () => {
  it("accepts plain decimal integers across the whole 32-bit range", () => {
    expect(parseSeedParam("0")).toBe(0);
    expect(parseSeedParam("7")).toBe(7);
    expect(parseSeedParam("4294967295")).toBe(SEED_MAX);
  });

  it.each(["", " 7", "7 ", "1.5", "abc", "1e3", "1e30", "-1", "+1", "0x10", "4294967296", "0007x"])(
    "rejects %j",
    (raw) => {
      expect(parseSeedParam(raw)).toBeNull();
    },
  );

  it("rejects a digit run too long to be a seed before converting it", () => {
    expect(parseSeedParam("9".repeat(400))).toBeNull();
  });
});

describe("isAcceptedDailySeed", () => {
  const noon = new Date("2026-10-21T12:00:00.000Z");

  it("accepts today's UTC daily seed", () => {
    expect(isAcceptedDailySeed(dailySeed(noon), noon)).toBe(true);
  });

  it("rejects any other seed, including yesterday's once the grace window has passed", () => {
    expect(isAcceptedDailySeed(7, noon)).toBe(false);
    expect(isAcceptedDailySeed(dailySeedForDay("2026-10-20"), noon)).toBe(false);
    expect(isAcceptedDailySeed(dailySeedForDay("2026-10-22"), noon)).toBe(false);
  });

  it("accepts yesterday's seed just after midnight UTC, for a run that started before it", () => {
    const justAfter = new Date("2026-10-21T00:10:00.000Z");
    expect(isAcceptedDailySeed(dailySeedForDay("2026-10-20"), justAfter)).toBe(true);
    expect(isAcceptedDailySeed(dailySeedForDay("2026-10-19"), justAfter)).toBe(false);
  });

  it("closes the grace window at the run-length ceiling plus slack", () => {
    const midnight = Date.parse("2026-10-21T00:00:00.000Z");
    const yesterday = dailySeedForDay("2026-10-20");
    expect(isAcceptedDailySeed(yesterday, new Date(midnight + DAILY_GRACE_MS - 1))).toBe(true);
    expect(isAcceptedDailySeed(yesterday, new Date(midnight + DAILY_GRACE_MS))).toBe(false);
  });
});

describe("acceptedDailySeeds", () => {
  const today = dailySeedForDay("2026-10-21");
  const yesterday = dailySeedForDay("2026-10-20");

  it("is today's seed alone outside the grace window", () => {
    expect(acceptedDailySeeds(new Date("2026-10-21T12:00:00.000Z"))).toEqual([today]);
  });

  it("adds yesterday's seed, after today's, inside the grace window", () => {
    expect(acceptedDailySeeds(new Date("2026-10-21T00:10:00.000Z"))).toEqual([today, yesterday]);
  });

  it("agrees with isAcceptedDailySeed at the window's edges", () => {
    const midnight = Date.parse("2026-10-21T00:00:00.000Z");
    for (const offset of [0, DAILY_GRACE_MS - 1, DAILY_GRACE_MS, DAILY_GRACE_MS + 1]) {
      const now = new Date(midnight + offset);
      for (const seed of [today, yesterday, 7]) {
        expect(acceptedDailySeeds(now).includes(seed)).toBe(isAcceptedDailySeed(seed, now));
      }
    }
  });
});

describe("cap constants", () => {
  it("protects far fewer rows than the cap", () => {
    expect(PROTECTED_TOP_ROWS).toBe(100);
    expect(MAX_TOTAL_ROWS).toBe(20_000);
  });
});

describe("PG2_SCHEMA_STATEMENTS", () => {
  it("is idempotent DDL only, with no semicolons", () => {
    expect(PG2_SCHEMA_STATEMENTS.length).toBeGreaterThan(0);
    for (const statement of PG2_SCHEMA_STATEMENTS) {
      expect(statement).toMatch(/^\s*CREATE (TABLE|INDEX) IF NOT EXISTS /);
      expect(statement).not.toContain(";");
    }
  });

  it("is mirrored exactly (same statements, same order) by the pg2 section of db/init.sql", () => {
    const mirrored = initSqlStatements().filter((statement) => /pg2_leaderboard/.test(statement));
    expect(mirrored).toEqual(PG2_SCHEMA_STATEMENTS.map(collapse));
  });

  it("indexes the unfiltered top-N read by (time_ms, id) and keeps the per-seed index", () => {
    const joined = PG2_SCHEMA_STATEMENTS.map(collapse).join("\n");
    expect(joined).toContain(
      "idx_pg2_leaderboard_seed_time ON pg2_leaderboard_entries (seed, time_ms ASC)",
    );
    expect(joined).toContain(
      "idx_pg2_leaderboard_time_id ON pg2_leaderboard_entries (time_ms ASC, id ASC)",
    );
  });
});
