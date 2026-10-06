import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { ARCADE_SCHEMA_LOCK_ID, ARCADE_SCHEMA_STATEMENTS, ensureArcadeSchema } from "../schema";

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

describe("ARCADE_SCHEMA_STATEMENTS", () => {
  it("is idempotent DDL only: every statement is CREATE ... IF NOT EXISTS", () => {
    expect(ARCADE_SCHEMA_STATEMENTS.length).toBeGreaterThan(0);
    for (const statement of ARCADE_SCHEMA_STATEMENTS) {
      expect(collapse(statement)).toMatch(
        /^CREATE (TABLE|INDEX) IF NOT EXISTS arcade_|^CREATE INDEX IF NOT EXISTS idx_arcade_/,
      );
    }
  });

  it("has no semicolons, because the init.sql mirror test splits on them and each statement runs as its own query", () => {
    for (const statement of ARCADE_SCHEMA_STATEMENTS) expect(statement).not.toContain(";");
  });

  it("is mirrored exactly (same statements, same order) by the arcade section of db/init.sql", () => {
    const mirrored = initSqlStatements().filter((statement) => /arcade_/.test(statement));
    expect(mirrored).toEqual(ARCADE_SCHEMA_STATEMENTS.map(collapse));
  });

  it("pins the shapes the store relies on", () => {
    const joined = ARCADE_SCHEMA_STATEMENTS.map(collapse).join("\n");
    // collapse() turns "(\n    id" into "( id", so the pinned text keeps the space after the paren.
    expect(joined).toContain(
      "arcade_players ( id UUID PRIMARY KEY, token_hash TEXT NOT NULL, handle TEXT NOT NULL,",
    );
    expect(joined).toContain("PRIMARY KEY (game, board, player_id)");
    expect(joined).toContain("REFERENCES arcade_players (id) ON DELETE CASCADE");
    expect(joined).toContain("score BIGINT NOT NULL");
    expect(joined).toContain("ON arcade_scores (game, board, score DESC, achieved_at ASC)");
    expect(joined).toContain(
      "arcade_migrations ( key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now() )",
    );
  });
});

describe("ensureArcadeSchema", () => {
  it("takes the advisory lock, runs every statement, then the legacy-import marker, all in one transaction", async () => {
    const fake = createFakePool();
    await ensureArcadeSchema(fake.pool);
    expect(fake.sqls()).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock($1)",
      ...ARCADE_SCHEMA_STATEMENTS.map(collapse),
      expect.stringMatching(/^INSERT INTO arcade_migrations/),
      "COMMIT",
    ]);
    expect(fake.queries[1]?.params).toEqual([ARCADE_SCHEMA_LOCK_ID]);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 0 });
  });

  it("uses a lock id that is a safe integer (it is sent as a bigint parameter)", () => {
    expect(Number.isSafeInteger(ARCADE_SCHEMA_LOCK_ID)).toBe(true);
    expect(ARCADE_SCHEMA_LOCK_ID).toBeGreaterThan(0);
  });

  it("rolls back, releases and rethrows when a statement fails", async () => {
    const fake = createFakePool((sql) => {
      if (sql.startsWith("CREATE INDEX")) throw new Error("index failed");
      return undefined;
    });
    await expect(ensureArcadeSchema(fake.pool)).rejects.toThrow("index failed");
    expect(fake.sqls().at(-1)).toBe("ROLLBACK");
    expect(fake.sqls()).not.toContain("COMMIT");
    expect(fake.stats.released).toBe(1);
  });
});

describe("ensureArcadeSchema: legacy import step", () => {
  function importFake(over: { present?: boolean; failOn?: RegExp } = {}) {
    return createFakePool((sql) => {
      if (over.failOn?.test(sql)) throw new Error("legacy read failed");
      if (sql.startsWith("INSERT INTO arcade_migrations")) {
        return { rows: [{ key: "legacy-leaderboard-import-v1" }] };
      }
      if (sql.startsWith("SELECT to_regclass")) {
        return { rows: [{ present: over.present ?? true }] };
      }
      if (sql.startsWith("SELECT id, game")) return { rows: [] };
      return undefined;
    });
  }

  const head = (sql: string) => sql.split(" ").slice(0, 3).join(" ");

  it("reports already-applied when the marker insert returns no row", async () => {
    const fake = createFakePool();
    await expect(ensureArcadeSchema(fake.pool)).resolves.toEqual({ status: "already-applied" });
  });

  it("runs the import after the DDL and before COMMIT, on the same client and transaction", async () => {
    const fake = importFake();
    await expect(ensureArcadeSchema(fake.pool)).resolves.toEqual({
      status: "imported",
      read: 0,
      skippedUnverifiable: 0,
      skippedImplausible: 0,
      players: 0,
      scores: 0,
    });
    const afterDdl = fake.sqls().slice(2 + ARCADE_SCHEMA_STATEMENTS.length);
    expect(afterDdl.map(head)).toEqual([
      "INSERT INTO arcade_migrations",
      "SELECT to_regclass('leaderboard_entries') IS",
      "SELECT id, game,",
      "COMMIT",
    ]);
    expect(fake.stats.connects).toBe(1);
  });

  it("reports no-legacy-table and still commits the marker when the table is missing", async () => {
    const fake = importFake({ present: false });
    await expect(ensureArcadeSchema(fake.pool)).resolves.toEqual({ status: "no-legacy-table" });
    expect(fake.sqls().at(-1)).toBe("COMMIT");
  });

  it("rolls the whole ensure back, marker included, when the import fails", async () => {
    const fake = importFake({ failOn: /^SELECT id, game/ });
    await expect(ensureArcadeSchema(fake.pool)).rejects.toThrow("legacy read failed");
    expect(fake.sqls().at(-1)).toBe("ROLLBACK");
    expect(fake.sqls()).not.toContain("COMMIT");
    expect(fake.stats.released).toBe(1);
  });
});
