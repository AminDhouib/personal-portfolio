// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GAME_CONTENT } from "..";

describe("Hextris credits", () => {
  it("credit the Hextris authors and its GPL-3.0 licence", () => {
    const credits = GAME_CONTENT.hextris.credits;
    const text = JSON.stringify(credits);
    expect(text).toMatch(/Logan Engstrom/);
    expect(text).toMatch(/Garrett Finucane/);
    expect(text).toMatch(/Noah Moroze/);
    expect(text).toMatch(/Michael Yang/);
    expect(text).toMatch(/GPL-3\.0/);
    expect(credits.some((c) => c.href === "https://github.com/Hextris/hextris")).toBe(true);
  });

  it("point at the source of this modified version (GPL section 6)", () => {
    const credits = GAME_CONTENT.hextris.credits;
    expect(
      credits.some((c) =>
        c.href?.startsWith(
          "https://github.com/AminDhouib/personal-portfolio/tree/main/src/components/game/hextris",
        ),
      ),
    ).toBe(true);
  });
});
