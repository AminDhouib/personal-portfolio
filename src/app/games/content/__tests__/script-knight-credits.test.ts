// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GAME_CONTENT } from "..";

// The engine and tower data are a port of WarriorJS (MIT), itself after ruby-warrior (MIT).
describe("Script Knight credits", () => {
  const credits = GAME_CONTENT["script-knight"].credits;

  it("credit WarriorJS as the ported source and link it", () => {
    const entry = credits.find((c) => c.href === "https://github.com/olistic/warriorjs");
    expect(entry?.detail).toMatch(/Ported from WarriorJS by Matias Olivera \(MIT\)/);
  });

  it("credit ruby-warrior as the original idea and link it", () => {
    const entry = credits.find((c) => c.href === "https://github.com/ryanb/ruby-warrior");
    expect(entry?.detail).toMatch(/Original idea: ruby-warrior by Ryan Bates \(MIT\)/);
  });

  it("do not link the WarriorJS logo or site", () => {
    const text = JSON.stringify(credits);
    expect(text).not.toMatch(/warriorjs\.com/i);
    expect(text).not.toMatch(/logo/i);
  });

  it("credit this site only for what it wrote", () => {
    const own = credits.find((c) => /Amin Dhouib/.test(c.detail));
    expect(own?.detail).toMatch(/sandbox/);
  });
});
