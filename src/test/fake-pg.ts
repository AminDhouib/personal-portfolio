import { vi } from "vitest";
import type { Pool, PoolClient } from "pg";

type FakeResult = { rows: Record<string, unknown>[]; rowCount?: number };
type FakeHandler = (
  sql: string,
  params: unknown[],
) => FakeResult | undefined | Promise<FakeResult | undefined>;

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/**
 * An in-memory stand-in for a pg Pool and its pooled client, for tests that must never
 * touch a real database (AGENTS.md hard boundary). Every query, on the pool or on the
 * client, is logged with whitespace-normalized SQL and its parameters, then passed to
 * `handler`, which returns the result rows (or undefined for "no rows") or throws to
 * simulate a database failure. Release calls are counted; a truthy release argument
 * (pg's "destroy this client") is counted separately.
 */
export function createFakePool(handler: FakeHandler = () => undefined) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const stats = { connects: 0, released: 0, destroyed: 0 };

  async function run(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    const sql = normalizeSql(text);
    const values = params ?? [];
    queries.push({ sql, params: values });
    const result = await handler(sql, values);
    const rows = result?.rows ?? [];
    return { rows, rowCount: result?.rowCount ?? rows.length };
  }

  const client = {
    query: vi.fn(run),
    release: vi.fn((arg?: boolean | Error) => {
      stats.released += 1;
      if (arg) stats.destroyed += 1;
    }),
  };
  const pool = {
    connect: vi.fn(async () => {
      stats.connects += 1;
      return client;
    }),
    query: vi.fn(run),
  };

  return {
    pool: pool as unknown as Pool,
    client: client as unknown as PoolClient,
    queries,
    stats,
    sqls: () => queries.map((q) => q.sql),
  };
}
