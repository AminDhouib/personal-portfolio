import { describe, expect, it } from "vitest";
import { GAME_CONTENT } from "@/app/games/content";
import { GAMES } from "@/app/games/games-meta";
import { hubTags } from "../hub-tags";

const MODE_LABELS = ["Single player", "Multiplayer", "Co-op"];

describe("hubTags", () => {
  const tags = hubTags();

  it("has tags for every public game and none for a hidden one", () => {
    for (const game of GAMES) {
      if (game.hidden) expect(tags[game.slug], game.slug).toBeUndefined();
      else expect(tags[game.slug]?.length, game.slug).toBeGreaterThan(0);
    }
  });

  it("starts with the game's genre and ends with its play mode, at most three chips", () => {
    for (const game of GAMES.filter((candidate) => !candidate.hidden)) {
      const chips = tags[game.slug] ?? [];
      expect(chips[0], game.slug).toBe(GAME_CONTENT[game.slug].genre[0]);
      expect(MODE_LABELS, game.slug).toContain(chips[chips.length - 1]);
      expect(chips.length, game.slug).toBeLessThanOrEqual(3);
    }
  });

  it("labels Orbital Dodge from its content", () => {
    expect(tags["space-shooter"]).toEqual(["Arcade", "Shooter", "Single player"]);
  });

  it("is plain serializable data", () => {
    expect(JSON.stringify(tags)).toContain("Single player");
  });
});
