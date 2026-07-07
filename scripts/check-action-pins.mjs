#!/usr/bin/env node
/**
 * Action-pin check: every external `uses:` reference in .github/workflows/*.yml
 * must be pinned to a 40-hex-character commit SHA (a trailing `# vN` comment is
 * fine; a floating tag/branch is not -- that is how a compromised upstream tag
 * silently changes what CI runs). Local (`./`) and Docker (`docker://`) refs are
 * exempt: they are not floating version tags.
 * Runs in CI (mirrors check-env-drift.mjs).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const WORKFLOWS_DIR = ".github/workflows";
const SHA_RE = /^[0-9a-f]{40}$/;

const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

let ok = true;

for (const file of files) {
  const filePath = path.join(WORKFLOWS_DIR, file);
  const lines = readFileSync(filePath, "utf-8").split("\n");
  lines.forEach((line, i) => {
    const match = /^\s*uses:\s*(\S+)/.exec(line);
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
  console.log("check-action-pins: every workflow `uses:` is pinned to a commit SHA.");
} else {
  process.exitCode = 1;
}
