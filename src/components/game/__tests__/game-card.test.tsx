import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GameCard } from "../game-card";
import type { GameMeta } from "@/app/games/games-meta";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("../banners", () => ({
  GameBanner: () => <div data-testid="game-banner" />,
}));

const baseGame: GameMeta = {
  slug: "hextris",
  title: "Hextris",
  tagline: "Rotate the hex, match three, don't let it overflow",
  description: "test",
  accent: "#a78bfa",
  accentTailwind: "purple-400",
};

const externalGame: GameMeta = {
  slug: "password-game",
  title: "Password Game 2",
  tagline: "Seeded chaos — every run is a new disaster",
  description: "test",
  accent: "#f472b6",
  accentTailwind: "accent-pink",
  external: true,
  hidden: true,
};

describe("GameCard", () => {
  it("links to /games/<slug> for a normal (non-external) game", () => {
    render(<GameCard game={baseGame} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/games/hextris");
  });

  it("links to /games/<slug> for an external game too (href is not branched on external)", () => {
    render(<GameCard game={externalGame} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/games/password-game");
  });
});
