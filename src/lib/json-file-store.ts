import { promises as fs } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { captureException, logWarn } from "@/lib/log";
import { resolveDataDir } from "@/lib/data-dir";
import { safeJsonParseServer } from "@/lib/safe-json-server";

/**
 * Durability primitive for a single versioned JSON document under DATA_DIR
 * (successor to the v1 array-based leaderboard-store; audit P2-DATA-001).
 * The store owns exactly four concerns: atomic writes (tmp + rename),
 * corrupt-file quarantine, schema-version reset, and write serialization.
 * Shape/trim/rank logic lives in the routes; name sanitizing lives in
 * player-name.ts.
 *
 * On-disk contract: the whole file is one JSON object carrying a literal
 * schemaVersion, validated by `fileSchema`. Three read outcomes:
 *   - parseable + right version + valid shape -> the file
 *   - parseable object with a DIFFERENT schemaVersion -> archive-then-reset:
 *     the file is renamed to <file>.schema-mismatch-N (the archive), the
 *     event is reported loudly, and an empty file takes its place. This is
 *     the owner-approved break+reset migration path (RUNBOOK "Schema
 *     reset") -- old data is never migrated in code and never silently
 *     destroyed.
 *   - unparseable, or right version but invalid shape (external tampering /
 *     partial write) -> the write path quarantines to <file>.corrupt-N and
 *     THROWS so a whole-file overwrite can never be seeded by garbage
 *     (pass-1 PM-004 invariant, preserved). The read path stays lenient and
 *     serves the empty file instead -- GET must not 500 the public board.
 *
 * Rows are validated strictly as part of the file shape: routes are the only
 * writers, so an invalid row on disk is tampering or code drift, and the
 * quarantine path reports it rather than silently dropping rows.
 */
export class JsonFileCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonFileCorruptError";
  }
}

export interface JsonFileStoreConfig<TFile extends { schemaVersion: number }> {
  /** File name under DATA_DIR, e.g. "leaderboard.json". */
  fileName: string;
  /** The version this build reads/writes; must match fileSchema's literal. */
  schemaVersion: number;
  fileSchema: z.ZodType<TFile>;
  emptyFile: () => TFile;
  /** Sentry scope prefix, e.g. "leaderboard" -> "leaderboard.read". */
  scope: string;
}

export function createJsonFileStore<TFile extends { schemaVersion: number }>(
  config: JsonFileStoreConfig<TFile>,
) {
  const filePath = () => path.join(resolveDataDir(), config.fileName);

  let sidecarCounter = 0;
  function nextSidecar(): number {
    sidecarCounter = (sidecarCounter + 1) % 1_000_000;
    return sidecarCounter;
  }

  let writeChain: Promise<unknown> = Promise.resolve();
  function withWriteLock<R>(fn: () => Promise<R>): Promise<R> {
    const next = writeChain.then(fn, fn);
    writeChain = next.catch(() => undefined);
    return next;
  }

  type Classified =
    | { kind: "missing" }
    | { kind: "valid"; file: TFile }
    | { kind: "version-mismatch"; foundVersion: unknown }
    | { kind: "corrupt"; reason: string };

  async function classify(): Promise<Classified> {
    let buf: string;
    try {
      buf = await fs.readFile(filePath(), "utf-8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
      throw e;
    }
    const parsed = safeJsonParseServer(buf, config.scope);
    if (parsed === null || typeof parsed !== "object") {
      return { kind: "corrupt", reason: "not a JSON object" };
    }
    const version = (parsed as Record<string, unknown>).schemaVersion;
    if (version !== config.schemaVersion) {
      return { kind: "version-mismatch", foundVersion: version };
    }
    const result = config.fileSchema.safeParse(parsed);
    if (!result.success) {
      return { kind: "corrupt", reason: "schemaVersion matches but shape is invalid" };
    }
    return { kind: "valid", file: result.data };
  }

  async function archiveTo(suffix: string): Promise<void> {
    const target = `${filePath()}.${suffix}-${nextSidecar()}`;
    try {
      await fs.rename(filePath(), target);
      logWarn(config.scope, `archived ${filePath()} to ${target}`);
    } catch (renameErr) {
      // Best-effort: the caller decides whether to throw or reset regardless;
      // a failed rename only means the old bytes are not sidecar-preserved.
      logWarn(config.scope, `failed to archive ${filePath()}`, renameErr);
    }
  }

  /** Lenient read for GET paths: never throws, never mutates. */
  async function readFile(): Promise<TFile> {
    let c: Classified;
    try {
      c = await classify();
    } catch (e) {
      captureException(`${config.scope}.read`, e);
      return config.emptyFile();
    }
    switch (c.kind) {
      case "valid":
        return c.file;
      case "missing":
        return config.emptyFile();
      case "version-mismatch":
        // The next write archives + resets; a read just serves empty.
        logWarn(config.scope, `schemaVersion ${String(c.foundVersion)} on disk, ignoring for read`);
        return config.emptyFile();
      case "corrupt":
        captureException(
          `${config.scope}.read`,
          new Error(`corrupt ${config.fileName}: ${c.reason}`),
        );
        return config.emptyFile();
    }
  }

  /**
   * Strict read for the write path ONLY (call inside withWriteLock). Corrupt
   * content quarantines and throws; a version mismatch archives the old file
   * and returns a fresh empty one (break+reset); only a genuinely absent
   * file silently starts empty.
   */
  async function readFileForUpdate(): Promise<TFile> {
    let c: Classified;
    try {
      c = await classify();
    } catch (e) {
      captureException(config.scope, e);
      throw e;
    }
    switch (c.kind) {
      case "valid":
        return c.file;
      case "missing":
        return config.emptyFile();
      case "version-mismatch":
        captureException(
          `${config.scope}.schema-reset`,
          new Error(
            `${config.fileName} carried schemaVersion ${String(c.foundVersion)}, expected ${config.schemaVersion}; archived and reset`,
          ),
        );
        await archiveTo("schema-mismatch");
        return config.emptyFile();
      case "corrupt":
        await archiveTo("corrupt");
        throw new JsonFileCorruptError(`corrupt ${config.fileName}: ${c.reason}`);
    }
  }

  async function writeFile(file: TFile): Promise<void> {
    await fs.mkdir(resolveDataDir(), { recursive: true });
    const tmp = `${filePath()}.tmp-${process.pid}-${nextSidecar()}`;
    try {
      await fs.writeFile(tmp, JSON.stringify(file), "utf-8");
      await fs.rename(tmp, filePath());
    } catch (err) {
      captureException(`${config.scope}.write`, err);
      try {
        await fs.unlink(tmp);
      } catch {
        // silent-ok: best-effort cleanup of the temp file; the original
        // write/rename error is rethrown below and is the one that matters.
      }
      throw err;
    }
  }

  return { readFile, readFileForUpdate, writeFile, withWriteLock };
}
