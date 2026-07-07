import { promises as fs } from "node:fs";
import path from "node:path";
import { captureException, logWarn } from "@/lib/log";
import { safeJsonParseServer } from "@/lib/safe-json-server";

/**
 * Thrown by `readForUpdate` when the persisted file exists but cannot be
 * trusted as a base for a write (corrupt JSON, or valid JSON that isn't the
 * expected array shape). The caller (a route's write-lock body) must abort
 * the write rather than overwrite real data with a near-empty replacement
 * (PM-004). Never thrown by the lenient `readAll` (GET), which stays
 * non-mutating and renders an empty board instead.
 */
export class LeaderboardCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaderboardCorruptError";
  }
}

export interface LeaderboardConfig<T> {
  dataDir?: string;
  fileName: string;
  maxEntries: number;
  returnLimit: number;
  nameMax: number;
  defaultName: string;
  isEntry: (x: unknown) => x is T;
}

export function createLeaderboardStore<T>(config: LeaderboardConfig<T>) {
  const dataDir = config.dataDir ?? path.join(process.cwd(), ".data");
  const filePath = path.join(dataDir, config.fileName);

  let tmpCounter = 0;
  function nextTmp(): number {
    tmpCounter = (tmpCounter + 1) % 1_000_000;
    return tmpCounter;
  }

  let writeChain: Promise<unknown> = Promise.resolve();
  function withWriteLock<R>(fn: () => Promise<R>): Promise<R> {
    const next = writeChain.then(fn, fn);
    writeChain = next.catch(() => undefined);
    return next;
  }

  /** Shared by readAll/readForUpdate: filters rows, reporting a dropped count loudly. */
  function filterValidRows(parsed: unknown[]): T[] {
    const valid = parsed.filter(config.isEntry);
    if (valid.length !== parsed.length) {
      captureException(
        "leaderboard.row-drop",
        new Error(`dropped ${parsed.length - valid.length} invalid row(s) from ${filePath}`),
      );
    }
    return valid;
  }

  async function readAll(): Promise<T[]> {
    try {
      const buf = await fs.readFile(filePath, "utf-8");
      const parsed = safeJsonParseServer(buf, "leaderboard");
      if (!Array.isArray(parsed)) return [];
      return filterValidRows(parsed);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      captureException("leaderboard", e);
      return [];
    }
  }

  /**
   * Strict read for the write path ONLY. Unlike `readAll` (lenient, GET),
   * this never lets an unreadable/corrupt file seed a whole-file overwrite:
   * a genuinely absent file is an empty base (first-ever write), but a
   * present-and-unreadable one is quarantined and reported instead of
   * silently treated as empty (PM-004 / IN-007). See docs/backup-and-
   * restore.md for the operational story; do not merge this back into
   * `readAll` -- that would make GET 500 the public board on a bad file.
   */
  async function readForUpdate(): Promise<T[]> {
    let buf: string;
    try {
      buf = await fs.readFile(filePath, "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      captureException("leaderboard", e);
      throw e;
    }

    const parsed = safeJsonParseServer(buf, "leaderboard");
    if (!Array.isArray(parsed)) {
      const corruptPath = `${filePath}.corrupt-${nextTmp()}`;
      try {
        await fs.rename(filePath, corruptPath);
        logWarn("leaderboard", `corrupt file quarantined to ${corruptPath}`);
      } catch (renameErr) {
        // Best-effort: whether or not the rename itself succeeds, the read
        // still cannot seed a write -- LeaderboardCorruptError is thrown
        // below regardless, so a quarantine failure only means the corrupt
        // bytes are not sidecar-preserved, not that the write proceeds.
        logWarn("leaderboard", `failed to quarantine corrupt file at ${filePath}`, renameErr);
      }
      throw new LeaderboardCorruptError(`corrupt leaderboard file at ${filePath}`);
    }

    return filterValidRows(parsed);
  }

  async function writeAll(entries: T[]): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${nextTmp()}`;
    try {
      await fs.writeFile(tmp, JSON.stringify(entries), "utf-8");
      await fs.rename(tmp, filePath);
    } catch (err) {
      captureException("leaderboard.write", err);
      try {
        await fs.unlink(tmp);
      } catch {
        // silent-ok: best-effort cleanup of the temp file; the original
        // write/rename error is rethrown below and is the one that matters.
      }
      throw err;
    }
  }

  function sanitizeName(raw: unknown): string {
    if (typeof raw !== "string") return config.defaultName;
    const cleaned = raw
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, config.nameMax);
    return cleaned.length > 0 ? cleaned : config.defaultName;
  }

  return {
    readAll,
    readForUpdate,
    writeAll,
    withWriteLock,
    sanitizeName,
    returnLimit: config.returnLimit,
    maxEntries: config.maxEntries,
  };
}
