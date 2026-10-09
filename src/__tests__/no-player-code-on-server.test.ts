// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Player code never runs on our server, in any form. Three things are checked over all of src/:
//   1. server roots (app, lib, hooks, data, the root entry files) do not import the sandbox, and
//      the engine (which the server re-simulates with) does not either;
//   2. no file reaches the sandbox through a barrel: a module that imports the sandbox and is not
//      a "use client" file taints whoever imports it, and a server root importing a tainted
//      module fails (a "use client" file is a boundary: the server only references it);
//   3. nothing outside the sandbox folder evaluates a string as code (`new Function`, `eval`) or
//      imports `node:vm`.

const REAL_SRC = path.resolve(__dirname, "..");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];
const SERVER_DIRS = ["app", "lib", "hooks", "data"];
const CODE_EVAL = /\bnew\s+Function\s*\(|(?<![.\w])eval\s*\(|["'](?:node:)?vm["']/;

function isTestFile(file: string): boolean {
  return /[\\/]__tests__[\\/]/.test(file) || /\.test\.[a-z]+$/.test(file);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "node_modules" ? [] : sourceFiles(full);
    }
    return EXTENSIONS.includes(path.extname(entry)) && !isTestFile(full) ? [full] : [];
  });
}

/** Every module specifier the file imports, exports from, or dynamically imports. */
function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
    found.push(match[1] ?? "");
  }
  return found;
}

function isClientFile(text: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(text);
}

