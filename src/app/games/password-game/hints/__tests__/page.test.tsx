import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CORE_RULES } from "@/components/game/password-game-2/engine/rules/index";
import { EVENT_DEFS } from "@/components/game/password-game-2/engine/events/index";
import * as hintsPage from "../page";
import HintsPage, { metadata } from "../page";
import { PG2_HINTS_PATH } from "../hints-content";

afterEach(cleanup);

describe("/games/password-game/hints page", () => {
  it("has exactly one h1", () => {
    render(<HintsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Password Game 2/);
  });

  it("renders every rule as a closed details with a numbered summary and three hints", () => {
    const { container } = render(<HintsPage />);
    const ruleDetails = [...container.querySelectorAll("details[data-rule]")];
    expect(ruleDetails).toHaveLength(CORE_RULES.length);
    ruleDetails.forEach((d, i) => {
      expect(d.hasAttribute("open"), `rule ${i + 1} is closed`).toBe(false);
      const summary = d.querySelector(":scope > summary")!;
      expect(summary.textContent).toMatch(new RegExp(`^Rule ${i + 1}\\b`));
      expect(d.querySelectorAll("li")).toHaveLength(3);
      expect(d.getAttribute("data-rule")).toBe(CORE_RULES[i]!.id);
    });
  });

  it("renders every event as a closed details", () => {
    const { container } = render(<HintsPage />);
    const eventDetails = [...container.querySelectorAll("details[data-event]")];
    expect(eventDetails.map((d) => d.getAttribute("data-event")).sort()).toEqual(
      EVENT_DEFS.map((d) => d.id).sort(),
    );
    for (const d of eventDetails) expect(d.hasAttribute("open")).toBe(false);
  });

  it("keeps every hint inside a closed details, never in the open page", () => {
    const { container } = render(<HintsPage />);
    const items = [...container.querySelectorAll("li")];
    expect(items.length).toBeGreaterThanOrEqual(CORE_RULES.length * 3);
    for (const li of items) expect(li.closest("details"), li.textContent ?? "").not.toBeNull();
  });

  it("has a unique title, a 50-160 char description and the canonical", () => {
    expect(metadata.title).toBeTruthy();
    expect(metadata.title).not.toBe("Password Game Online: The Password Game 2");
    const description = metadata.description!;
    expect(description.length).toBeGreaterThanOrEqual(50);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(metadata.alternates?.canonical).toBe(`https://amindhou.com${PG2_HINTS_PATH}`);
    expect(Object.hasOwn(metadata.openGraph!, "images")).toBe(false);
    expect(Object.hasOwn(metadata.twitter!, "images")).toBe(false);
  });

  it("emits breadcrumb and FAQPage JSON-LD with three questions", () => {
    const { container } = render(<HintsPage />);
    const scripts = [...container.querySelectorAll('script[type="application/ld+json"]')];
    const nodes = scripts.flatMap((s) => JSON.parse(s.textContent ?? "{}")["@graph"]);
    const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList");
    expect(crumbs.itemListElement.map((c: { name: string }) => c.name)).toEqual([
      "Home",
      "Games",
      "Password Game 2",
      "Hints",
    ]);
    const faq = nodes.find((n) => n["@type"] === "FAQPage");
    expect(faq.mainEntity).toHaveLength(3);
  });

  it("links back to the game and to the original's credit", () => {
    render(<HintsPage />);
    const back = screen.getAllByRole("link", { name: /back to the game|password game 2/i });
    expect(back.some((a) => a.getAttribute("href") === "/games/password-game")).toBe(true);
    const credit = screen.getByRole("link", { name: /Neal Agarwal/ });
    expect(credit).toHaveAttribute("href", "https://neal.fun/password-game/");
    expect(credit.getAttribute("rel")).toContain("noopener");
  });

  it("contains no 4+ digit seeded values", () => {
    const { container } = render(<HintsPage />);
    expect(container.textContent ?? "").not.toMatch(/\d{4,}/);
  });

  it("is static: no dynamic export other than force-static", () => {
    const dynamic = (hintsPage as { dynamic?: string }).dynamic;
    expect(dynamic === undefined || dynamic === "force-static").toBe(true);
  });
});
