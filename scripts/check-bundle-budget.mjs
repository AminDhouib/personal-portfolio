#!/usr/bin/env node
/**
 * Bundle budget: Failover's lazily loaded game (its sim, scene and three.js)
 * must stay under 420 KB of gzipped JavaScript. Runs in CI after
 * `pnpm build`; it needs the build output, so it never runs locally.
 *
 * What it reads from the Next 16 build output (Turbopack, the default
 * `next build`; the webpack layout is read too, as a fallback):
 *
 *   .next/server/app/games/[slug]/page/react-loadable-manifest.json
 *       Turbopack writes one per app page. Each key is a next/dynamic call
 *       site, each value `{ id, files }` lists the chunks that call loads
 *       (paths relative to .next, such as "static/chunks/abc123.js").
 *       Webpack builds write a single .next/react-loadable-manifest.json.
 *   .next/build-manifest.json
 *       `rootMainFiles` and `polyfillFiles`: chunks every page loads first.
 *   .next/server/app/games/[slug]/page_client-reference-manifest.js
 *       `entryJSFiles`: the route's own first-load chunks.
 *   .next/static/chunks/...
 *       The chunk files themselves, gzipped here (level 9) to measure.
 *
 * The game's chunk group is every loadable entry whose key names "failover",
 * or whose chunks contain the game's own marker string (the graphics
 * preference key, which only the game code carries), minus the chunks the
 * route already loaded at first paint. Finding no such entry fails the check:
 * either the lazy boundary is gone or the build layout changed, and both need
 * a person to look.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

export const BUDGET_BYTES = 420 * 1024;
const PAGE = "/games/[slug]/page";
const KEY_MATCH = /failover/i;
const MARKER = "failover:gfx";

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`check-bundle-budget: cannot read ${file}: ${err.message}`, { cause: err });
  }
}

/** The route's loadable manifest: Turbopack's per-page file, else webpack's single one. */
export function readLoadableManifest(dist, page = PAGE) {
  const turbopack = path.join(dist, "server", "app", page, "react-loadable-manifest.json");
  if (existsSync(turbopack)) return { file: turbopack, manifest: readJson(turbopack) };
  const webpack = path.join(dist, "react-loadable-manifest.json");
  if (existsSync(webpack)) return { file: webpack, manifest: readJson(webpack) };
  throw new Error(
    `check-bundle-budget: no react-loadable-manifest.json at ${turbopack} or ${webpack}. ` +
      "Did the build run, or did Next change its output layout?",
  );
}

/** Chunks the route loads before any dynamic import: shared root chunks plus its own entry. */
export function firstLoadFiles(dist, page = PAGE) {
  const files = new Set();
  const build = readJson(path.join(dist, "build-manifest.json"));
  for (const f of [...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]) files.add(f);

  const crm = path.join(dist, "server", "app", `${page}_client-reference-manifest.js`);
  if (existsSync(crm)) {
    const sandbox = {};
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    vm.runInNewContext(readFileSync(crm, "utf8"), sandbox, { timeout: 1000 });
    const entry = sandbox.__RSC_MANIFEST?.[page];
    for (const list of Object.values(entry?.entryJSFiles ?? {})) {
      for (const f of list) files.add(f);
    }
  } else {
    console.warn(`check-bundle-budget: no ${crm}; measuring without subtracting the route's entry`);
  }
  return files;
}

function chunkText(dist, file) {
  const full = path.join(dist, file);
  return existsSync(full) ? readFileSync(full) : null;
}

/** The game's chunk group: JS files of the matching loadable entries, minus first-load chunks. */
export function gameChunkFiles(dist, page = PAGE) {
  const { file, manifest } = readLoadableManifest(dist, page);
  const matched = new Set();
  for (const [key, entry] of Object.entries(manifest)) {
    const files = entry?.files ?? [];
    const byKey = KEY_MATCH.test(key);
    const byMarker = !byKey && files.some((f) => chunkText(dist, f)?.includes(MARKER) ?? false);
    if (byKey || byMarker) for (const f of files) matched.add(f);
  }
  if (matched.size === 0) {
    throw new Error(
      `check-bundle-budget: no entry in ${file} loads Failover (no key matching ${KEY_MATCH}, ` +
        `no chunk containing "${MARKER}"). The lazy boundary may be gone, or the layout changed.`,
    );
  }
  const first = firstLoadFiles(dist, page);
  return [...matched].filter((f) => f.endsWith(".js") && !first.has(f)).sort();
}

/** Measure the group against the budget. */
export function checkBudget({ dist = ".next", page = PAGE, budget = BUDGET_BYTES } = {}) {
  const files = gameChunkFiles(dist, page).map((file) => {
    const buf = chunkText(dist, file);
    if (buf === null) throw new Error(`check-bundle-budget: listed chunk ${file} is missing`);
    return { file, gzip: gzipSync(buf, { level: 9 }).length };
  });
  const total = files.reduce((sum, f) => sum + f.gzip, 0);
  return { ok: total <= budget, total, budget, files };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function main(argv) {
  const at = argv.indexOf("--dist");
  const dist = at >= 0 ? argv[at + 1] : ".next";
  try {
    const result = checkBudget({ dist });
    for (const f of result.files) console.log(`  ${kb(f.gzip).padStart(9)}  ${f.file}`);
    const line = `Failover game chunks: ${kb(result.total)} gzip (budget ${kb(result.budget)})`;
    if (result.ok) {
      console.log(`check-bundle-budget: ${line}.`);
    } else {
      console.error(`OVER BUDGET: ${line}.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
