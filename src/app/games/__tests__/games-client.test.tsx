import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { GamesClient } from "../games-client";
import { GAMES, GAMES_BY_SLUG } from "../games-meta";
import { hubTags } from "../hub/hub-tags";
import { TODAY_SOURCES } from "../hub/today-sources";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock("@/components/game/registry", () => ({
  GameBanner: () => <div data-testid="game-banner" />,
}));

const publicGames = GAMES.filter((game) => !game.hidden);
const featured = publicGames.find((game) => game.featured);
const rest = publicGames.filter((game) => game !== featured);

function before(first: Element | null, second: Element | null): boolean {
  if (!first || !second) return false;
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("GamesClient", () => {
  beforeEach(() => {
    // The Today strip reads on mount; these tests are about layout, not the reads.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("has the heading outline h2 featured, h2 Today, h3 tiles, h2 On this device, h2 More games, h3 cards", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const outline = [...container.querySelectorAll("h1, h2, h3, h4")].map((heading) => [
      heading.tagName,
      heading.textContent,
    ]);
    expect(outline).toEqual([
      ["H2", featured?.title],
      ["H2", "Today"],
      ...TODAY_SOURCES.map((source) => ["H3", GAMES_BY_SLUG[source.slug].title]),
      ["H2", "On this device"],
      ["H2", "More games"],
      ...rest.map((game) => ["H3", game.title]),
    ]);
  });

  it("renders one card anchor per public game, the featured one first, and no hidden game", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const slugs = [...container.querySelectorAll("a[data-game-card]")].map((anchor) =>
      anchor.getAttribute("data-game-card"),
    );
    expect(slugs).toEqual([featured?.slug, ...rest.map((game) => game.slug)]);
    for (const game of GAMES.filter((candidate) => candidate.hidden)) {
      expect(slugs).not.toContain(game.slug);
    }
  });

  it("orders the sections featured, Today, On this device, More games", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const card = container.querySelector(`a[data-game-card="${featured?.slug}"]`);
    const today = container.querySelector('[data-testid="hub-today"]');
    const device = container.querySelector('[data-testid="hub-device"]');
    const more = container.querySelector("#hub-more-heading");
    expect(before(card, today)).toBe(true);
    expect(before(today, device)).toBe(true);
    expect(before(device, more)).toBe(true);
  });

  it("gives only the featured card a call to action, and every card its tags", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const anchors = [...container.querySelectorAll("a[data-game-card]")];
    expect(anchors[0]).toHaveTextContent("Play now");
    expect(anchors[0]).toHaveTextContent("Arcade");
    expect(anchors[0]).toHaveTextContent("Single player");
    for (const anchor of anchors.slice(1)) {
      expect(anchor).not.toHaveTextContent("Play now");
      expect(anchor.querySelectorAll("li").length).toBeGreaterThan(0);
    }
  });

  it("labels the More games grid", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const section = container.querySelector('section[aria-labelledby="hub-more-heading"]');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll("a[data-game-card]")).toHaveLength(rest.length);
  });

  it("lets a lone last card span the row in the two-column More games grid", () => {
    const { container } = render(<GamesClient tags={hubTags()} />);
    const grid = container.querySelector("#hub-more-heading + div");
    expect(grid?.className).toContain("sm:[&>*:last-child:nth-child(odd)]:col-span-2");
  });
});
