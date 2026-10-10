import { describe, expect, it } from "vitest";
import { GAMES } from "@/app/games/games-meta";
import { ARCADE_GAME_SLUGS } from "@/lib/arcade/games";
import { TODAY_SOURCES } from "../today-sources";

describe("TODAY_SOURCES", () => {
  it("lists Password Game 2, Orbital Dodge, Hextris, Super Voltorb Flip, Tower Stacker, Typing Speed, Script Knight and Failover, in that order", () => {
    expect(TODAY_SOURCES.map((source) => [source.slug, source.kind])).toEqual([
      ["password-game", "pg2"],
      ["space-shooter", "arcade"],
      ["hextris", "arcade"],
      ["super-voltorb-flip", "arcade"],
      ["tower-stacker", "arcade"],
      ["typing-speed", "arcade"],
      ["script-knight", "arcade"],
      ["failover", "arcade"],
    ]);
  });

  it("only names public, non-hidden games", () => {
    for (const source of TODAY_SOURCES) {
      const game = GAMES.find((candidate) => candidate.slug === source.slug);
      expect(game, source.slug).toBeDefined();
      expect(game?.hidden, source.slug).toBeUndefined();
    }
  });

  it("only asks the arcade API about arcade games", () => {
    const arcadeSlugs: readonly string[] = ARCADE_GAME_SLUGS;
    for (const source of TODAY_SOURCES.filter((candidate) => candidate.kind === "arcade")) {
      expect(arcadeSlugs).toContain(source.slug);
    }
  });

  it("uses the pg2 kind for Password Game 2 only", () => {
    const pg2 = TODAY_SOURCES.filter((source) => source.kind === "pg2");
    expect(pg2.map((source) => source.slug)).toEqual(["password-game"]);
  });
});
