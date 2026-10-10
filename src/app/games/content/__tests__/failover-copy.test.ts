// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GAME_CONTENT } from "..";
import { CONFIG, SERVICE_TYPES } from "@/components/game/failover/sim/config";

// The About copy has to stay true of the game this version ships, and credit
// the game it is ported from.
describe("Failover About copy", () => {
  const content = GAME_CONTENT.failover;
  const text = JSON.stringify(content);

  it("credits Server Survival as the ported source, linked, under its licence", () => {
    const entry = content.credits.find(
      (c) => c.href === "https://github.com/pshenok/server-survival",
    );
    expect(entry?.detail).toBe("Based on Server Survival by Kostyantyn Pshenychnyy (MIT)");
  });

  it("credits this site only for what it wrote", () => {
    const own = content.credits.find((c) => /Amin Dhouib/.test(c.detail));
    expect(own?.detail).toMatch(/port/i);
    expect(own?.href).toBeUndefined();
  });

  it("reads each credit line once: the page prints the label, so no detail repeats it", () => {
    for (const credit of content.credits) {
      expect(credit.detail.startsWith(`${credit.label}:`), credit.detail).toBe(false);
    }
  });

  it("does not carry the upstream game's branding", () => {
    expect(text).not.toMatch(/Survival Protocol/i);
    expect(content.seoTitle).not.toMatch(/Server Survival/);
  });

  it("is honest about what this version has", () => {
    const scope = content.facts.find((f) => f.label === "In this version");
    expect(scope?.value).toMatch(/daily incident/i);
    expect(scope?.value).toMatch(/sandbox/i);
    expect(scope?.value).toMatch(/save/i);
    expect(scope?.value).toMatch(/campaign is not in yet/i);
    expect(scope?.value).not.toMatch(/free play/i);
  });

  it("answers the daily and campaign question truthfully", () => {
    const entry = content.faq.find((f) => /daily/i.test(f.question));
    expect(entry?.answer).toMatch(/UTC day/);
    expect(entry?.answer).toMatch(/replays/);
    expect(entry?.answer).toMatch(/no campaign yet/i);
  });

  it("tells the player where the daily and the shared builds are", () => {
    expect(content.howToPlay.join(" ")).toMatch(/Daily/);
    expect(content.howToPlay.join(" ")).toMatch(/Share/);
  });

  it("states the numbers the sim runs on", () => {
    expect(text).toContain(`$${CONFIG.survival.startBudget}`);
    expect(text).toContain("$1,000");
    expect(text).toContain(`${SERVICE_TYPES.length} types`);
  });

  it("says sound starts off", () => {
    const sound = content.facts.find((f) => f.label === "Sound");
    expect(sound?.value).toMatch(/off until you turn it on/);
  });
});
