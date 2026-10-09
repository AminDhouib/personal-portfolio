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

  it("does not carry the upstream game's branding", () => {
    expect(text).not.toMatch(/Survival Protocol/i);
    expect(content.seoTitle).not.toMatch(/Server Survival/);
  });

  it("is honest about what this version has", () => {
    const scope = content.facts.find((f) => f.label === "In this version");
    expect(scope?.value).toMatch(/free play/i);
    expect(scope?.value).toMatch(/campaign/i);
    expect(scope?.value).toMatch(/not in yet/i);
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
