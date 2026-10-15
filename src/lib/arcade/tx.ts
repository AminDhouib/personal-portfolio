import type { Pool, PoolClient } from "pg";
import { captureException } from "@/lib/log";

/** The only pool capability a transaction needs: a dedicated pooled client. */
export type TxPool = Pick<Pool, "connect">;

/**
 * Run `fn` inside one transaction on one pooled client: BEGIN, `fn`, COMMIT. Any failure
 * (including a failed COMMIT) runs ROLLBACK and rethrows the original error. The client is
 * always released in `finally`; if the ROLLBACK itself fails the connection is suspect, so
 * it is released with `true` and the pool destroys it instead of reusing it.
 *
 * pg-pool drops its own idle-error listener while a client is checked out, and pg's Client
 * emits 'error' even with a query in flight, so a backend killed mid-transaction (Postgres
 * restart, "terminating connection due to administrator command") would otherwise be an
 * uncaught exception. The listener below keeps that from crashing the process; the client
 * is then destroyed on release. The event is reported even though an in-flight query also
 * rejects (and the route reports that): it can fire with no query pending, where nothing
 * else would surface it, and a duplicate for the same outage is cheaper than a silent one.
 */
export async function withTransaction<T>(
  pool: TxPool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  const onClientError = (err: Error) => {
    destroy = true;
    captureException("arcade:tx", err);
  };
  client.on("error", onClientError);
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // silent-ok: the original error is rethrown below; a failed ROLLBACK means the
      // connection is broken, so it is destroyed on release instead of reported twice.
      destroy = true;
    }
    throw err;
  } finally {
    client.removeListener("error", onClientError);
    client.release(destroy);
  }
}
