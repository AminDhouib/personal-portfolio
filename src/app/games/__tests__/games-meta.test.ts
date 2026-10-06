import { describe, expect, it } from "vitest";
import { GAMES } from "../games-meta";

describe("GAMES featured flag", () => {
  it("flags exactly one game, and it is a public one", () => {
    const featured = GAMES.filter((game) => game.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0]?.hidden).toBeUndefined();
  });

  it("features Orbital Dodge", () => {
    expect(GAMES.find((game) => game.featured)?.slug).toBe("space-shooter");
  });

  it("keeps the registry order, so the flag is not what orders the cards", () => {
    expect(GAMES.map((game) => game.slug)).toEqual([
      "space-shooter",
      "hextris",
      "tower-stacker",
      "typing-speed",
      "super-voltorb-flip",
      "password-game",
    ]);
  });
});
