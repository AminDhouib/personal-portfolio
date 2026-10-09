// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// The lazy boundary. The home page, its game section, the /games hub and the
// game registry are on every visitor's first load; Failover's sim, scene,
// controller and three.js must only ever arrive through a dynamic import()
// (next/dynamic or a bare import()), never through a static one. This walks
// the static import graph from those roots and fails on the first file that
// crosses the line, printing the chain that got there.

const REAL_SRC = path.resolve(__dirname, "../../../..");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

const ROOTS = [
  "components/game/registry.tsx",
  "app/games/games-client.tsx",
  "components/sections/game.tsx",
  "app/page.tsx",
];

/** Strip comments, keeping string literals intact so a `//` in a URL survives. */
function stripComments(text: string): string {
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_match, literal: string | undefined) => literal ?? "",
  );
}

/**
 * The specifiers a file imports statically: `import x from`, `import "x"`,
 * `export ... from`, `require("x")` and `import x = require("x")`. `import(...)`
 * is the lazy boundary and is not followed; `import type` and `export type` are
 * erased by the compiler and are not edges.
 */
function staticSpecifiers(text: string): string[] {
  const found: string[] = [];
  const code = stripComments(text);
  const statement =
    /(?:^|[\s;}])(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"'\n]+)["']/g;
  for (const match of code.matchAll(statement)) {
    if (match[1] === undefined && match[2] !== undefined) found.push(match[2]);
  }
  const call = /(?:^|[^\w.$])require\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
  for (const match of code.matchAll(call)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

// TypeScript's bundler resolution lets "./x.js" name ./x.ts (and Turbopack follows it).
const SOURCE_FOR = new Map([
  [".js", [".ts", ".tsx"]],
  [".jsx", [".tsx"]],
  [".mjs", [".mts"]],
]);

type Target = { kind: "file"; file: string } | { kind: "package"; name: string };

function resolve(srcRoot: string, from: string, specifier: string): Target | null {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return { kind: "package", name: specifier };
  }
  const base = specifier.startsWith("@/")
    ? path.resolve(srcRoot, specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  const ext = path.extname(base);
  const swapped = (SOURCE_FOR.get(ext) ?? []).map((source) => base.slice(0, -ext.length) + source);
  for (const candidate of [
    base,
    ...swapped,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      // CSS, JSON and other assets carry no imports of their own.
      return EXTENSIONS.includes(path.extname(candidate))
        ? { kind: "file", file: candidate }
        : null;
    }
  }
  return null;
}

/** Why `target` may not be reached statically, or null if it may. */
function forbidden(srcRoot: string, target: Target): string | null {
  if (target.kind === "package") {
    return target.name === "three" || target.name.startsWith("three/") ? target.name : null;
  }
  const failover = path.join(srcRoot, "components", "game", "failover");
  const rel = path.relative(failover, target.file).split(path.sep).join("/");
  if (rel.startsWith("..")) return null;
  if (rel.startsWith("sim/") || rel.startsWith("scene/") || rel === "controller.ts") {
    return `failover/${rel}`;
  }
  return null;
}

/** Every forbidden module the roots reach statically, each with the chain that reached it. */
function findViolations(srcRoot: string, roots: readonly string[]): string[] {
  const violations: string[] = [];
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const root of roots) {
    const file = path.join(srcRoot, root);
    if (!parent.has(file)) {
      parent.set(file, null);
      queue.push(file);
    }
  }

  const chain = (file: string): string => {
    const steps: string[] = [];
    for (let at: string | null = file; at !== null; at = parent.get(at) ?? null) {
      steps.unshift(path.relative(srcRoot, at).split(path.sep).join("/"));
    }
    return steps.join(" -> ");
  };

  while (queue.length > 0) {
    const file = queue.shift() as string;
    for (const specifier of staticSpecifiers(readFileSync(file, "utf8"))) {
      const target = resolve(srcRoot, file, specifier);
      if (target === null) continue;
      const bad = forbidden(srcRoot, target);
      if (bad !== null) violations.push(`${chain(file)} -> ${bad}`);
      if (target.kind === "file" && !parent.has(target.file)) {
        parent.set(target.file, file);
        queue.push(target.file);
      }
    }
  }
  return violations;
}

describe("Failover's lazy boundary", () => {
  it("keeps sim, scene, controller and three out of the static graph of every first-load root", () => {
    for (const root of ROOTS) expect(existsSync(path.join(REAL_SRC, root))).toBe(true);
    expect(findViolations(REAL_SRC, ROOTS)).toEqual([]);
  });
});

describe("the guard itself", () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function tree(files: Record<string, string>): string {
    dir = mkdtempSync(path.join(os.tmpdir(), "failover-import-graph-"));
    for (const [rel, text] of Object.entries(files)) {
      const full = path.join(dir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return dir;
  }

  it("catches a static import of the sim two hops from a root, and names the chain", () => {
    const src = tree({
      "root.tsx": 'import { Poster } from "./components/game/failover/poster";\n',
      "components/game/failover/poster.tsx":
        'import { step } from "@/components/game/failover/sim/tick";\n',
      "components/game/failover/sim/tick.ts": "export const step = 1;\n",
    });
    expect(findViolations(src, ["root.tsx"])).toEqual([
      "root.tsx -> components/game/failover/poster.tsx -> failover/sim/tick.ts",
    ]);
  });

  it("catches the scene, the controller and three, through re-exports and side-effect imports", () => {
    const src = tree({
      "root.tsx": 'export * from "./barrel";\nimport "./side";\n',
      "barrel.ts":
        'export { Scene } from "./components/game/failover/scene/scene";\nexport { FailoverController } from "./components/game/failover/controller";\n',
      "side.ts": 'import {\n  WebGLRenderer,\n} from "three";\n',
      "components/game/failover/scene/scene.ts": "export const Scene = 1;\n",
      "components/game/failover/controller.ts": "export const FailoverController = 1;\n",
    });
    expect(findViolations(src, ["root.tsx"]).sort()).toEqual([
      "root.tsx -> barrel.ts -> failover/controller.ts",
      "root.tsx -> barrel.ts -> failover/scene/scene.ts",
      "root.tsx -> side.ts -> three",
    ]);
  });

  it("catches a .js-suffixed specifier for a .ts file, and require() in both forms", () => {
    const src = tree({
      "root.tsx": [
        'export { FailoverController } from "./components/game/failover/controller.js";',
        'const sim = require("./components/game/failover/sim/tick");',
        'import scene = require("./components/game/failover/scene/scene.jsx");',
      ].join("\n"),
      "components/game/failover/controller.ts": "export const FailoverController = 1;\n",
      "components/game/failover/sim/tick.ts": "export const step = 1;\n",
      "components/game/failover/scene/scene.tsx": "export const Scene = 1;\n",
    });
    expect(findViolations(src, ["root.tsx"]).sort()).toEqual([
      "root.tsx -> failover/controller.ts",
      "root.tsx -> failover/scene/scene.tsx",
      "root.tsx -> failover/sim/tick.ts",
    ]);
  });

  it("lets dynamic imports, type-only imports and comments through", () => {
    const src = tree({
      "root.tsx": [
        'import dynamic from "next/dynamic";',
        'import type { Snapshot } from "./components/game/failover/sim/snapshot";',
        '// import { step } from "./components/game/failover/sim/tick";',
        '/* import * as THREE from "three"; */',
        'const Game = dynamic(() => import("./components/game/failover"), { ssr: false });',
        'const load = () => import("three");',
        'const url = "https://example.com//three";',
      ].join("\n"),
      "components/game/failover.tsx": 'import { step } from "./failover/sim/tick";\n',
      "components/game/failover/sim/snapshot.ts": "export interface Snapshot { tick: number }\n",
      "components/game/failover/sim/tick.ts": "export const step = 1;\n",
    });
    expect(findViolations(src, ["root.tsx"])).toEqual([]);
  });
});
