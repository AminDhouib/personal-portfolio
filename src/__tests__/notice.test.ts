// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const notice = readFileSync(path.join(process.cwd(), "NOTICE"), "utf8");
const start = notice.indexOf("Script Knight\n-------------");
const section = start === -1 ? "" : (notice.slice(start).split(/\n\n\n(?=\S)/)[0] ?? "");

describe("NOTICE: Script Knight", () => {
  it("has its own section", () => {
    expect(start).toBeGreaterThan(-1);
  });

  it("names the WarriorJS source, its commit and its MIT licence", () => {
    expect(section).toContain("https://github.com/olistic/warriorjs");
    expect(section).toContain("bc68e87");
    expect(section).toContain("Copyright (c) 2015-present Matias Olivera");
    expect(section).toMatch(/MIT/);
    expect(section).toContain("src/components/game/script-knight/engine/LICENSE");
  });

  it("says what was modified, and credits ruby-warrior as the original idea only", () => {
    expect(section).toMatch(/modified by Amin Dhouib/i);
    expect(section).toContain("https://github.com/ryanb/ruby-warrior");
    expect(section).toMatch(/no ruby-warrior code/i);
  });

  it("says the WarriorJS logo is not used", () => {
    expect(section).toMatch(/logo\s+is\s+not\s+used/i);
  });
});
