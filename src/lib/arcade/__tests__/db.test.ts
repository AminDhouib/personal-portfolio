import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { ARCADE_SCHEMA_STATEMENTS } from "../schema";

// The module memoizes the ensure promise at module level, so every test gets a fresh copy.
const state = vi.hoisted(() => ({ pool: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => state.pool }));
const log = vi.hoisted(() => ({ logWarn: vi.fn() }));
vi.mock("@/lib/log", () => log);

async function loadFresh() {
  vi.resetModules();
  return import("../db");
}

beforeEach(() => {
  state.pool = undefined;
  log.logWarn.mockClear();
});

describe("getArcadePool", () => {
  it("runs the ensure-step once, returns the shared pool, and does not re-run on later calls", async () => {
    const fake = createFakePool();
    state.pool = fake.pool;
    const { getArcadePool } = await loadFresh();

    await expect(getArcadePool()).resolves.toBe(fake.pool);
    const afterFirst = fake.queries.length;
    // BEGIN + lock + statements + the legacy-import marker insert + COMMIT
    expect(afterFirst).toBe(ARCADE_SCHEMA_STATEMENTS.length + 4);

    await expect(getArcadePool()).resolves.toBe(fake.pool);
    expect(fake.queries.length).toBe(afterFirst);
    expect(fake.stats.connects).toBe(1);
  });

  it("concurrent first calls share a single ensure-step", async () => {
    const fake = createFakePool();
    state.pool = fake.pool;
    const { getArcadePool } = await loadFresh();

    await Promise.all([getArcadePool(), getArcadePool(), getArcadePool()]);
    expect(fake.stats.connects).toBe(1);
  });

  it("a failed ensure rejects every waiter and the next call retries instead of caching the failure", async () => {
    let failures = 1;
    const fake = createFakePool((sql) => {
      if (sql.startsWith("SELECT pg_advisory_xact_lock") && failures > 0) {
        failures -= 1;
        throw new Error("db not ready");
      }
      return undefined;
    });
    state.pool = fake.pool;
    const { getArcadePool } = await loadFresh();

    await expect(getArcadePool()).rejects.toThrow("db not ready");
    await expect(getArcadePool()).resolves.toBe(fake.pool);
    expect(fake.stats.connects).toBe(2);
    expect(fake.sqls().filter((sql) => sql === "COMMIT")).toHaveLength(1);
    expect(fake.sqls().filter((sql) => sql === "ROLLBACK")).toHaveLength(1);
  });
});

describe("getArcadePool: legacy import log line", () => {
  function importFake(present: boolean) {
    return createFakePool((sql) => {
      if (sql.startsWith("INSERT INTO arcade_migrations")) {
        return { rows: [{ key: "legacy-leaderboard-import-v1" }] };
      }
      if (sql.startsWith("SELECT to_regclass")) return { rows: [{ present }] };
      if (sql.startsWith("SELECT id, game")) return { rows: [] };
      return undefined;
    });
  }

  it("logs one line with the counts when the import ran, and not again on later calls", async () => {
    state.pool = importFake(true).pool;
    const { getArcadePool } = await loadFresh();
    await getArcadePool();
    await getArcadePool();
    expect(log.logWarn).toHaveBeenCalledTimes(1);
    expect(log.logWarn).toHaveBeenCalledWith(
      "arcade:legacy-import",
      "imported 0 scores for 0 players (read 0: 0 superseded, 0 unverifiable, 0 implausible)",
    );
  });

  it("logs the no-legacy-table case", async () => {
    state.pool = importFake(false).pool;
    const { getArcadePool } = await loadFresh();
    await getArcadePool();
    expect(log.logWarn).toHaveBeenCalledTimes(1);
    expect(log.logWarn).toHaveBeenCalledWith(
      "arcade:legacy-import",
      "no leaderboard_entries table: recorded the import as done with nothing to import",
    );
  });

  it("logs nothing when the import was already applied (the normal start)", async () => {
    state.pool = createFakePool().pool;
    const { getArcadePool } = await loadFresh();
    await getArcadePool();
    expect(log.logWarn).not.toHaveBeenCalled();
  });
});
