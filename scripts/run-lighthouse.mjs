#!/usr/bin/env node
/**
 * Lighthouse gate over every publicly facing page. The URL list is derived
 * from the running server's /sitemap.xml (single source of truth — a new
 * public page enters the audit the moment it enters the sitemap), plus the
 * public routes deliberately kept out of the sitemap (EXTRA_PATHS).
 *
 * Usage: node scripts/run-lighthouse.mjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000 (the CI standalone server).
 *
 * Assertions live in scripts/lighthouserc.json: SEO and accessibility are
 * error-level floors (calibrated from measured scores, ratchet-style —
 * raise them when real scores rise, never lower them to make CI pass);
 * performance and best-practices are warn-only because CI runner timing is
 * too noisy for a hard perf floor.
 *
 * Calibration baseline (2026-08-03, all 20 public pages, prod build): SEO
 * 1.0 on every page; accessibility min 0.95 (/blog); best-practices min
 * 0.96; performance min 0.51 (homepage, local machine). Floors sit just
 * under those minimums.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const CANONICAL_ORIGIN = "https://amindhou.com";
// Public pages not listed in the sitemap but still crawlable/linkable.
const EXTRA_PATHS = ["/ai"];

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const res = await fetch(`${base}/sitemap.xml`);
if (!res.ok) {
  console.error(`run-lighthouse: GET ${base}/sitemap.xml -> ${res.status}`);
  process.exit(1);
}
const xml = await res.text();

const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (locs.length === 0) {
  console.error("run-lighthouse: sitemap.xml contained no <loc> entries");
  process.exit(1);
}

const urls = [
  ...locs.map((loc) => loc.replace(CANONICAL_ORIGIN, base)),
  ...EXTRA_PATHS.map((p) => `${base}${p}`),
];

console.log(`run-lighthouse: auditing ${urls.length} URLs from ${base}`);
for (const url of urls) console.log(`  ${url}`);

const configPath = path.join("scripts", "lighthouserc.json");
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "lhci",
    "autorun",
    `--config=${configPath}`,
    ...urls.map((url) => `--collect.url=${url}`),
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
