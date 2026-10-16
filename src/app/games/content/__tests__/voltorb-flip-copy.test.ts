// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SOLVER_PATH } from "@/app/games/super-voltorb-flip/solver/solver-content";
import { GAME_CONTENT } from "..";

// A solver page exists, so the About FAQ must not say there is none. These pin the FAQ answer and
// the solver link to the real page.
describe("Super Voltorb Flip copy", () => {
  const content = GAME_CONTENT["super-voltorb-flip"];

  it("answers the solver FAQ with yes and points at the solver page", () => {
    const entry = content.faq.find((f) => f.question === "Is there a Voltorb Flip solver?");
    expect(entry).toBeDefined();
    expect(entry?.answer).toMatch(/^Yes\b/);
    expect(entry?.answer).toMatch(/solver page/);
    expect(entry?.answer).toMatch(/odds for every tile/);
    expect(entry?.answer).not.toMatch(/^No\b/);
  });

  it("links to the solver page at SOLVER_PATH", () => {
    expect(content.links?.some((l) => l.href === SOLVER_PATH)).toBe(true);
  });
});
