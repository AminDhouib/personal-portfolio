// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GAME_CONTENT } from "..";

// The engine is a clean-room rewrite (docs/specs/2026-10-hextris-engine-behaviour.md), so
// Hextris is credited as the inspiration rather than as the licensed source.
describe("Hextris credits", () => {
  const credits = GAME_CONTENT.hextris.credits;
  const text = JSON.stringify(credits);

  it("credit Hextris as the inspiration and link the upstream", () => {
    expect(text).toMatch(/Inspired by Hextris \(Logan Engstrom et al\.\)/);
    expect(credits.some((c) => c.href === "https://github.com/Hextris/hextris")).toBe(true);
  });

  it("no longer claim the GPL or offer this repo as the game's source", () => {
    expect(text).not.toMatch(/GPL/);
    expect(credits.some((c) => c.href?.includes("AminDhouib/personal-portfolio"))).toBe(false);
  });
});
