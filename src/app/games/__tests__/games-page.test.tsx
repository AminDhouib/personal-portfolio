import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import GamesPage, { metadata } from "../page";

vi.mock("../games-client", () => ({
  GamesClient: ({ tags }: { tags: Record<string, readonly string[]> }) => (
    <div data-testid="games-client" data-tag-slugs={Object.keys(tags).sort().join(",")} />
  ),
}));

describe("/games page", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the search description exactly as it was", () => {
    expect(metadata.description).toBe(
      "Free browser games built for this site. No downloads, no sign-up: pick one and play.",
    );
    expect(metadata.title).toBe("Games");
    expect(metadata.alternates.canonical).toBe("https://amindhou.com/games");
  });

  it("renders one h1, the refreshed intro and the hub container", () => {
    const { container } = render(<GamesPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Games");
    const hub = screen.getByTestId("games-hub");
    expect(hub).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(hub).toHaveTextContent("midnight UTC");
    expect(hub.textContent).not.toMatch(/same puzzle/i);
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull();
    expect(container.querySelector('script[type="application/ld+json"]')?.textContent).toContain(
      "CollectionPage",
    );
  });

  it("hands the client the tags of public games only", () => {
    render(<GamesPage />);
    const slugs = screen.getByTestId("games-client").getAttribute("data-tag-slugs");
    expect(slugs).toBe(
      "hextris,password-game,space-shooter,super-voltorb-flip,tower-stacker,typing-speed",
    );
  });
});
