import { describe, it, expect } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { withTransaction } from "../tx";

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

  it("releases the client even when BEGIN fails", async () => {
    const fake = createFakePool((sql) => {
      if (sql === "BEGIN") throw new Error("no begin");
      return undefined;
    });
    await expect(withTransaction(fake.pool, async () => "x")).rejects.toThrow("no begin");
    expect(fake.stats.released).toBe(1);
  });
});
