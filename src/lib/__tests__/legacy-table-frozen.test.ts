// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// leaderboard_entries is frozen history (DESIGN.md "Arcade backend"): no app code may
// write, delete from, alter or drop it. Tests are exempt (store.db.test.ts drops it in a
// throwaway CI container); the arcade legacy import only READS it.
const SRC = join(process.cwd(), "src");
const WRITE =
  /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE|ALTER\s+TABLE|DROP\s+TABLE(\s+IF\s+EXISTS)?|TRUNCATE)\s+leaderboard_entries\b/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the legacy leaderboard table is frozen", () => {
  it("no source file writes, deletes from, alters or drops leaderboard_entries", () => {
    const offenders = sources(SRC).filter((path) => WRITE.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => path.slice(SRC.length))).toEqual([]);
  });
});
