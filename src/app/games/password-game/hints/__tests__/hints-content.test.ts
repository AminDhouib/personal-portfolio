import { describe, expect, it } from "vitest";
import { CORE_RULES } from "@/components/game/password-game-2/engine/rules/index";
import { EVENT_DEFS } from "@/components/game/password-game-2/engine/events/index";
import {
  EVENT_HINTS,
  PG2_HINTS_DESCRIPTION,
  PG2_HINTS_INTRO,
  PG2_HINTS_PATH,
  RULE_HINTS,
} from "../hints-content";

describe("hints coverage", () => {
  it("has a hint block for every core rule, in reveal order", () => {
    for (const r of CORE_RULES) expect(RULE_HINTS[r.id], r.id).toBeDefined();
    expect(Object.keys(RULE_HINTS)).toEqual(CORE_RULES.map((r) => r.id));
  });

  it("has a hint block for every event", () => {
    expect(Object.keys(EVENT_HINTS).sort()).toEqual(EVENT_DEFS.map((d) => d.id).sort());
  });

  it("gives three escalating hints per rule, in plain ASCII", () => {
    for (const h of Object.values(RULE_HINTS)) {
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.hints).toHaveLength(3);
      for (const t of [h.title, ...h.hints]) expect(t).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it("gives every event a title and a tip, in plain ASCII", () => {
    for (const e of Object.values(EVENT_HINTS)) {
      for (const t of [e.title, e.tip]) expect(t).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it("is spoiler-safe: no hint contains a digit run longer than 3 (seeded values)", () => {
    for (const h of Object.values(RULE_HINTS)) {
      for (const t of [h.title, ...h.hints]) expect(t).not.toMatch(/\d{4,}/);
    }
    for (const e of Object.values(EVENT_HINTS)) {
      for (const t of [e.title, e.tip]) expect(t).not.toMatch(/\d{4,}/);
    }
  });

  it("keeps rule titles free of the solution words", () => {
    // The summary is visible while the details are closed, so it must not give the answer away.
    for (const h of Object.values(RULE_HINTS)) {
      expect(h.title).not.toMatch(/drowssap|OPTOUT|REFUSE|NOTHANKS|BEGONE/);
    }
  });

  it("exports the hints path under the game", () => {
    expect(PG2_HINTS_PATH).toBe("/games/password-game/hints");
  });

  it("does not claim events have three hints", () => {
    expect(PG2_HINTS_DESCRIPTION).not.toMatch(/rule and event/i);
    expect(PG2_HINTS_DESCRIPTION.length).toBeGreaterThanOrEqual(50);
    expect(PG2_HINTS_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("states only what the rules do: no digits from junk blocks, no flag artwork", () => {
    expect(EVENT_HINTS.tetris!.tip).not.toMatch(/digit/i);
    for (const t of RULE_HINTS["country-name"]!.hints) expect(t).not.toMatch(/picture|flag/i);
  });

  it("does not promise that nothing is revealed, and warns that numbers can shift", () => {
    expect(PG2_HINTS_INTRO).not.toMatch(/nothing is revealed/i);
    expect(PG2_HINTS_INTRO).toMatch(/shift/i);
  });
});
