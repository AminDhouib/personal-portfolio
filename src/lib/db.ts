import { Pool } from "pg";
import { env } from "@/env";
import { captureException } from "@/lib/log";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // When Postgres drops an IDLE pooled client (db container restart, admin terminate),
    // pg re-emits the client's error on the pool. With no listener Node treats that as an
    // uncaught exception and the whole app dies (Sentry PORTFOLIO-9, "terminating
    // connection due to administrator command"). pg already evicts the broken client and
    // the next query opens a fresh one, so report it and carry on.
    pool.on("error", (err) => {
      captureException("db:pool", err);
    });
  }
  return pool;
}
