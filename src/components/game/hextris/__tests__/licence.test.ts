// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// While Hextris contains code derived from the GPL-3.0 Hextris project, every
// derived file carries the notice and the licence text ships beside it.
const DIR = join(process.cwd(), "src", "components", "game");
const DERIVED = ["hextris.tsx", "hextris/logic.ts", "hextris/types.ts"];

describe("Hextris GPL-3.0 notices", () => {
  it("ships the GPL-3.0 text", () => {
    const text = readFileSync(join(DIR, "hextris", "COPYING"), "utf8");
    expect(text).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  });

  it("ships a NOTICE naming the upstream and the source", () => {
    const text = readFileSync(join(DIR, "hextris", "NOTICE.md"), "utf8");
    expect(text).toMatch(/github\.com\/Hextris\/hextris/);
    expect(text).toMatch(/GPL-3\.0/);
    expect(text).toMatch(/NO WARRANTY|no warranty/i);
  });

  it.each(DERIVED)("%s carries the licence header", (file) => {
    const head = readFileSync(join(DIR, file), "utf8").slice(0, 600);
    expect(head).toMatch(/SPDX-License-Identifier: GPL-3\.0-only/);
    expect(head).toMatch(/Copyright \(C\) 2018 Logan Engstrom/);
    expect(head).toMatch(/Modified by Amin Dhouib, 2026/);
  });

  it("lists every site module hextris.tsx imports in NOTICE.md", () => {
    const src = readFileSync(join(DIR, "hextris.tsx"), "utf8");
    const notice = readFileSync(join(DIR, "hextris", "NOTICE.md"), "utf8");
    const specs = [...src.matchAll(/^import[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1] as string);
    const site = specs
      .filter((s) => s.startsWith("@/") || (s.startsWith("./") && !s.startsWith("./hextris/")))
      .map((s) => (s.startsWith("@/") ? `src/${s.slice(2)}` : `src/components/game/${s.slice(2)}`));
    expect(site.length).toBeGreaterThan(0);
    for (const mod of site) expect(notice, mod).toContain(mod);
  });
});
