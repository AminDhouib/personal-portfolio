// @vitest-environment node
import { describe, it, expect } from "vitest";
import { SOLVER_DESCRIPTION, SOLVER_FAQ, SOLVER_INTRO, SOLVER_TITLE } from "../solver-content";

// Search Console (2026-09-21..10-18): "voltorb flip calculator" and two "solver" variants landed
// on the game page at positions 22-47 because this page never said "calculator". These pin the
// words in the title, description, intro and FAQ, and the length budgets that keep the snippet
// intact.
describe("Voltorb Flip solver search copy", () => {
  it("names the solver and the calculator in the title, within the visible-title budget", () => {
    expect(SOLVER_TITLE).toMatch(/^Voltorb Flip Solver and Calculator\b/);
    // The layout appends " — Amin Dhouib" (14 characters); Google shows about 60.
    expect(SOLVER_TITLE.length + 14).toBeLessThanOrEqual(60);
  });

  it("keeps the description at 110-160 characters and says online and calculator", () => {
    expect(SOLVER_DESCRIPTION.length).toBeGreaterThanOrEqual(110);
    expect(SOLVER_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(SOLVER_DESCRIPTION).toMatch(/\bonline\b/i);
    expect(SOLVER_DESCRIPTION).toMatch(/\bcalculator\b/i);
  });

  it("calls itself a calculator in the intro", () => {
    expect(SOLVER_INTRO).toMatch(/\bodds calculator\b/);
  });

  it("answers the calculator question with yes", () => {
    const entry = SOLVER_FAQ.find((f) => f.question === "Is this a Voltorb Flip calculator?");
    expect(entry).toBeDefined();
    expect(entry?.answer).toMatch(/^Yes\b/);
    expect(entry?.answer).toMatch(/exact chance/);
  });
});
