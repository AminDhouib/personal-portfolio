import { describe, it, expect } from "vitest";
import { GAMES } from "@/app/games/games-meta";
import { GAME_CLIENT } from "../registry";

describe("GAME_CLIENT", () => {
  it("registers exactly the games in GAMES", () => {
    expect(Object.keys(GAME_CLIENT).sort()).toEqual(GAMES.map((g) => g.slug).sort());
  });

  it.each(GAMES.map((g) => [g.slug, g] as const))(
    "%s has a banner, and a renderer unless it has its own route",
    (_slug, game) => {
      const entry = GAME_CLIENT[game.slug];
      expect(entry.Banner).toBeTypeOf("function");
      // password-game has its own top-level route and never renders through GameLoader.
      if (game.external) expect(entry.render).toBeNull();
      else expect(entry.render).toBeTypeOf("function");
    },
  );
});
