// @vitest-environment node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUDGET_BYTES,
  FLOOR_BYTES,
  asyncChunkLists,
  checkBudget,
  diagnostics,
  firstLoadFiles,
  gameChunkFiles,
} from "./check-bundle-budget.mjs";

// A small fake .next directory shaped like a Turbopack production build: an
// async loader in a parent chunk lists the chunk paths its import() fetches,
// as a string array, and the per-page react-loadable-manifest does not list
// ssr:false dynamic() calls at all. Chunk bodies are random base64, which gzip
// barely shrinks, so sizes are easy to reason about.

const SCRIPT = fileURLToPath(new URL("./check-bundle-budget.mjs", import.meta.url));
const PAGE_DIR = ["server", "app", "games", "[slug]", "page"];
const MARKER = '"failover:gfx"';

let dist = null;

afterEach(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
  dist = null;
});

function write(rel, text) {
  const full = path.join(dist, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

const noise = (kb) => randomBytes(kb * 1024).toString("base64");

/** The minified shape of a Turbopack async loader for one import(). */
const loader = (chunks) =>
  `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([document.currentScript,4242,e=>{e.v(t=>Promise.all(${JSON.stringify(chunks)}.map(t=>e.l(t))).then(()=>t(4243)))}]);`;

/**
 * The real layout: the registry's chunk loads the poster, the poster's chunk
 * loads the game group (game code, three.js, and a chunk the page already has).
 */
function realBuild({ threeKb = 150, posterLoadsGame = true } = {}) {
  dist = mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  write(
    path.join(...PAGE_DIR, "react-loadable-manifest.json"),
    JSON.stringify({ "[project]/src/app/x.tsx [app-client] (ecmascript)": { id: 1, files: [] } }),
  );
  write(
    "build-manifest.json",
    JSON.stringify({
      pages: {},
      rootMainFiles: ["static/chunks/turbopack-main.js", "static/chunks/shared.js"],
      polyfillFiles: ["static/chunks/polyfills.js"],
    }),
  );
  write(
    path.join("server", "app", "games", "[slug]", "page_client-reference-manifest.js"),
    'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/games/[slug]/page"]=' +
      JSON.stringify({
        entryJSFiles: { "[project]/src/app/games/[slug]/page": ["static/chunks/registry.js"] },
      }) +
      ";",
  );
  write(
    "static/chunks/turbopack-main.js",
    `(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push([0,{otherChunks:${JSON.stringify([
      "static/chunks/shared.js",
      "static/chunks/registry.js",
    ])},runtimeModuleIds:[1]}]);`,
  );
  write("static/chunks/shared.js", noise(30));
  write(
    "static/chunks/registry.js",
    `${loader(["static/chunks/poster.js"])};${loader(["static/chunks/hextris.js"])};${noise(5)}`,
  );
  write(
    "static/chunks/poster.js",
    posterLoadsGame
      ? `${loader(["static/chunks/game.js", "static/chunks/three.js", "static/chunks/shared.js"])};${noise(2)}`
      : noise(2),
  );
  write("static/chunks/game.js", `const k=${MARKER};${noise(40)}`);
  write(
    "static/chunks/three.js",
    `console.warn("THREE.WebGLRenderer: Context Lost.");${noise(threeKb)}`,
  );
  write("static/chunks/hextris.js", noise(20));
  return dist;
}

const gz = (rel) => gzipSync(readFileSync(path.join(dist, rel)), { level: 9 }).length;

describe("check-bundle-budget", () => {
  it("has the plan's 420 KB budget and a floor that three.js alone clears", () => {
    expect(BUDGET_BYTES).toBe(420 * 1024);
    expect(FLOOR_BYTES).toBe(100 * 1024);
  });

  it("reads the async loaders' chunk lists out of the chunks", () => {
    realBuild();
    const lists = asyncChunkLists(dist).map((l) => l.chunks);
    expect(lists).toContainEqual(["static/chunks/poster.js"]);
    expect(lists).toContainEqual([
      "static/chunks/game.js",
      "static/chunks/three.js",
      "static/chunks/shared.js",
    ]);
  });

  it("reads a list of {path, included} objects the same as a list of strings", () => {
    realBuild();
    const objects = ["static/chunks/game.js", "static/chunks/three.js"].map((p, i) => ({
      path: p,
      included: [i + 10],
      moduleChunks: [p],
    }));
    write(
      "static/chunks/poster.js",
      `e.v(t=>Promise.all(${JSON.stringify(objects)}.map(t=>e.l(t))))`,
    );
    expect(gameChunkFiles(dist)).toEqual(["static/chunks/game.js", "static/chunks/three.js"]);
  });

  it("finds the game group: the list that loads the marker chunk, minus first-load chunks", () => {
    realBuild();
    expect(gameChunkFiles(dist)).toEqual(["static/chunks/game.js", "static/chunks/three.js"]);
  });

  it("reads the first-load chunks from the build manifest and the client reference manifest", () => {
    realBuild();
    expect([...firstLoadFiles(dist)].sort()).toEqual([
      "static/chunks/polyfills.js",
      "static/chunks/registry.js",
      "static/chunks/shared.js",
      "static/chunks/turbopack-main.js",
    ]);
  });

  it("passes the real layout, summing gzip sizes", () => {
    realBuild();
    const result = checkBudget({ dist });
    expect(result.total).toBe(gz("static/chunks/game.js") + gz("static/chunks/three.js"));
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("fails over the budget", () => {
    realBuild();
    const result = checkBudget({ dist, budget: 100 * 1024 });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/over the budget/);
  });

  it("fails under the floor: a group this small cannot hold three.js", () => {
    realBuild({ threeKb: 10 });
    const result = checkBudget({ dist });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/under the 100\.0 KB floor/);
  });

  it("fails when only the poster is found: no loader list carries the game's chunk", () => {
    realBuild({ posterLoadsGame: false });
    expect(() => gameChunkFiles(dist)).toThrow(/no async chunk list loads .*game\.js/);
  });

  it("fails when no chunk carries the marker at all", () => {
    realBuild();
    write("static/chunks/game.js", noise(40));
    expect(() => gameChunkFiles(dist)).toThrow(
      /no chunk under static\/chunks contains "failover:gfx"/,
    );
  });

  it("fails when there is no build output", () => {
    dist = mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
    expect(() => gameChunkFiles(dist)).toThrow(/no .*static[\\/]chunks/);
  });

  it("describes the layout it found, for the CI log", () => {
    realBuild();
    const text = diagnostics(dist);
    expect(text).toMatch(
      /server[\\/]app[\\/]games[\\/]\[slug\][\\/]page[\\/]react-loadable-manifest\.json/,
    );
    expect(text).toMatch(/\[project\]\/src\/app\/x\.tsx/);
    expect(text).toMatch(/chunks containing "failover:gfx": static\/chunks\/game\.js/);
  });

  it("runs as a CLI: exit 0 on the real layout; exit 1 with diagnostics when it cannot find the game", () => {
    realBuild();
    const ok = spawnSync(process.execPath, [SCRIPT, "--dist", dist], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/static\/chunks\/three\.js/);
    expect(ok.stdout).toMatch(/Failover game chunks: [\d.]+ KB gzip \(budget 420\.0 KB\)/);

    write("static/chunks/poster.js", noise(2));
    const bad = spawnSync(process.execPath, [SCRIPT, "--dist", dist], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/no async chunk list loads/);
    expect(bad.stderr).toMatch(/react-loadable-manifest\.json/);
    expect(bad.stderr).toMatch(/chunks containing "failover:gfx"/);
  });
});
