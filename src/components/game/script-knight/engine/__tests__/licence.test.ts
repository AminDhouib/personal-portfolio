// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The engine is ported from WarriorJS (MIT). The licence text ships beside it and every
// ported file names the upstream file it came from.
const DIR = join(process.cwd(), "src", "components", "game", "script-knight", "engine");
const PORTED = [
  "spatial.ts",
  "abilities.ts",
  "units.ts",
  "effects.ts",
  "scoring.ts",
  "towers/narrow-path.ts",
  "towers/powder-keep.ts",
  ...readdirSync(join(DIR, "core"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `core/${f}`),
];

describe("WarriorJS MIT notices", () => {
  it("ships the MIT text with the upstream copyright", () => {
    const text = readFileSync(join(DIR, "LICENSE"), "utf8");
    expect(text).toMatch(/Copyright \(c\) 2015-present Matias Olivera/);
    expect(text).toMatch(/Permission is hereby granted, free of charge/);
  });

  it("credits ruby-warrior and Ryan Bates next to WarriorJS", () => {
    const text = readFileSync(join(DIR, "LICENSE"), "utf8");
    expect(text).toMatch(/ruby-warrior by Ryan Bates/);
    expect(text).toMatch(/MIT License/);
  });

  it("covers every file in core/", () => {
    expect(PORTED.filter((f) => f.startsWith("core/")).length).toBeGreaterThanOrEqual(9);
  });

  it.each(PORTED)("%s carries the port header", (file) => {
    const head = readFileSync(join(DIR, file), "utf8").slice(0, 500);
    expect(head).toMatch(
      /Ported from WarriorJS \(https:\/\/github\.com\/olistic\/warriorjs, bc68e87\)/,
    );
    expect(head).toMatch(/MIT/);
    expect(head).toMatch(/Modified by Amin Dhouib, 2026/);
  });
});
