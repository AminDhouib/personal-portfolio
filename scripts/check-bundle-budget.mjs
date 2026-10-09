#!/usr/bin/env node
/**
 * Bundle budget: Failover's lazily loaded game (its sim, scene and three.js)
 * must stay between 100 KB and 420 KB of gzipped JavaScript. Runs in CI after
 * `pnpm build`; it needs the build output, so it never runs locally.
 *
 * How the game is found. `next build` here is Turbopack (Next 16's default;
 * the CI log prints "Next.js 16.3.8 (Turbopack)"). The game is behind two
 * `dynamic(..., { ssr: false })` calls (registry -> poster -> game), and
 * Turbopack leaves ssr:false imports out of the server graph, so the route's
 * react-loadable-manifest.json never lists them (CI run 37922118756 showed
 * exactly that). The client chunks do: Turbopack compiles each import() to an
 * async loader in the parent chunk that fetches a string list of chunk paths,
 *   e.v(t=>Promise.all(["static/chunks/a.js","static/chunks/b.js"].map(t=>e.l(t))).then(...))
 * (the runtime's `l` loads a "static/chunks/..." path; see Next's prebuilt
 * dist/bundle-analyzer chunks for the runtime). So:
 *
 *   1. .next/static/chunks/**.js: the chunk that contains "failover:gfx" (the
 *      graphics preference key, which only the game's code carries) is the
 *      game's own chunk.
 *   2. The same files: every async loader list (the array literal around a
 *      "static/chunks/..." path, whether of strings or of {path, included}
 *      objects; an entry's `otherChunks` is skipped) that names the game's
 *      chunk is the game's chunk group, the set fetched on Play.
 *   3. .next/build-manifest.json (`rootMainFiles`, `polyfillFiles`) and
 *      .next/server/app/games/[slug]/page_client-reference-manifest.js
 *      (`entryJSFiles`): chunks the route already loaded, which Play does not
 *      fetch again; they are subtracted.
 *   4. What is left is gzipped (level 9) and summed.
 *
 * It fails when the game's chunk or its loader list cannot be found, when the
 * game's chunk is part of the route's first load (the lazy boundary is gone),
 * when the total is over 420 KB, and when it is under 100 KB (three.js alone
 * is more, so a smaller group means the measurement found the wrong thing).
 * On failure it prints the layout it saw, for the next CI log.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

export const BUDGET_BYTES = 420 * 1024;
export const FLOOR_BYTES = 100 * 1024;
const PAGE = "/games/[slug]/page";
const MARKER = "failover:gfx";
const CHUNKS_DIR = path.join("static", "chunks");

// A chunk path as the client runtime loads it: "static/chunks/..." (optionally with the
// /_next/ base). Async loaders list them as plain strings or, with module chunks, as
// {path:"static/chunks/...",included:[...]} objects.
const ONE_PATH = /["'](?:\/_next\/)?(static\/chunks\/[^"'\\\s]+)["']/g;
/** An async list is small; a bracket further out than this is a chunk's module array. */
const MAX_LIST_CHARS = 20_000;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`check-bundle-budget: cannot read ${file}: ${err.message}`, { cause: err });
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Every client JS chunk, as "static/chunks/..." paths relative to the dist dir. */
function chunkFiles(dist) {
  const dir = path.join(dist, CHUNKS_DIR);
  const files = walk(dir).filter((f) => f.endsWith(".js"));
  if (files.length === 0) {
    throw new Error(`check-bundle-budget: no .js files under ${dir}. Did the build run?`);
  }
  return files.map((f) => path.relative(dist, f).split(path.sep).join("/"));
}

const read = (dist, rel) => readFileSync(path.join(dist, rel), "utf8");

