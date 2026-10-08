import { describe, it, expect } from "vitest";
import { GAMES } from "../../games-meta";
import { GAME_CONTENT } from "..";
import type { GameContent } from "../types";

const EMOJI = /\p{Extended_Pictographic}/u;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** The About copy the page renders, credits excluded. */
function aboutWordCount(content: GameContent): number {
  return [
    content.intro,
    ...content.howToPlay,
    ...content.controls.flatMap((c) => [c.input, c.action]),
    ...content.strategy,
    ...content.facts.flatMap((f) => [f.label, f.value]),
    ...content.faq.flatMap((f) => [f.question, f.answer]),
  ].reduce((sum, part) => sum + words(part), 0);
}

describe("GAME_CONTENT", () => {
  it("has exactly one entry per game in GAMES", () => {
    expect(Object.keys(GAME_CONTENT).sort()).toEqual(GAMES.map((g) => g.slug).sort());
  });

  describe.each(GAMES.map((g) => [g.slug] as const))("%s", (slug) => {
    const content = GAME_CONTENT[slug];

    it("has 350-600 words of About copy", () => {
      const count = aboutWordCount(content);
      expect(count).toBeGreaterThanOrEqual(350);
      expect(count).toBeLessThanOrEqual(600);
    });

    it("fits search-result lengths", () => {
      expect(content.seoTitle.length).toBeLessThanOrEqual(50);
      expect(content.seoDescription.length).toBeGreaterThanOrEqual(110);
      expect(content.seoDescription.length).toBeLessThanOrEqual(160);
    });

    it("has every section", () => {
      expect(content.genre.length).toBeGreaterThanOrEqual(1);
      expect(content.howToPlay.length).toBeGreaterThanOrEqual(3);
      expect(content.controls.length).toBeGreaterThanOrEqual(2);
      expect(content.strategy.length).toBeGreaterThanOrEqual(3);
      expect(content.facts.length).toBeGreaterThanOrEqual(4);
      expect(content.faq.length).toBeGreaterThanOrEqual(3);
      expect(content.faq.length).toBeLessThanOrEqual(5);
      expect(content.credits.length).toBeGreaterThanOrEqual(1);
    });

    it("has no emojis", () => {
      expect(JSON.stringify(content)).not.toMatch(EMOJI);
    });

    it("links credits only to absolute https URLs", () => {
      for (const credit of content.credits) {
        if (credit.href !== undefined) expect(credit.href).toMatch(/^https:\/\//);
      }
    });
  });

  it("carries the fan-recreation disclaimer on Super Voltorb Flip", () => {
    const credits = JSON.stringify(GAME_CONTENT["super-voltorb-flip"].credits);
    expect(credits).toMatch(/not affiliated/i);
    expect(credits).toMatch(/Nintendo/);
  });

  it("credits Neal Agarwal's The Password Game on The Password Game 2", () => {
    const credits = GAME_CONTENT["password-game"].credits;
    expect(credits.some((c) => c.href === "https://neal.fun/password-game/")).toBe(true);
  });
});
