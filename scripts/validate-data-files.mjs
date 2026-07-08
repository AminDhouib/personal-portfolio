#!/usr/bin/env node
/**
 * Dependency-free validator for the persisted data files (schema v2, pass-2
 * audit). This is the restore drill's assertion tool: point it at a directory
 * (the real .data, or a scratch dir holding a downloaded backup artifact) and
 * it reports per-file shape validity, exiting non-zero if a file is
 * unreadable, malformed, carries the wrong schemaVersion, or contains
 * invalid rows. ZERO rows is valid -- a freshly reset file is empty by
 * design (RUNBOOK "Schema reset").
 *
 * No zod import here -- the shapes are mirrored structurally from
 * src/lib/persistence-schemas.ts (pointer, not an import), exactly as
 * check-env-drift.mjs mirrors src/env.ts. The zod<->mirror drift risk is
 * covered by src/lib/__tests__/persistence-validator-parity.test.ts, which
 * feeds the same fixtures through both and asserts identical verdicts.
 *
 * Usage: node scripts/validate-data-files.mjs <directory>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA_VERSION = 1;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIsoDateTime(x) {
  return typeof x === "string" && ISO_RE.test(x) && !Number.isNaN(Date.parse(x));
}

function optionalNumber(x) {
  return x === undefined || typeof x === "number";
}

function optionalString(x) {
  return x === undefined || typeof x === "string";
}

/** Mirrors leadRecordSchema (v2): versioned line with id/page/createdAt. */
export function isValidLeadRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    row.schemaVersion === SCHEMA_VERSION &&
    typeof row.id === "string" &&
    UUID_RE.test(row.id) &&
    typeof row.name === "string" &&
    typeof row.email === "string" &&
    typeof row.note === "string" &&
    typeof row.source === "string" &&
    typeof row.page === "string" &&
    isIsoDateTime(row.createdAt)
  );
}

/** Mirrors gameLeaderboardRowSchema (v2): no game field on the row. */
export function isValidLeaderboardRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.score === "number" &&
    typeof row.level === "number" &&
    optionalNumber(row.seconds) &&
    optionalNumber(row.kills) &&
    optionalNumber(row.distance) &&
    optionalString(row.region) &&
    isIsoDateTime(row.createdAt)
  );
}

/** Mirrors gameLeaderboardFileSchema (v2): versioned boards envelope. */
export function validateLeaderboardFile(parsed) {
  if (
    !parsed ||
    typeof parsed === "string" ||
    Array.isArray(parsed) ||
    typeof parsed !== "object"
  ) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true, wrongVersion: true };
  }
  if (!parsed.boards || typeof parsed.boards !== "object" || Array.isArray(parsed.boards)) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  let total = 0;
  let valid = 0;
  const invalidAt = [];
  for (const [game, rows] of Object.entries(parsed.boards)) {
    if (!Array.isArray(rows)) {
      invalidAt.push(`${game}(not an array)`);
      continue;
    }
    rows.forEach((row, i) => {
      total += 1;
      if (isValidLeaderboardRow(row)) valid += 1;
      else invalidAt.push(`${game}[${i}]`);
    });
  }
  return { total, valid, invalidAt, parseError: false };
}

/** Mirrors passwordGameLeaderboardEntrySchema (v2): elapsedSeconds/ruleCount. */
export function isValidPgLeaderboardRow(row) {
  return (
    !!row &&
    typeof row === "object" &&
    typeof row.name === "string" &&
    typeof row.seed === "number" &&
    typeof row.elapsedSeconds === "number" &&
    typeof row.ruleCount === "number" &&
    isIsoDateTime(row.createdAt)
  );
}

/** Mirrors passwordGameLeaderboardFileSchema (v2): versioned entries envelope. */
export function validatePgLeaderboardFile(parsed) {
  if (
    !parsed ||
    typeof parsed === "string" ||
    Array.isArray(parsed) ||
    typeof parsed !== "object"
  ) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true, wrongVersion: true };
  }
  if (!Array.isArray(parsed.entries)) {
    return { total: 0, valid: 0, invalidAt: [], parseError: true };
  }
  let valid = 0;
  const invalidAt = [];
  parsed.entries.forEach((row, i) => {
    if (isValidPgLeaderboardRow(row)) valid += 1;
    else invalidAt.push(i + 1);
  });
  return { total: parsed.entries.length, valid, invalidAt, parseError: false };
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

function parseJson(text) {
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    return { parsed: undefined, failed: true };
  }
}

const FILES = [
  { name: "leads.jsonl", validate: (text) => validateJsonl(text, isValidLeadRow) },
  {
    name: "leaderboard.json",
    validate: (text) => {
      const { parsed, failed } = parseJson(text);
      return failed
        ? { total: 0, valid: 0, invalidAt: [], parseError: true }
        : validateLeaderboardFile(parsed);
    },
  },
  {
    name: "password-game-leaderboard.json",
    validate: (text) => {
      const { parsed, failed } = parseJson(text);
      return failed
        ? { total: 0, valid: 0, invalidAt: [], parseError: true }
        : validatePgLeaderboardFile(parsed);
    },
  },
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
    return { file: f.name, readable: true, ...f.validate(text) };
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
      const detail = r.wrongVersion
        ? `carries the wrong schemaVersion (expected ${SCHEMA_VERSION})`
        : "is not valid JSON / not the expected shape";
      console.error(`MALFORMED: ${r.file} ${detail}`);
      ok = false;
      continue;
    }
    console.log(`${r.file}: ${r.valid}/${r.total} valid rows`);
    if (r.invalidAt.length > 0) {
      console.error(`  invalid row(s) at: ${r.invalidAt.join(", ")}`);
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
