#!/usr/bin/env node
/**
 * Root-file gate: the repository root only ever contains the files listed in
 * ROOT_ALLOWLIST. Two checks:
 *   1. Every git-TRACKED root file must be allowlisted -- catches a stray that
 *      already slipped into a commit (this is the check that runs in CI).
 *   2. Every UNTRACKED, non-gitignored root file must be allowlisted -- catches
 *      local strays before `git add -A` sweeps them in (pre-push guard; a CI
 *      checkout has no untracked files, so this is a no-op there).
 * Gitignored files (.env.local, next-env.d.ts, *.tsbuildinfo, logs) pass
 * without being listed: the gate targets files that could actually be
 * committed. Closes the DESIGN.md known-debt item "a root-level junk gate has
 * been proposed but not built". Runs in CI (mirrors check-env-drift.mjs).
 *
 * Adding a legitimate root file: append it to ROOT_ALLOWLIST with a one-line
 * comment saying what it is, in the same commit that introduces the file.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";

const ROOT_ALLOWLIST = new Set([
  ".dockerignore",
  ".env.example",
  ".git-blame-ignore-revs",
  ".gitattributes",
  ".gitignore",
  ".nvmrc",
  ".oxlintrc.json",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "CLAUDE.md",
  "DESIGN.md",
  "Dockerfile",
  "README.md",
  "RUNBOOK.md",
  "eslint.config.mjs",
  "knip.json",
  "next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "tsconfig.json",
  "vitest.config.ts",
]);

let ok = true;

const trackedRootFiles = execFileSync("git", ["ls-files"], { encoding: "utf-8" })
  .split("\n")
  .filter((f) => f && !f.includes("/"));
for (const file of trackedRootFiles) {
  if (!ROOT_ALLOWLIST.has(file)) {
    console.error(
      `STRAY TRACKED ROOT FILE: ${file} (add to ROOT_ALLOWLIST with a comment, or remove it)`,
    );
    ok = false;
  }
}

function isGitignored(file) {
  try {
    execFileSync("git", ["check-ignore", "-q", file]);
    return true;
  } catch {
    return false;
  }
}

const trackedSet = new Set(trackedRootFiles);
for (const entry of readdirSync(".")) {
  if (ROOT_ALLOWLIST.has(entry) || trackedSet.has(entry)) continue;
  if (statSync(entry).isDirectory()) continue;
  if (isGitignored(entry)) continue;
  console.error(`STRAY UNTRACKED ROOT FILE: ${entry} (gitignore it, move it, or allowlist it)`);
  ok = false;
}

if (ok) {
  console.log("check-root-files: repo root matches the allowlist.");
} else {
  process.exitCode = 1;
}
