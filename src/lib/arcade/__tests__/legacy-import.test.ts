import { describe, it, expect } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { importLegacyLeaderboard } from "../legacy-import";

// Pinned as a literal on purpose: renaming the marker would re-run the import.
const KEY = "legacy-leaderboard-import-v1";
const at = (iso: string) => new Date(iso);

function legacyRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    game: "space-shooter",
    name: "Ada",
    score: 3000,
    level: 1,
    seconds: 60,
    kills: 40,
    distance: 1500,
    created_at: at("2026-03-01T10:00:00.000Z"),
    ...over,
  };
}

interface Script {
  applied?: boolean;
  present?: boolean;
  failOn?: RegExp;
}

/** Answers the import's statements by prefix: marker insert, table check, legacy read. */
function scripted(rows: Record<string, unknown>[], script: Script = {}) {
  return createFakePool((sql) => {
    if (script.failOn?.test(sql)) throw new Error("db down");
    if (sql.startsWith("INSERT INTO arcade_migrations")) {
      return { rows: script.applied ? [] : [{ key: KEY }] };
    }
    if (sql.startsWith("SELECT to_regclass"))
      return { rows: [{ present: script.present ?? true }] };
    if (sql.startsWith("SELECT id, game")) return { rows };
    return undefined;
  });
}

function ids() {
  let n = 0;
  return () => {
    n += 1;
    return `p${n}`;
  };
}

const head = (sql: string) => sql.split(" ").slice(0, 3).join(" ");

// Oldest first, as the SQL's ORDER BY returns them.
const ROWS = [
  legacyRow({ id: 1, name: "Ada", score: 3000, created_at: at("2026-03-01T10:00:00.000Z") }),
  legacyRow({ id: 2, name: "ada", score: 4200, created_at: at("2026-03-02T10:00:00.000Z") }),
  legacyRow({ id: 3, name: "Bob", score: 5000, created_at: at("2026-03-02T11:00:00.000Z") }),
  legacyRow({ id: 4, name: "Cy", score: 4200, created_at: at("2026-03-03T10:00:00.000Z") }),
  legacyRow({ id: 5, name: "cy", score: 4200, created_at: at("2026-03-04T10:00:00.000Z") }),
  legacyRow({
    id: 6,
    game: "hextris",
    name: "ADA",
    score: 20000,
    level: 17,
    seconds: 120,
    kills: 300,
    distance: null,
    created_at: at("2026-03-05T10:00:00.000Z"),
  }),
  legacyRow({ id: 7, name: "NoDetail", seconds: null, created_at: at("2026-03-06T10:00:00.000Z") }),
  legacyRow({
    id: 8,
    name: "Cheat",
    score: 1_000_000,
    seconds: 10,
    kills: 0,
    distance: 0,
    created_at: at("2026-03-07T10:00:00.000Z"),
  }),
  legacyRow({
    id: 9,
    game: "hextris",
    name: "Cheat2",
    score: 20000,
    level: 1,
    seconds: 120,
    kills: 2,
    distance: null,
    created_at: at("2026-03-08T10:00:00.000Z"),
  }),
  legacyRow({
    id: 10,
    game: "hextris",
    name: "Dee",
    score: 500,
    level: 2,
    seconds: 30,
    kills: null,
    distance: null,
    created_at: at("2026-03-09T10:00:00.000Z"),
  }),
];

const SS_DETAIL = '{"seconds":60,"kills":40,"distance":1500,"legacy":true}';
const HX_DETAIL = '{"seconds":120,"kills":300,"level":17,"legacy":true}';

describe("importLegacyLeaderboard: marker and table guard", () => {
  it("does nothing when the marker row already exists (the import runs once)", async () => {
    const fake = scripted(ROWS, { applied: true });
    await expect(importLegacyLeaderboard(fake.client, ids())).resolves.toEqual({
      status: "already-applied",
    });
    expect(fake.sqls()).toHaveLength(1);
    expect(fake.sqls()[0]).toBe(
      "INSERT INTO arcade_migrations (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key",
    );
    expect(fake.queries[0]?.params).toEqual([KEY]);
  });

  it("records the marker and imports nothing when the legacy table does not exist", async () => {
    const fake = scripted(ROWS, { present: false });
    await expect(importLegacyLeaderboard(fake.client, ids())).resolves.toEqual({
      status: "no-legacy-table",
    });
    expect(fake.sqls().map(head)).toEqual([
      "INSERT INTO arcade_migrations",
      "SELECT to_regclass('leaderboard_entries') IS",
    ]);
  });

  it("an empty legacy table still counts as an import (marker recorded, zero rows)", async () => {
    const fake = scripted([]);
    await expect(importLegacyLeaderboard(fake.client, ids())).resolves.toEqual({
      status: "imported",
      read: 0,
      skippedUnverifiable: 0,
      skippedImplausible: 0,
      players: 0,
      scores: 0,
    });
    expect(fake.sqls().map(head)).toEqual([
      "INSERT INTO arcade_migrations",
      "SELECT to_regclass('leaderboard_entries') IS",
      "SELECT id, game,",
    ]);
  });

  it("reads only the two arcade games, oldest first, so ties keep the earlier achiever", async () => {
    const fake = scripted([]);
    await importLegacyLeaderboard(fake.client, ids());
    const read = fake.queries[2];
    expect(read?.params).toEqual([["space-shooter", "hextris"]]);
    expect(read?.sql).toContain("FROM leaderboard_entries WHERE game = ANY($1::text[])");
    expect(read?.sql).toContain("ORDER BY created_at ASC, id ASC");
    expect(read?.sql).not.toContain("region");
  });
});

