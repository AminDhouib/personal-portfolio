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

vi.mock("../registry", () => ({
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
  tagline: "Seeded chaos \u2014 every run is a new disaster",
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

  it("titles the card with an h2 by default and an h3 on request", () => {
    const { rerender } = render(<GameCard game={baseGame} />);
    expect(screen.getByRole("heading", { level: 2, name: "Hextris" })).toBeInTheDocument();
    rerender(<GameCard game={baseGame} headingLevel="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Hextris" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("marks its one anchor with the game slug", () => {
    render(<GameCard game={baseGame} />);
    expect(screen.getByRole("link").getAttribute("data-game-card")).toBe("hextris");
  });

  it("adds no chip list and no call to action by default", () => {
    render(<GameCard game={baseGame} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).not.toHaveTextContent("Play now");
  });

  it("renders tags as chips inside the card", () => {
    render(<GameCard game={baseGame} tags={["Puzzle", "Arcade", "Single player"]} />);
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Puzzle", "Arcade", "Single player"]);
    expect(screen.getByRole("link")).toContainElement(screen.getByRole("list"));
  });

  it("renders the call to action as plain text, so the card still has exactly one link", () => {
    render(
      <GameCard game={baseGame} tags={["Arcade"]} cta="Play now" headingLevel="h2" featured />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveTextContent("Play now");
    expect(screen.getByText("Play now").closest("a")).toBe(screen.getByRole("link"));
  });

  it("keeps exactly one link when only a cta is given", () => {
    render(<GameCard game={baseGame} cta="Play now" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("hides the call to action from assistive tech so the link name is the title", () => {
    render(<GameCard game={baseGame} cta="Play now" />);
    expect(screen.getByText("Play now")).toHaveAttribute("aria-hidden", "true");
    const link = screen.getByRole("link", { name: /Hextris/ });
    expect(link).toHaveAccessibleName(expect.stringContaining("Hextris"));
    expect(link).not.toHaveAccessibleName(expect.stringContaining("Play now"));
  });
});
