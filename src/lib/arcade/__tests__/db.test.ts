import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { ARCADE_SCHEMA_STATEMENTS } from "../schema";

// The module memoizes the ensure promise at module level, so every test gets a fresh copy.
const state = vi.hoisted(() => ({ pool: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => state.pool }));

async function loadFresh() {
  vi.resetModules();
  return import("../db");
}

beforeEach(() => {
  state.pool = undefined;
});

describe("getArcadePool", () => {
  it("runs the ensure-step once, returns the shared pool, and does not re-run on later calls", async () => {
    const fake = createFakePool();
    state.pool = fake.pool;
    const { getArcadePool } = await loadFresh();

    await expect(getArcadePool()).resolves.toBe(fake.pool);
    const afterFirst = fake.queries.length;
    expect(afterFirst).toBe(ARCADE_SCHEMA_STATEMENTS.length + 3); // BEGIN + lock + statements + COMMIT

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
