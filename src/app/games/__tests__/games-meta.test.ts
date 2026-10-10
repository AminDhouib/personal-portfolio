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
      "script-knight",
      "failover",
    ]);
  });

  it("lists Script Knight publicly, without the featured flag", () => {
    const knight = GAMES.find((game) => game.slug === "script-knight");
    expect(knight?.hidden).toBeUndefined();
    expect(knight?.featured).toBeUndefined();
    expect(knight?.accent).toBe("#4ade80");
  });

  it("keeps Failover out of every public list until it launches", () => {
    const failover = GAMES.find((game) => game.slug === "failover");
    expect(failover?.hidden).toBe(true);
    expect(failover?.featured).toBeUndefined();
  });
});
