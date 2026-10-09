// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CodeMirror is 136 KB gzipped and only the desktop code editor on /games/script-knight wants it.
// It stays out of every other route's first-load JS because exactly one module is allowed to be
// reached through a dynamic import() and nothing else may import the libraries or that module
// statically. This reads the import graph of src/; CI's build is the final proof.

const SRC = path.resolve(__dirname, "..", "..", "..", "..");
const KNIGHT = path.join(SRC, "components", "game", "script-knight");
const LIBS = /^(?:@codemirror|@lezer)\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(full);
    const isTest = /[\\/]__tests__[\\/]/.test(full) || /\.test\.[a-z]+$/.test(entry);
    return /\.(?:ts|tsx)$/.test(entry) && !isTest ? [full] : [];
  });
}

interface Imports {
  statics: string[];
  dynamics: string[];
}

/** Value imports and re-exports (not `import type`), and dynamic import() calls. */
function importsOf(file: string): Imports {
  const text = readFileSync(file, "utf8");
  const statics = [
    ...text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s*["']([^"']+)["']/gm),
    ...text.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
  ].map((m) => m[1] ?? "");
  const dynamics = [...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? "");
  return { statics, dynamics };
}

const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join("/");
const files = sourceFiles(SRC);
const LAZY = new Set([path.join(KNIGHT, "code-editor.tsx"), path.join(KNIGHT, "syntax-check.ts")]);

describe("the CodeMirror chunk stays lazy", () => {
  it("finds the files it guards", () => {
    expect(files.length).toBeGreaterThan(100);
    for (const file of LAZY) expect(files).toContain(file);
  });

  it("only code-editor.tsx and syntax-check.ts import CodeMirror or lezer", () => {
    const offenders = files
      .filter((file) => !LAZY.has(file))
      .filter((file) => {
        const { statics, dynamics } = importsOf(file);
        return [...statics, ...dynamics].some((spec) => LIBS.test(spec));
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  /** Where a relative or @/ specifier points, with any extension dropped; null for a package. */
  function resolveSpec(file: string, spec: string): string | null {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
    const base = spec.startsWith(".")
      ? path.resolve(path.dirname(file), spec)
      : path.resolve(SRC, spec.slice(2));
    return base.replace(/\.(?:tsx?|jsx?|mjs)$/, "");
  }
  const isLazyModule = (base: string | null): boolean =>
    base === path.join(KNIGHT, "code-editor") || base === path.join(KNIGHT, "syntax-check");

  it("nothing imports the lazy modules statically except the lazy chunk itself", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (LAZY.has(file)) continue;
      for (const spec of importsOf(file).statics) {
        if (isLazyModule(resolveSpec(file, spec))) offenders.push(`${rel(file)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only editor-host.tsx imports the code editor dynamically, whatever the extension", () => {
    const host = path.join(KNIGHT, "editor-host.tsx");
    const offenders: string[] = [];
    for (const file of files) {
      if (file === host) continue;
      for (const spec of importsOf(file).dynamics) {
        if (isLazyModule(resolveSpec(file, spec))) offenders.push(`${rel(file)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(importsOf(host).dynamics).toEqual(["./code-editor"]);
  });

  it("the editor host reaches the code editor only through import()", () => {
    const host = importsOf(path.join(KNIGHT, "editor-host.tsx"));
    expect(host.dynamics).toEqual(["./code-editor"]);
    expect(
      host.statics.filter((spec) =>
        isLazyModule(resolveSpec(path.join(KNIGHT, "editor-host.tsx"), spec)),
      ),
    ).toEqual([]);
  });

  it("the stage and its other modules do not touch the lazy chunk", () => {
    const stage = importsOf(path.join(KNIGHT, "stage.tsx"));
    expect(
      [...stage.statics, ...stage.dynamics].filter((spec) => /code-editor|syntax-check/.test(spec)),
    ).toEqual([]);
  });

  it("only the game's own folder mentions the libraries", () => {
    const outside = files
      .filter((file) => !file.startsWith(KNIGHT))
      .filter((file) => /@codemirror|@lezer/.test(readFileSync(file, "utf8")))
      .map(rel);
    expect(outside).toEqual([]);
  });
});
