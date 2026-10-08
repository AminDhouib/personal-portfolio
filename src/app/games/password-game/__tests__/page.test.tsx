import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PasswordGamePage from "../page";
import { PG2_HINTS_PATH } from "../hints/hints-content";

// The interactive shell is client-only; the page's server-rendered copy is what these tests read.
vi.mock("@/components/game/password-game-2", () => ({
  PasswordGame2Loader: () => <div data-testid="loader" />,
}));
vi.mock("@/components/game/game-card", () => ({ GameCard: () => null }));

afterEach(cleanup);

describe("/games/password-game page", () => {
  it("renders exactly one visible h1 naming Password Game 2", () => {
    render(<PasswordGamePage />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Password Game 2");
    expect(h1s[0]!.className).not.toContain("sr-only");
  });

  it("puts the intro paragraph before the game in document order", () => {
    render(<PasswordGamePage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    const intro = screen.getByTestId("pg2-page-intro");
    const loader = screen.getByTestId("loader");
    expect(intro).toHaveTextContent(/free browser game/i);
    expect(h1.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intro.compareDocumentPosition(loader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("credits Neal Agarwal's original above the game, as an independent tribute", () => {
    render(<PasswordGamePage />);
    const credit = screen.getByTestId("pg2-credit");
    const loader = screen.getByTestId("loader");
    expect(credit.compareDocumentPosition(loader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(credit).toHaveTextContent(/independent/i);
    expect(credit).toHaveTextContent(/not affiliated/i);
    const link = credit.querySelector("a")!;
    expect(link).toHaveAttribute("href", "https://neal.fun/password-game/");
    expect(link).toHaveTextContent("Neal Agarwal");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("links to the spoiler-guarded hints page above the game", () => {
    render(<PasswordGamePage />);
    const loader = screen.getByTestId("loader");
    const link = screen.getAllByRole("link", { name: /rules and hints/i })[0]!;
    expect(link).toHaveAttribute("href", PG2_HINTS_PATH);
    expect(link).toHaveTextContent(/spoilers behind a click/i);
    expect(link.compareDocumentPosition(loader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still carries the game JSON-LD", () => {
    const { container } = render(<PasswordGamePage />);
    const text = container.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
    expect(JSON.parse(text)["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual([
      "VideoGame",
      "FAQPage",
      "BreadcrumbList",
    ]);
  });
});
