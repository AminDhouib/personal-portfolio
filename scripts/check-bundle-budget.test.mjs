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
  checkBudget,
  firstLoadFiles,
  gameChunkFiles,
} from "./check-bundle-budget.mjs";

// A small fake .next directory in each layout the script reads. Chunk bodies
// are random base64, which gzip barely shrinks, so sizes are easy to reason about.

const SCRIPT = fileURLToPath(new URL("./check-bundle-budget.mjs", import.meta.url));
const PAGE_DIR = ["server", "app", "games", "[slug]", "page"];

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

function chunk(rel, kb, marker = "") {
  write(rel, `${marker}${randomBytes(kb * 1024).toString("base64")}`);
}

/** A Turbopack-shaped build: the game behind the poster behind the registry, plus noise. */
function turbopackBuild({ keys = "paths" } = {}) {
  dist = mkdtempSync(path.join(os.tmpdir(), "bundle-budget-"));
  const key = (named, id) => (keys === "paths" ? named : String(id));
  write(
    path.join(...PAGE_DIR, "react-loadable-manifest.json"),
    JSON.stringify({
      [key("[project]/src/components/game/registry.tsx -> ./failover/poster", 11)]: {
        id: 11,
        files: ["static/chunks/poster.js"],
      },
      [key("[project]/src/components/game/failover/poster.tsx -> ../failover", 12)]: {
        id: 12,
        files: ["static/chunks/game.js", "static/chunks/three.js", "static/chunks/shared.js"],
      },
      [key("[project]/src/components/game/registry.tsx -> ./hextris", 13)]: {
        id: 13,
        files: ["static/chunks/hextris.js", "static/chunks/hextris.css"],
      },
    }),
  );
  write(
    "build-manifest.json",
    JSON.stringify({
      pages: {},
      rootMainFiles: ["static/chunks/main.js", "static/chunks/shared.js"],
      polyfillFiles: ["static/chunks/polyfills.js"],
    }),
  );
  write(
    path.join("server", "app", "games", "[slug]", "page_client-reference-manifest.js"),
    'globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/games/[slug]/page"]=' +
      JSON.stringify({
        moduleLoading: { prefix: "/_next/" },
        entryJSFiles: { "[project]/src/app/games/[slug]/page": ["static/chunks/page.js"] },
      }) +
      ";",
  );
  chunk("static/chunks/poster.js", 2);
  chunk("static/chunks/game.js", 40, '"failover:gfx";');
  chunk("static/chunks/three.js", 100);
  chunk("static/chunks/shared.js", 30);
  chunk("static/chunks/hextris.js", 20);
  write("static/chunks/hextris.css", "a{}");
  return dist;
}

function readChunk(name) {
  return readFileSync(path.join(dist, "static", "chunks", name));
}

describe("check-bundle-budget", () => {
  it("has the plan's 420 KB budget", () => {
    expect(BUDGET_BYTES).toBe(420 * 1024);
  });

  it("finds the game's chunks by key, without the route's first-load chunks or other games", () => {
    turbopackBuild();
    expect(gameChunkFiles(dist)).toEqual([
      "static/chunks/game.js",
      "static/chunks/poster.js",
      "static/chunks/three.js",
    ]);
  });

  it("reads the first-load chunks from the build manifest and the client reference manifest", () => {
    turbopackBuild();
    expect([...firstLoadFiles(dist)].sort()).toEqual([
      "static/chunks/main.js",
      "static/chunks/page.js",
      "static/chunks/polyfills.js",
      "static/chunks/shared.js",
    ]);
  });

  it("falls back to the marker string when the keys do not name the game", () => {
    turbopackBuild({ keys: "ids" });
    expect(gameChunkFiles(dist)).toEqual(["static/chunks/game.js", "static/chunks/three.js"]);
  });

  it("sums the gzip sizes and passes under the budget", () => {
    turbopackBuild();
    const result = checkBudget({ dist });
    const expected = ["game.js", "poster.js", "three.js"].reduce(
      (sum, f) => sum + gzipSync(readChunk(f), { level: 9 }).length,
      0,
    );
    expect(result.total).toBe(expected);
    expect(result.ok).toBe(true);
    expect(result.files.map((f) => f.file)).toHaveLength(3);
  });

  it("fails over the budget", () => {
    turbopackBuild();
    expect(checkBudget({ dist, budget: 100 * 1024 }).ok).toBe(false);
  });

  it("reads the webpack layout too", () => {
    turbopackBuild();
    rmSync(path.join(dist, ...PAGE_DIR), { recursive: true });
    write(
      "react-loadable-manifest.json",
      JSON.stringify({
        "components/game/failover/poster.tsx -> ../failover": {
          id: 5,
          files: ["static/chunks/game.js", "static/chunks/three.js"],
        },
      }),
    );
    expect(gameChunkFiles(dist)).toEqual(["static/chunks/game.js", "static/chunks/three.js"]);
  });

  it("fails loudly when there is no manifest, or nothing loads the game", () => {
    turbopackBuild();
    rmSync(path.join(dist, ...PAGE_DIR), { recursive: true });
    expect(() => gameChunkFiles(dist)).toThrow(/no react-loadable-manifest\.json/);

    write(
      path.join(...PAGE_DIR, "react-loadable-manifest.json"),
      JSON.stringify({ "x -> ./hextris": { id: 1, files: ["static/chunks/hextris.js"] } }),
    );
    expect(() => gameChunkFiles(dist)).toThrow(/no entry .* loads Failover/);
  });

  it("fails when a listed chunk is missing from disk", () => {
    turbopackBuild();
    rmSync(path.join(dist, "static", "chunks", "three.js"));
    expect(() => checkBudget({ dist })).toThrow(
      /listed chunk static\/chunks\/three\.js is missing/,
    );
  });

  it("runs as a CLI: exit 0 with the file list, exit 1 when it cannot measure", () => {
    turbopackBuild();
    const ok = spawnSync(process.execPath, [SCRIPT, "--dist", dist], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/static\/chunks\/three\.js/);
    expect(ok.stdout).toMatch(/Failover game chunks: [\d.]+ KB gzip \(budget 420\.0 KB\)/);

    rmSync(path.join(dist, ...PAGE_DIR), { recursive: true });
    const bad = spawnSync(process.execPath, [SCRIPT, "--dist", dist], { encoding: "utf8" });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/no react-loadable-manifest\.json/);
  });
});
