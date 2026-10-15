import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Sentry PORTFOLIO-9: Postgres terminating an idle pooled client makes the pg Pool re-emit
// the client's error on itself. With no 'error' listener Node treats that as an uncaught
// exception and the process dies. pg is mocked with a bare EventEmitter standing in for Pool,
// so no real database is touched.
const pg = vi.hoisted(() => ({ instances: [] as unknown[] }));
vi.mock("pg", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class Pool extends Emitter {
    constructor(public options: unknown) {
      super();
      pg.instances.push(this);
    }
  }
  return { Pool };
});
vi.mock("@/env", () => ({ env: { DATABASE_URL: "postgres://user:pw@localhost:5432/test" } }));
const log = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@/lib/log", () => log);

async function loadFresh() {
  vi.resetModules();
  return import("../db");
}

beforeEach(() => {
  pg.instances.length = 0;
  log.captureException.mockClear();
});

describe("getPool", () => {
  it("memoizes a single pool", async () => {
    const { getPool } = await loadFresh();
    expect(getPool()).toBe(getPool());
    expect(pg.instances).toHaveLength(1);
  });

  it("registers an 'error' listener on the pool it creates", async () => {
    const { getPool } = await loadFresh();
    const pool = getPool() as unknown as EventEmitter;
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("logs a pool 'error' event through captureException and does not throw", async () => {
    const { getPool } = await loadFresh();
    const pool = getPool() as unknown as EventEmitter;
    const err = new Error("terminating connection due to administrator command");

    expect(() => pool.emit("error", err)).not.toThrow();
    expect(log.captureException).toHaveBeenCalledOnce();
    expect(log.captureException).toHaveBeenCalledWith("db:pool", err);
  });

  it("survives repeated 'error' events (every idle client dropped at once)", async () => {
    const { getPool } = await loadFresh();
    const pool = getPool() as unknown as EventEmitter;

    expect(() => {
      for (let i = 0; i < 5; i++) pool.emit("error", new Error(`idle client ${i} dropped`));
    }).not.toThrow();
    expect(log.captureException).toHaveBeenCalledTimes(5);
  });
});
