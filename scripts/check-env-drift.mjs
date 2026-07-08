#!/usr/bin/env node
/**
 * Env-drift check: keys in src/env.ts and .env.example must match exactly,
 * and every REQUIRED_ENV_VARS entry must be an uncommented line in the
 * example (a required var hidden behind a comment would defeat the strict
 * boot gate's documentation). Runs in husky pre-push and CI.
 */
import { readFileSync } from "node:fs";

const envTs = readFileSync("src/env.ts", "utf-8");
const envExample = readFileSync(".env.example", "utf-8");

const schemaKeys = new Set([...envTs.matchAll(/^\s+(\w+):\s*z\./gm)].map((m) => m[1]));

const exampleKeys = new Set([...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

const requiredBlock = envTs.match(/REQUIRED_ENV_VARS = \[([\s\S]*?)\] as const/);
const requiredKeys = requiredBlock
  ? [...requiredBlock[1].matchAll(/"(\w+)"/g)].map((m) => m[1])
  : [];

let ok = true;

if (requiredKeys.length === 0) {
  console.error("DRIFT: could not parse REQUIRED_ENV_VARS from src/env.ts");
  ok = false;
}

for (const key of schemaKeys) {
  if (!exampleKeys.has(key)) {
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

for (const key of requiredKeys) {
  if (!schemaKeys.has(key)) {
    console.error(`DRIFT: required var ${key} is not in the env schema`);
    ok = false;
  }
  if (!exampleKeys.has(key)) {
    console.error(`DRIFT: required var ${key} has no uncommented line in .env.example`);
    ok = false;
  }
}

if (ok) {
  console.log("env-drift: src/env.ts and .env.example are in sync.");
} else {
  process.exitCode = 1;
}
