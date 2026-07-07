#!/usr/bin/env node
/**
 * Dependency-free JSONL/JSON row validator for the persisted leaderboard +
 * leads files (audit/plans/P1.md section 2d / QUALITY-GATES.md section 6.3).
 * This is the restore drill's assertion tool: point it at a directory (the
 * real .data, or a scratch dir holding a downloaded backup artifact) and it
 * reports per-file valid/invalid row counts, exiting non-zero if a file is
 * unreadable or has zero valid rows.
 *
 * No zod import here -- the row shapes are mirrored structurally from
 * src/lib/persistence-schemas.ts (pointer, not an import), exactly as
 * check-env-drift.mjs mirrors src/env.ts instead of importing it. Keeping
 * this script free of app dependencies means it can run standalone against
 * a downloaded artifact without a full pnpm install.
 *
 * Usage: node scripts/validate-data-files.mjs <directory>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Mirrors leadRecordSchema: name/email/note/source/timestamp, all strings. */
export function isValidLeadRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.email === "string" &&
    typeof row.note === "string" &&
    typeof row.source === "string" &&
    typeof row.timestamp === "string"
  );
}

/** Mirrors leaderboardEntrySchema: name/score/level/createdAt required, rest optional. */
export function isValidLeaderboardRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.score === "number" &&
    typeof row.level === "number" &&
    typeof row.createdAt === "string"
  );
}

/** Mirrors pgLeaderboardEntrySchema: name/seed/time/rules/createdAt required. */
export function isValidPgLeaderboardRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.seed === "number" &&
    typeof row.time === "number" &&
    typeof row.rules === "number" &&
    typeof row.createdAt === "string"
  );
}

/**
 * Validates a JSONL file (one JSON value per line; blank lines skipped).
 * `invalidAt` holds 1-based line numbers of rows that failed to parse or
 * failed `isValidRow`.
 */
export function validateJsonl(text, isValidRow) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let valid = 0;
  const invalidAt = [];
  lines.forEach((line, i) => {
    try {
      const row = JSON.parse(line);
      if (isValidRow(row)) valid += 1;
      else invalidAt.push(i + 1);
    } catch {
      invalidAt.push(i + 1);
    }
  });
  return { total: lines.length, valid, invalidAt };
}

/**
 * Validates a JSON file holding a top-level array of rows. `invalidAt` holds
 * 1-based array indices (not line numbers -- the file is compact JSON, not
 * one-row-per-line) of rows that failed `isValidRow`. `parseError` is true
 * when the file isn't valid JSON or isn't an array at all.
 */
export function validateJsonArray(text, isValidRow) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  if (!Array.isArray(parsed)) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  let valid = 0;
  const invalidAt = [];
  parsed.forEach((row, i) => {
    if (isValidRow(row)) valid += 1;
    else invalidAt.push(i + 1);
  });
  return { total: parsed.length, valid, invalidAt, parseError: false };
}

const FILES = [
  { name: "leads.jsonl", kind: "jsonl", isValidRow: isValidLeadRow },
  { name: "leaderboard.json", kind: "array", isValidRow: isValidLeaderboardRow },
  { name: "password-game-leaderboard.json", kind: "array", isValidRow: isValidPgLeaderboardRow },
];

/**
 * Validates all three known persistence files under `dir`. Never throws for
 * a missing/unreadable file -- that is reported as `readable: false` in its
 * report row, not an exception, so one bad file doesn't abort the others.
 */
export function validateDataDir(dir) {
  return FILES.map((f) => {
    const filePath = path.join(dir, f.name);
    let text;
    try {
      text = readFileSync(filePath, "utf-8");
    } catch (err) {
      return {
        file: f.name,
        readable: false,
        error: String(err),
        total: 0,
        valid: 0,
        invalidAt: [],
      };
    }
    const result =
      f.kind === "jsonl"
        ? validateJsonl(text, f.isValidRow)
        : validateJsonArray(text, f.isValidRow);
    return { file: f.name, readable: true, ...result };
  });
}

function runCli(dir) {
  const report = validateDataDir(dir);
  let ok = true;
  for (const r of report) {
    if (!r.readable) {
      console.error(`UNREADABLE: ${r.file}: ${r.error}`);
      ok = false;
      continue;
    }
    if (r.parseError) {
      console.error(`MALFORMED: ${r.file} is not valid JSON / not the expected shape`);
      ok = false;
      continue;
    }
    console.log(`${r.file}: ${r.valid}/${r.total} valid rows`);
    if (r.invalidAt.length > 0) {
      console.error(`  invalid row(s) at: ${r.invalidAt.join(", ")}`);
    }
    if (r.valid === 0) {
      console.error(`ZERO valid rows in ${r.file}`);
      ok = false;
    }
  }
  if (!ok) process.exitCode = 1;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/validate-data-files.mjs <directory>");
    process.exitCode = 1;
  } else {
    runCli(dir);
  }
}
