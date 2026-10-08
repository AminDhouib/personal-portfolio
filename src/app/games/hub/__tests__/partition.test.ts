import { describe, expect, it } from "vitest";
import { GAMES, type GameMeta } from "@/app/games/games-meta";
import { partitionGames } from "../partition";

function game(slug: GameMeta["slug"], extra: Partial<GameMeta> = {}): GameMeta {
  return {
    slug,
    title: slug,
    tagline: "t",
    description: "d",
    accent: "#fff",
    accentTailwind: "x",
    ...extra,
  };
}

describe("partitionGames", () => {
  it("picks the featured game by its flag, not its position", () => {
    const list = [game("hextris"), game("typing-speed"), game("space-shooter", { featured: true })];
    const { featured, rest } = partitionGames(list);
    expect(featured?.slug).toBe("space-shooter");
    expect(rest.map((item) => item.slug)).toEqual(["hextris", "typing-speed"]);
  });

  it("drops hidden games from both halves", () => {
    const list = [
      game("space-shooter", { featured: true }),
      game("tower-stacker", { hidden: true }),
      game("hextris"),
    ];
    const { featured, rest } = partitionGames(list);
    expect(featured?.slug).toBe("space-shooter");
    expect(rest.map((item) => item.slug)).toEqual(["hextris"]);
  });

  it("ignores a hidden game that carries the flag", () => {
    const list = [game("hextris"), game("tower-stacker", { featured: true, hidden: true })];
    const { featured, rest } = partitionGames(list);
    expect(featured).toBeUndefined();
    expect(rest.map((item) => item.slug)).toEqual(["hextris"]);
  });

  it("has no featured game when none is flagged", () => {
    const { featured, rest } = partitionGames([game("hextris"), game("typing-speed")]);
    expect(featured).toBeUndefined();
    expect(rest).toHaveLength(2);
  });

  it("splits the real registry into Orbital Dodge and the other public games", () => {
    const { featured, rest } = partitionGames(GAMES);
    expect(featured?.slug).toBe("space-shooter");
    expect(rest.map((item) => item.slug)).toEqual([
      "hextris",
      "tower-stacker",
      "typing-speed",
      "super-voltorb-flip",
      "password-game",
    ]);
  });
});
