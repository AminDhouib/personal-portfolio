import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakePool } from "@/test/fake-pg";

vi.mock("@/lib/log", () => ({ captureException: vi.fn() }));

import { captureException } from "@/lib/log";
import { withTransaction } from "../tx";

beforeEach(() => {
  vi.mocked(captureException).mockClear();
});

describe("withTransaction", () => {
  it("wraps the callback in BEGIN and COMMIT on one client, returns its result and releases once", async () => {
    const fake = createFakePool();
    const result = await withTransaction(fake.pool, async (client) => {
      expect(client).toBe(fake.client);
      await client.query("SELECT 1");
      return "done";
    });
    expect(result).toBe("done");
    expect(fake.sqls()).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 0 });
  });

  it("rolls back, rethrows the original error and releases when the callback fails", async () => {
    const fake = createFakePool();
    await expect(
      withTransaction(fake.pool, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fake.sqls()).toEqual(["BEGIN", "ROLLBACK"]);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 0 });
  });

  it("rolls back when COMMIT itself fails", async () => {
    const fake = createFakePool((sql) => {
      if (sql === "COMMIT") throw new Error("commit failed");
      return undefined;
    });
    await expect(withTransaction(fake.pool, async () => "x")).rejects.toThrow("commit failed");
    expect(fake.sqls()).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(fake.stats.released).toBe(1);
  });

  it("destroys the client when ROLLBACK fails, and still surfaces the original error", async () => {
    const fake = createFakePool((sql) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
      return undefined;
    });
    await expect(
      withTransaction(fake.pool, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 1 });
  });

  it("keeps a client 'error' event from crashing the process, reports it and destroys the client", async () => {
    // pg-pool drops its idle-error listener on checkout, so a backend killed mid-transaction
    // (Postgres restart, PORTFOLIO-9) emits 'error' on the client with nothing listening.
    const fake = createFakePool();
    const dropped = new Error("terminating connection due to administrator command");
    await expect(
      withTransaction(fake.pool, async (client) => {
        expect(() => client.emit("error", dropped)).not.toThrow();
        throw dropped;
      }),
    ).rejects.toBe(dropped);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith("arcade:tx", dropped);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 1 });
  });

  it("holds exactly one 'error' listener while the client is checked out and none after release", async () => {
    const fake = createFakePool();
    expect(fake.client.listenerCount("error")).toBe(0);
    await withTransaction(fake.pool, async (client) => {
      expect(client.listenerCount("error")).toBe(1);
    });
    expect(fake.client.listenerCount("error")).toBe(0);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 0 });
    expect(captureException).not.toHaveBeenCalled();

    await expect(
      withTransaction(fake.pool, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(fake.client.listenerCount("error")).toBe(0);
  });

  it("releases the client even when BEGIN fails", async () => {
    const fake = createFakePool((sql) => {
      if (sql === "BEGIN") throw new Error("no begin");
      return undefined;
    });
    await expect(withTransaction(fake.pool, async () => "x")).rejects.toThrow("no begin");
    expect(fake.stats.released).toBe(1);
  });
});