/** [start, end) of the innermost array literal around index i, or null. */
function enclosingArray(text, i) {
  let depth = 0;
  let start = -1;
  for (let j = i - 1; j >= Math.max(0, i - MAX_LIST_CHARS); j--) {
    if (text[j] === "]") depth++;
    else if (text[j] === "[") {
      if (depth === 0) {
        start = j;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let j = start; j < Math.min(text.length, start + MAX_LIST_CHARS); j++) {
    if (text[j] === "[") depth++;
    else if (text[j] === "]" && --depth === 0) return [start, j + 1];
  }
  return null;
}

/**
 * The async loader chunk lists in every chunk: { in: the chunk holding it, chunks: [paths] }.
 * Each is the innermost array literal around a chunk path, so a list of strings and a list
 * of {path, included} objects read the same. An entry's `otherChunks` is the page's first
 * load, not a lazy load, and is skipped.
 */
export function asyncChunkLists(dist) {
  const lists = [];
  for (const file of chunkFiles(dist)) {
    const text = read(dist, file);
    const seen = new Set();
    for (const match of text.matchAll(ONE_PATH)) {
      const range = enclosingArray(text, match.index);
      if (!range || seen.has(range[0])) continue;
      seen.add(range[0]);
      if (/otherChunks\s*:\s*$/.test(text.slice(Math.max(0, range[0] - 40), range[0]))) continue;
      const body = text.slice(range[0], range[1]);
      const chunks = [...new Set([...body.matchAll(ONE_PATH)].map((m) => m[1]))];
      lists.push({ in: file, chunks });
    }
  }
  return lists;
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

/** The chunks that carry the game's marker string. */
function markerChunks(dist) {
  return chunkFiles(dist).filter((f) => read(dist, f).includes(MARKER));
}

/** The game's chunk group: every async list that loads a marker chunk, minus first-load chunks. */
export function gameChunkFiles(dist, page = PAGE) {
  const markers = markerChunks(dist);
  if (markers.length === 0) {
    throw new Error(
      `check-bundle-budget: no chunk under static/chunks contains "${MARKER}". ` +
        "The game is not in the client build, or its marker string changed.",
    );
  }
  const group = new Set();
  for (const list of asyncChunkLists(dist)) {
    if (list.chunks.some((c) => markers.includes(c))) for (const c of list.chunks) group.add(c);
  }
  if (group.size === 0) {
    throw new Error(
      `check-bundle-budget: no async chunk list loads ${markers.join(", ")}. ` +
        "The game may be in a first-load chunk (the lazy boundary is gone), or Turbopack " +
        "changed how an import() names its chunks.",
    );
  }
  const first = firstLoadFiles(dist, page);
  return [...group].filter((f) => f.endsWith(".js") && !first.has(f)).sort();
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Measure the group against the budget and the floor. */
export function checkBudget({
  dist = ".next",
  page = PAGE,
  budget = BUDGET_BYTES,
  floor = FLOOR_BYTES,
} = {}) {
  const markers = markerChunks(dist);
  const files = gameChunkFiles(dist, page).map((file) => {
    const full = path.join(dist, file);
    if (!existsSync(full)) throw new Error(`check-bundle-budget: listed chunk ${file} is missing`);
    return { file, gzip: gzipSync(readFileSync(full), { level: 9 }).length };
  });
  const total = files.reduce((sum, f) => sum + f.gzip, 0);
  const problems = [];
  if (!files.some((f) => markers.includes(f.file))) {
    problems.push(
      "the game's own chunk is part of the route's first load: the lazy boundary is gone",
    );
  }
  if (total > budget) problems.push(`${kb(total)} is over the budget of ${kb(budget)}`);
  if (total < floor) {
    problems.push(
      `${kb(total)} is under the ${kb(floor)} floor: three.js alone is more, so this is not the game`,
    );
  }
  return { ok: problems.length === 0, total, budget, files, problems };
}

/** What the build output looks like, for the CI log when the check cannot find its way. */
export function diagnostics(dist) {
  const lines = [];
  const gamesDir = path.join(dist, "server", "app", "games");
  const manifests = walk(gamesDir).filter((f) => /manifest/i.test(path.basename(f)));
  lines.push(`manifest files under ${gamesDir}: ${manifests.length}`);
  for (const file of manifests) {
    lines.push(`  ${path.relative(dist, file)}`);
    if (file.endsWith(".json")) {
      try {
        const keys = Object.keys(JSON.parse(readFileSync(file, "utf8")));
        for (const key of keys.slice(0, 20)) lines.push(`      ${key}`);
        if (keys.length > 20) lines.push(`      ... ${keys.length - 20} more`);
      } catch {
        lines.push("      (not JSON)");
      }
    }
  }
  try {
    const markers = markerChunks(dist);
    lines.push(`chunks containing "${MARKER}": ${markers.join(", ") || "none"}`);
    const lists = asyncChunkLists(dist);
    lines.push(`async chunk lists found: ${lists.length}`);
    for (const list of lists.filter((l) => l.chunks.some((c) => markers.includes(c)))) {
      lines.push(`  in ${list.in}: ${list.chunks.join(", ")}`);
    }
  } catch (err) {
    lines.push(err.message);
  }
  return lines.join("\n");
}

function main(argv) {
  const at = argv.indexOf("--dist");
  const dist = at >= 0 ? argv[at + 1] : ".next";
  try {
    const result = checkBudget({ dist });
    for (const f of result.files) console.log(`  ${kb(f.gzip).padStart(9)}  ${f.file}`);
    const line = `Failover game chunks: ${kb(result.total)} gzip (budget ${kb(result.budget)})`;
    if (result.ok) {
      console.log(`check-bundle-budget: ${line}.`);
      return;
    }
    console.error(`check-bundle-budget FAILED: ${line}: ${result.problems.join("; ")}.`);
  } catch (err) {
    console.error(err.message);
  }
  console.error(diagnostics(dist));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