/** Violations as readable strings, relative to the src root; empty when the tree is clean. */
function findViolations(srcRoot: string): string[] {
  const sandbox = path.join(srcRoot, "components", "game", "script-knight", "sandbox");
  const engine = path.join(srcRoot, "components", "game", "script-knight", "engine");
  const inside = (file: string, dir: string): boolean => file.startsWith(`${dir}${path.sep}`);
  const files = sourceFiles(srcRoot);
  const texts = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const fileSet = new Set(files);

  function resolve(from: string, specifier: string): string | null {
    const base = specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : specifier.startsWith("@/")
        ? path.resolve(srcRoot, specifier.slice(2))
        : null;
    if (base === null) return null;
    if (base === sandbox) return sandbox;
    for (const candidate of [
      base,
      ...EXTENSIONS.map((ext) => base + ext),
      ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
    ]) {
      if (fileSet.has(candidate)) return candidate;
    }
    return base;
  }
  const reachesSandbox = (target: string | null): boolean =>
    target !== null && (target === sandbox || inside(target, sandbox));

  const imports = new Map(
    files.map((file) => [
      file,
      specifiers(texts.get(file) ?? "").map((spec) => resolve(file, spec)),
    ]),
  );

  // Taint: a file outside the sandbox that imports it, or imports a tainted file, unless it is
  // a "use client" file (the boundary) -- those are tainted by nothing and taint nobody.
  const tainted = new Set<string>();
  const direct = new Set<string>();
  for (const file of files) {
    if (inside(file, sandbox)) continue;
    if ((imports.get(file) ?? []).some(reachesSandbox)) direct.add(file);
  }
  for (const file of direct) {
    if (!isClientFile(texts.get(file) ?? "")) tainted.add(file);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const file of files) {
      if (inside(file, sandbox) || tainted.has(file) || isClientFile(texts.get(file) ?? ""))
        continue;
      if ((imports.get(file) ?? []).some((target) => target !== null && tainted.has(target))) {
        tainted.add(file);
        changed = true;
      }
    }
  }

  const rootFiles = files.filter((file) => {
    const rel = path.relative(srcRoot, file);
    return (
      SERVER_DIRS.some((dir) => rel.startsWith(`${dir}${path.sep}`)) || !rel.includes(path.sep)
    );
  });
  const violations: string[] = [];
  const rel = (file: string): string => path.relative(srcRoot, file).split(path.sep).join("/");

  for (const file of rootFiles) {
    if (direct.has(file)) violations.push(`${rel(file)} imports the sandbox`);
    else if ((imports.get(file) ?? []).some((t) => t !== null && tainted.has(t))) {
      violations.push(`${rel(file)} imports a module that re-exports the sandbox`);
    }
  }
  for (const file of files.filter((f) => inside(f, engine))) {
    if (direct.has(file)) violations.push(`${rel(file)} (engine) imports the sandbox`);
  }
  for (const file of files) {
    if (inside(file, sandbox)) continue;
    if (CODE_EVAL.test(texts.get(file) ?? "")) {
      violations.push(`${rel(file)} evaluates a string as code or imports node:vm`);
    }
  }
  return violations;
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tree(entries: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "sk-guard-"));
  temps.push(root);
  for (const [name, text] of Object.entries(entries)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const SB = "components/game/script-knight/sandbox";
const KN = "components/game/script-knight";

describe("no player code on the server", () => {
  it("the real tree is clean", () => {
    expect(sourceFiles(path.join(REAL_SRC, "app")).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(REAL_SRC, "lib")).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(REAL_SRC, "hooks")).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(REAL_SRC, KN, "sandbox")).length).toBeGreaterThan(0);
    expect(findViolations(REAL_SRC)).toEqual([]);
  });

  it("flags a server file that imports the sandbox directly", () => {
    const root = tree({
      [`${SB}/run-client.ts`]: "export const x = 1;\n",
      "lib/bad.ts": `import { x } from "@/${SB}/run-client";\nexport const y = x;\n`,
    });
    expect(findViolations(root)).toEqual(["lib/bad.ts imports the sandbox"]);
  });

  it("flags the engine importing the sandbox", () => {
    const root = tree({
      [`${SB}/protocol.ts`]: "export const x = 1;\n",
      [`${KN}/engine/run.ts`]: 'import { x } from "../sandbox/protocol";\nexport const y = x;\n',
    });
    expect(findViolations(root)).toEqual([`${KN}/engine/run.ts (engine) imports the sandbox`]);
  });

  it("follows a barrel that re-exports the sandbox", () => {
    const root = tree({
      [`${SB}/run-client.ts`]: "export const x = 1;\n",
      [`${KN}/index.ts`]: 'export * from "./sandbox/run-client";\n',
      "app/page.tsx": `import { x } from "@/${KN}";\nexport default x;\n`,
    });
    expect(findViolations(root)).toEqual([
      "app/page.tsx imports a module that re-exports the sandbox",
    ]);
  });

  it("follows a barrel through two hops", () => {
    const root = tree({
      [`${SB}/run-client.ts`]: "export const x = 1;\n",
      [`${KN}/a.ts`]: 'export * from "./sandbox/run-client";\n',
      [`${KN}/b.ts`]: 'export * from "./a";\n',
      "lib/c.ts": `export { x } from "@/${KN}/b";\n`,
    });
    expect(findViolations(root)).toEqual(["lib/c.ts imports a module that re-exports the sandbox"]);
  });

  it("lets a server file import a use-client island that uses the sandbox", () => {
    const root = tree({
      [`${SB}/run-client.ts`]: "export const x = 1;\n",
      [`${KN}/stage.tsx`]: `"use client";\nimport { x } from "./sandbox/run-client";\nexport const S = x;\n`,
      "app/page.tsx": `import { S } from "@/${KN}/stage";\nexport default S;\n`,
    });
    expect(findViolations(root)).toEqual([]);
  });

  it("flags eval, new Function and node:vm outside the sandbox only", () => {
    const root = tree({
      [`${SB}/compile.ts`]: "export const f = new Function('return 1');\n",
      "lib/a.ts": "export const a = eval('1');\n",
      "lib/b.ts": "export const b = new Function('return 1');\n",
      "instrumentation.ts": 'import vm from "node:vm";\nexport default vm;\n',
      "lib/ok.ts": "export const medieval = (x: number) => x;\nexport const ok = obj.eval;\n",
    });
    expect(findViolations(root).sort()).toEqual([
      "instrumentation.ts evaluates a string as code or imports node:vm",
      "lib/a.ts evaluates a string as code or imports node:vm",
      "lib/b.ts evaluates a string as code or imports node:vm",
    ]);
  });

  it("also guards the root entry files and src/data", () => {
    const root = tree({
      [`${SB}/run-client.ts`]: "export const x = 1;\n",
      "env.ts": `import { x } from "./${SB}/run-client";\nexport const e = x;\n`,
      "data/d.ts": `import { x } from "../${SB}/run-client";\nexport const d = x;\n`,
    });
    expect(findViolations(root).sort()).toEqual([
      "data/d.ts imports the sandbox",
      "env.ts imports the sandbox",
    ]);
  });
});