describe("importLegacyLeaderboard: what is imported", () => {
  it("keeps the best row per game and handle, one legacy player per handle, all-time rows only", async () => {
    const fake = scripted(ROWS);
    const report = await importLegacyLeaderboard(fake.client, ids());

    expect(report).toEqual({
      status: "imported",
      read: 10,
      skippedUnverifiable: 2,
      skippedImplausible: 2,
      players: 3,
      scores: 4,
    });

    const players = fake.queries.filter((q) => q.sql.startsWith("INSERT INTO arcade_players"));
    expect(players.map((q) => q.params)).toEqual([
      ["p1", "legacy", "ADA", "2026-03-02T10:00:00.000Z"],
      ["p2", "legacy", "Bob", "2026-03-02T11:00:00.000Z"],
      ["p3", "legacy", "Cy", "2026-03-03T10:00:00.000Z"],
    ]);

    const scores = fake.queries.filter((q) => q.sql.startsWith("INSERT INTO arcade_scores"));
    expect(scores.map((q) => q.params)).toEqual([
      ["hextris", "p1", 20000, HX_DETAIL, "2026-03-05T10:00:00.000Z"],
      ["space-shooter", "p2", 5000, SS_DETAIL, "2026-03-02T11:00:00.000Z"],
      ["space-shooter", "p1", 4200, SS_DETAIL, "2026-03-02T10:00:00.000Z"],
      ["space-shooter", "p3", 4200, SS_DETAIL, "2026-03-03T10:00:00.000Z"],
    ]);
    for (const q of scores) expect(q.sql).toContain("'all-time'");
  });

  it("inserts every player before any score, after the marker, the table check and the read", async () => {
    const fake = scripted(ROWS);
    await importLegacyLeaderboard(fake.client, ids());
    expect(fake.sqls().map(head)).toEqual([
      "INSERT INTO arcade_migrations",
      "SELECT to_regclass('leaderboard_entries') IS",
      "SELECT id, game,",
      "INSERT INTO arcade_players",
      "INSERT INTO arcade_players",
      "INSERT INTO arcade_players",
      "INSERT INTO arcade_scores",
      "INSERT INTO arcade_scores",
      "INSERT INTO arcade_scores",
      "INSERT INTO arcade_scores",
    ]);
  });

  it("an equal score keeps the earlier achiever (id 4 over id 5)", async () => {
    const fake = scripted(ROWS);
    await importLegacyLeaderboard(fake.client, ids());
    const cy = fake.queries.find(
      (q) => q.sql.startsWith("INSERT INTO arcade_scores") && q.params[1] === "p3",
    );
    expect(cy?.params[4]).toBe("2026-03-03T10:00:00.000Z");
  });

  it("stores the 'legacy' hash on every player and never a real digest", async () => {
    const fake = scripted(ROWS);
    await importLegacyLeaderboard(fake.client, ids());
    const players = fake.queries.filter((q) => q.sql.startsWith("INSERT INTO arcade_players"));
    expect(players.every((q) => q.params[1] === "legacy")).toBe(true);
  });

  it("sanitizes handles like the live route: bidi controls stripped, blank becomes Pilot, 12 characters", async () => {
    const fake = scripted([
      legacyRow({ id: 1, name: "‮Evil", score: 3000 }),
      legacyRow({ id: 2, name: "   ", score: 2000, created_at: at("2026-03-02T10:00:00.000Z") }),
      legacyRow({
        id: 3,
        name: "Averyveryverylongname",
        score: 1000,
        created_at: at("2026-03-03T10:00:00.000Z"),
      }),
    ]);
    await importLegacyLeaderboard(fake.client, ids());
    const handles = fake.queries
      .filter((q) => q.sql.startsWith("INSERT INTO arcade_players"))
      .map((q) => q.params[2]);
    expect(handles).toEqual(["Evil", "Pilot", "Averyveryver"]);
  });

  it("uses a random UUID per player by default", async () => {
    const fake = scripted([
      legacyRow({ id: 1, name: "Ada", score: 3000 }),
      legacyRow({ id: 2, name: "Bob", score: 2000, created_at: at("2026-03-02T10:00:00.000Z") }),
    ]);
    await importLegacyLeaderboard(fake.client);
    const playerIds = fake.queries
      .filter((q) => q.sql.startsWith("INSERT INTO arcade_players"))
      .map((q) => q.params[0]);
    expect(playerIds).toHaveLength(2);
    for (const id of playerIds) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(playerIds[0]).not.toBe(playerIds[1]);
  });

  it("interpolates no row value into SQL text", async () => {
    const fake = scripted([legacyRow({ name: "Bobby'; DROP TABLE arcade_scores;--" })]);
    await importLegacyLeaderboard(fake.client, ids());
    expect(fake.sqls().join(" ")).not.toContain("Bobby");
  });
});

describe("importLegacyLeaderboard: failures abort (the caller's transaction rolls back)", () => {
  it("a row that fails the pin throws instead of being skipped", async () => {
    const fake = scripted([legacyRow({ game: "tower-stacker" })]);
    await expect(importLegacyLeaderboard(fake.client, ids())).rejects.toThrow();
  });

  it("a database failure propagates", async () => {
    const fake = scripted(ROWS, { failOn: /^INSERT INTO arcade_scores/ });
    await expect(importLegacyLeaderboard(fake.client, ids())).rejects.toThrow("db down");
  });
});
