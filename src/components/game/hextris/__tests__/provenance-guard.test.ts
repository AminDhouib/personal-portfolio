import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { describe, it, expect } from "vitest";

// Provenance guard for the clean-room Hextris engine (PR T5-3,
// docs/specs/2026-10-hextris-engine-behaviour.md). The engine was rewritten from a behaviour
// spec without reading the upstream source; this fails if any file under hextris/ or the shell
// component carries an upstream identifier or tuning constant. Modelled on
// super-voltorb-flip/__tests__/assets-guard.test.ts. This file is excluded from its own scan.
// The plan's `wavegen`, `doesBlockCollide` and `angularVelocityConst` were dropped from the list
// because they match nothing in the upstream source; every remaining entry hits the pre-T5-3 shell.

const ROOT = process.cwd();
const GAME_DIR = join(ROOT, "src", "components", "game", "hextris");
const SHELL = join(ROOT, "src", "components", "game", "hextris.tsx");
const SELF = join(GAME_DIR, "__tests__", "provenance-guard.test.ts");

const DENYLIST: readonly RegExp[] = [
  /\bwaveGen\b/,
  /\bconsolidateBlocks\b/,
  /\bfloodFill\b/,
  /\bcomboTime\b/,
  /\bcreationSpeedModifier\b/,
  /\bnextGen\b/,
  /\blastGen\b/,
  /\bdistFromHex\b/,
  /\bmainhex\b/i,
  /\bfadeUpAndOut\b/,
  /\bcalcSide\b/,
  /\bdrawTimer\b/,
  /\brandInt\b/,
  /\brotatePoint\b/,
  /\bblockHeight\b/,
  /\bstartDist\b/,
  /\bcreationDt\b/,
  /\btrueCanvas\b/,
  /\bcomboMultiplier\b/,
  /\blastCombo\b/,
  /\bfloodSearch\b/,
  /\bfindCenterOfBlocks\b/,
  /\bfallingLane\b/,
  /\battachedLane\b/,
  /\bspeedModifier\b/,
  /\bangularVelocity\b/,
  /\btargetAngle\b/,
  /\baddNewBlock\b/,
  /\bisInfringing\b/,
  /\bwidthWide\b/,
  /\bwg[A-Z]\w*/,
  /\bhex(AddBlock|Rotate|Draw|DoesBlockCollide)\b/,
  /\b5166667\b/,
  /\b72333333\b/,
  /\b90000000\b/,
  /\b2700\b/,
  /\b1300\b/,
  /\b16\.666667\b/,
  /\b0\.085\b/,
];

/** The denylist patterns that occur in `text`, as their source strings. */
function denylistHits(text: string): string[] {
  return DENYLIST.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** `file: pattern` for every hit, so a failure names the file without echoing its content. */
function scan(files: string[]): string[] {
  return files
    .filter((file) => file !== SELF)
    .flatMap((file) =>
      denylistHits(readFileSync(file, "utf8")).map(
        (hit) => `${relative(ROOT, file).replaceAll("\\", "/")}: ${hit}`,
      ),
    );
}

describe("provenance matcher", () => {
  it("bites on a denylisted identifier in a synthetic string", () => {
    expect(denylistHits("const floodFill = (b) => b;")).toEqual(["\\bfloodFill\\b"]);
    expect(denylistHits("let wgSpeed = 1; hexRotate(1);")).toHaveLength(2);
  });

  it("matches the board object in either casing", () => {
    expect(denylistHits("mainHex.sides")).toEqual(["\\bmainhex\\b"]);
    expect(denylistHits("MainHex.sides")).toEqual(["\\bmainhex\\b"]);
  });

  it("bites on each of the upstream's most used identifiers", () => {
    const names = [
      "trueCanvas",
      "comboMultiplier",
      "lastCombo",
      "floodSearch",
      "findCenterOfBlocks",
      "fallingLane",
      "attachedLane",
      "speedModifier",
      "angularVelocity",
      "targetAngle",
      "addNewBlock",
      "isInfringing",
      "widthWide",
    ];
    for (const name of names) expect(denylistHits(`x.${name} = 1;`), name).toHaveLength(1);
  });

  it("bites on a denylisted constant but not on a longer number containing it", () => {
    expect(denylistHits("const t = 2700;")).toEqual(["\\b2700\\b"]);
    expect(denylistHits("speed *= 0.085")).toEqual(["\\b0\\.085\\b"]);
    expect(denylistHits("const t = 12700; const u = 0.0855; const v = 13000;")).toEqual([]);
  });

  it("passes the clean-room vocabulary", () => {
    expect(denylistHits("advance(state, ms); findGroup(sides, side, row); TICK_MS")).toEqual([]);
  });
});

describe("file scan", () => {
  it("reports a hit in a real file, naming the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "hx-guard-"));
    try {
      const file = join(dir, "probe.ts");
      writeFileSync(file, "export const comboTime = 1;\n");
      expect(walk(dir)).toEqual([file]);
      const hits = scan(walk(dir));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain(basename(file));
      expect(hits[0]).toContain("comboTime");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips only this file, which does carry the denylisted names", () => {
    expect(denylistHits(readFileSync(SELF, "utf8")).length).toBeGreaterThan(0);
    expect(scan([SELF])).toEqual([]);
  });
});

describe("clean-room engine and painter", () => {
  it("carry no upstream identifier or tuning constant", () => {
    const files = ["engine", "render"].flatMap((dir) => walk(join(GAME_DIR, dir)));
    expect(files.length).toBeGreaterThan(10);
    expect(scan(files)).toEqual([]);
  });
});

describe("whole Hextris game", () => {
  it("carries no upstream identifier or tuning constant", () => {
    expect(existsSync(SHELL)).toBe(true);
    expect(scan([...walk(GAME_DIR), SHELL])).toEqual([]);
  });
});
