import path from "node:path";
import { env } from "@/env";

/**
 * Single root for all persisted data (P2-DATA-003). Prod mounts the
 * portfolio-data volume at <cwd>/.data, which is also the default, so DATA_DIR
 * normally stays unset; setting it relocates every persisted file at once
 * (tests point it at an OS temp dir per suite). DATA_DIR is the sanctioned
 * OPTIONAL exception to strict env validation -- it is a path override with a
 * safe default, not an integration credential (DESIGN.md register).
 *
 * Fixed filenames under the root: leaderboard.json,
 * password-game-leaderboard.json, leads.jsonl.
 */
export function resolveDataDir(): string {
  const configured = env.DATA_DIR;
  return configured && configured.length > 0 ? configured : path.join(process.cwd(), ".data");
}
