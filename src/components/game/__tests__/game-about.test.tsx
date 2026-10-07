import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { GameContent } from "@/app/games/content/types";
import { GameAbout } from "../game-about";

const content: GameContent = {
  seoTitle: "Hextris Online",
  seoDescription: "Rotate the hexagon.",
  genre: ["Puzzle"],
  playMode: "SinglePlayer",
  intro: "Hextris is a fast puzzle game.",
  howToPlay: ["Rotate the hex.", "Match three blocks.", "Do not overflow."],
  controls: [
    { input: "Left and right arrows", action: "Rotate" },
    { input: "Tap either side", action: "Rotate on a phone" },
  ],
  strategy: ["Plan two moves ahead.", "Keep one side low.", "Chain combos."],
  facts: [
    { label: "Sides", value: "6" },
    { label: "Match size", value: "3 blocks" },
  ],
  faq: [{ question: "Is Hextris free?", answer: "Yes, it runs in your browser." }],
  credits: [
    { label: "Original game", detail: "Inspired by Hextris.", href: "https://hextris.io/" },
    { label: "Code", detail: "Written by Amin Dhouib." },
  ],
};

afterEach(cleanup);

describe("GameAbout", () => {
  it("renders every section under an About heading", () => {
    render(<GameAbout title="Hextris" content={content} />);
    expect(screen.getByRole("heading", { level: 2, name: "About Hextris" })).toBeInTheDocument();
    for (const name of [
      "How to play",
      "Controls",
      "Tips and strategy",
      "Quick facts",
      "FAQ",
      "Credits",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.getByText("Hextris is a fast puzzle game.")).toBeInTheDocument();
    expect(screen.getByText("Match three blocks.")).toBeInTheDocument();
    expect(screen.getByText("Left and right arrows")).toBeInTheDocument();
    expect(screen.getByText("Chain combos.")).toBeInTheDocument();
    expect(screen.getByText("3 blocks")).toBeInTheDocument();
  });

  it("renders each FAQ entry verbatim, since the FAQPage JSON-LD must match the page", () => {
    render(<GameAbout title="Hextris" content={content} />);
    expect(screen.getByRole("heading", { level: 4, name: "Is Hextris free?" })).toBeInTheDocument();
    expect(screen.getByText("Yes, it runs in your browser.")).toBeInTheDocument();
  });

  it("links a credit that has an href in a new tab and leaves the rest as text", () => {
    render(<GameAbout title="Hextris" content={content} />);
    const link = screen.getByRole("link", { name: "Inspired by Hextris." });
    expect(link).toHaveAttribute("href", "https://hextris.io/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Written by Amin Dhouib.").closest("a")).toBeNull();
  });

  it("lists related pages under a More heading only when the content has links", () => {
    const { rerender } = render(<GameAbout title="Hextris" content={content} />);
    expect(screen.queryByRole("heading", { level: 3, name: "More" })).toBeNull();
    rerender(
      <GameAbout
        title="Hextris"
        content={{
          ...content,
          links: [{ label: "Solver", href: "/games/hextris/solver", description: "Odds." }],
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "More" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Solver" })).toHaveAttribute(
      "href",
      "/games/hextris/solver",
    );
    expect(screen.getByText("Odds.")).toBeInTheDocument();
  });

  it("marks the section for the E2E word-count gate", () => {
    const { container } = render(<GameAbout title="Hextris" content={content} />);
    expect(container.querySelector("section[data-game-about]")).not.toBeNull();
  });
});
