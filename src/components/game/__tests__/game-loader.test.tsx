import { describe, it, expect, vi } from "vitest";
import type { ComponentProps, ReactElement } from "react";
import { MotionConfig } from "framer-motion";
import { GameLoader } from "../game-loader";
import { GAMES, type GameSlug } from "@/app/games/games-meta";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const renderableGames = GAMES.filter((g) => !g.external);

describe("GameLoader", () => {
  it.each(renderableGames.map((g) => [g.slug, g] as const))(
    "wraps slug %s in a MotionConfig pinned to reducedMotion=never (games are exempt)",
    (_slug, game) => {
      const element = GameLoader({ slug: game.slug }) as ReactElement;
      expect(element).not.toBeNull();
      expect(element.type).toBe(MotionConfig);
      const props = element.props as ComponentProps<typeof MotionConfig>;
      expect(props.reducedMotion).toBe("never");
    },
  );

  it("returns null for password-game (it has its own dedicated top-level route)", () => {
    expect(GameLoader({ slug: "password-game" })).toBeNull();
  });

  it("throws for an out-of-contract slug instead of silently returning null", () => {
    expect(() => GameLoader({ slug: "not-a-real-slug" as GameSlug })).toThrow();
  });

  it("maps the renderable slugs to distinct component identities inside the MotionConfig wrapper", () => {
    const types = renderableGames.map((g) => {
      const element = GameLoader({ slug: g.slug }) as ReactElement;
      const props = element.props as ComponentProps<typeof MotionConfig>;
      return (props.children as ReactElement).type;
    });
    expect(new Set(types).size).toBe(renderableGames.length);
  });
});
