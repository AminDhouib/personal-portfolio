#!/usr/bin/env node
/**
 * Env-drift check: keys in src/env.ts and .env.example must match exactly.
 * Runs in husky pre-push and CI.
 */
import { readFileSync } from "node:fs";

const envTs = readFileSync("src/env.ts", "utf-8");
const envExample = readFileSync(".env.example", "utf-8");

const schemaKeys = new Set(
  [...envTs.matchAll(/^\s+(\w+):\s*z\./gm)].map((m) => m[1]),
);

const exampleKeys = new Set(
  [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);

// POSTHOG_KEY and POSTHOG_HOST are commented out in .env.example (optional
// server-side capture) but present in the schema — exclude from drift check.
const COMMENTED_IN_EXAMPLE = new Set(["POSTHOG_KEY", "POSTHOG_HOST"]);

let ok = true;

for (const key of schemaKeys) {
  if (!exampleKeys.has(key) && !COMMENTED_IN_EXAMPLE.has(key)) {
    console.error(`DRIFT: ${key} is in src/env.ts but missing from .env.example`);
    ok = false;
  }
}

for (const key of exampleKeys) {
  if (!schemaKeys.has(key)) {
    console.error(`DRIFT: ${key} is in .env.example but missing from src/env.ts`);
    ok = false;
  }
}

if (ok) {
  console.log("env-drift: src/env.ts and .env.example are in sync.");
} else {
  process.exitCode = 1;
}
