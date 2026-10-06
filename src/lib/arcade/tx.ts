import type { Pool, PoolClient } from "pg";

/** The only pool capability a transaction needs: a dedicated pooled client. */
export type TxPool = Pick<Pool, "connect">;

/**
 * Run `fn` inside one transaction on one pooled client: BEGIN, `fn`, COMMIT. Any failure
 * (including a failed COMMIT) runs ROLLBACK and rethrows the original error. The client is
 * always released in `finally`; if the ROLLBACK itself fails the connection is suspect, so
 * it is released with `true` and the pool destroys it instead of reusing it.
 */
export async function withTransaction<T>(
  pool: TxPool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // silent-ok: the original error is rethrown below; a failed ROLLBACK means the connection is broken, so it is destroyed on release instead of reported twice
      destroy = true;
    }
    throw err;
  } finally {
    client.release(destroy);
  }
}
