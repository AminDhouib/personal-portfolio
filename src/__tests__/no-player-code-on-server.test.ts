// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Player code never runs on our server, in any form: nothing outside the game's own folder may
// import the sandbox, and the engine (which the server re-simulates with) must not import it
// either. The sandbox is browser-only; the server checks action logs with the pure engine.

const SRC = path.resolve(__dirname, "..");
const KNIGHT = path.join(SRC, "components", "game", "script-knight");
const SANDBOX = path.join(KNIGHT, "sandbox");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : sourceFiles(full);
    }
    return /\.(?:ts|tsx|mts|js|mjs)$/.test(entry) ? [full] : [];
  });
}

/** Every module specifier the file imports, exports from, or dynamically imports. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
    found.push(match[1] ?? "");
  }
  return found;
}

function resolves(file: string, specifier: string): string {
  return specifier.startsWith(".")
    ? path.resolve(path.dirname(file), specifier)
    : path.resolve(SRC, specifier.replace(/^@\//, ""));
}

function importsSandbox(file: string): string[] {
  return specifiers(file).filter((specifier) => {
    const target = resolves(file, specifier);
    return target === SANDBOX || target.startsWith(`${SANDBOX}${path.sep}`);
  });
}

describe("no player code on the server", () => {
  it("finds the folders it guards", () => {
    expect(sourceFiles(path.join(SRC, "app")).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(SRC, "lib")).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(SRC, "hooks")).length).toBeGreaterThan(0);
    expect(sourceFiles(SANDBOX).length).toBeGreaterThan(0);
  });

  it("no file under src/app, src/lib or src/hooks imports the sandbox", () => {
    const offenders = ["app", "lib", "hooks"]
      .flatMap((dir) => sourceFiles(path.join(SRC, dir)))
      .filter((file) => importsSandbox(file).length > 0)
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("nothing under script-knight/engine imports the sandbox", () => {
    const offenders = sourceFiles(path.join(KNIGHT, "engine"))
      .filter((file) => importsSandbox(file).length > 0)
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("the check itself sees a sandbox import", () => {
    expect(importsSandbox(path.join(SANDBOX, "worker.ts")).length).toBeGreaterThan(0);
    expect(importsSandbox(path.join(KNIGHT, "engine", "run.ts"))).toEqual([]);
    expect(importsSandbox(path.join(SANDBOX, "protocol.ts"))).toEqual([]);
  });
});
