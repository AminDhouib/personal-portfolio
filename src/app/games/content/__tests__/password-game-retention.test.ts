// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GAME_CONTENT } from "..";

describe("Password Game 2 retention copy", () => {
  const content = GAME_CONTENT["password-game"];

  it("answers whether progress is saved: bests and streaks only, per device, no account", () => {
    const faq = content.faq.find((f) => f.question === "Does the game save my progress?");
    expect(faq).toBeDefined();
    expect(faq!.answer).toMatch(/best time/i);
    expect(faq!.answer).toMatch(/streak/i);
    expect(faq!.answer).toMatch(/this device|per device/i);
    expect(faq!.answer).toMatch(/no account/i);
  });

  it("lists the on-device bests and streak as a fact", () => {
    const fact = content.facts.find((f) => f.label === "Saved here");
    expect(fact).toBeDefined();
    expect(fact!.value).toMatch(/streak/i);
  });
});
