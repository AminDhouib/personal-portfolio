#!/usr/bin/env node
/**
 * Action-pin check: every external `uses:` reference in .github/workflows/*.yml
 * must be pinned to a 40-hex-character commit SHA (a trailing `# vN` comment is
 * fine; a floating tag/branch is not -- that is how a compromised upstream tag
 * silently changes what CI runs). Local (`./`) and Docker (`docker://`) refs are
 * exempt: they are not floating version tags.
 * The local composite actions' action.yml files (action.yml under .github/actions) are held to the
 * same rule: the vendored security-audit action has a third-party `uses:` of its own.
 * A step written as a list item (`- uses: ...`) is matched too; the bare `uses:` form alone
 * would let the vendored workflow's checkout and setup steps through unchecked.
 * Runs in CI (mirrors check-env-drift.mjs).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const WORKFLOWS_DIR = ".github/workflows";
const SHA_RE = /^[0-9a-f]{40}$/;

const ACTIONS_DIR = ".github/actions";

const isYaml = (f) => f.endsWith(".yml") || f.endsWith(".yaml");
const filePaths = [
  ...readdirSync(WORKFLOWS_DIR)
    .filter(isYaml)
    .map((f) => path.join(WORKFLOWS_DIR, f)),
  ...(existsSync(ACTIONS_DIR) ? readdirSync(ACTIONS_DIR) : [])
    .map((d) => path.join(ACTIONS_DIR, d, "action.yml"))
    .filter((f) => existsSync(f)),
];

let ok = true;

for (const filePath of filePaths) {
  const lines = readFileSync(filePath, "utf-8").split("\n");
  lines.forEach((line, i) => {
    const match = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line);
    if (!match) return;
    const ref = match[1];
    if (ref === undefined || ref.startsWith("./") || ref.startsWith("docker://")) return;
    const at = ref.lastIndexOf("@");
    if (at === -1) {
      console.error(`UNPINNED: ${filePath}:${i + 1}: "${ref}" has no @ref`);
      ok = false;
      return;
    }
    const version = ref.slice(at + 1);
    if (!SHA_RE.test(version)) {
      console.error(
        `UNPINNED: ${filePath}:${i + 1}: "${ref}" is not pinned to a 40-hex commit SHA`,
      );
      ok = false;
    }
  });
}

if (ok) {
  console.log(
    "check-action-pins: every workflow and local action `uses:` is pinned to a commit SHA.",
  );
} else {
  process.exitCode = 1;
}
