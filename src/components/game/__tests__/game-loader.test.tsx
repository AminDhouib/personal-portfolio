import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { GameLoader } from "../game-loader";
import { GAMES, type GameSlug } from "@/app/games/games-meta";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const renderableGames = GAMES.filter((g) => !g.external);

describe("GameLoader", () => {
  it.each(renderableGames.map((g) => [g.slug, g] as const))(
    "returns a non-null element for slug %s",
    (_slug, game) => {
      const element = GameLoader({ slug: game.slug });
      expect(element).not.toBeNull();
    },
  );

  it("returns null for password-game (it has its own dedicated top-level route)", () => {
    expect(GameLoader({ slug: "password-game" })).toBeNull();
  });

  it("throws for an out-of-contract slug instead of silently returning null", () => {
    expect(() => GameLoader({ slug: "not-a-real-slug" as GameSlug })).toThrow();
  });

  it("maps the renderable slugs to distinct component identities", () => {
    const types = renderableGames.map((g) => (GameLoader({ slug: g.slug }) as ReactElement).type);
    expect(new Set(types).size).toBe(renderableGames.length);
  });
});
