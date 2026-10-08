import { describe, expect, it } from "vitest";
import { EVENT_DEFS } from "../../engine/events/index";
import { diffRuleStates, EVENT_LABELS, explainRegression } from "../regression";

describe("diffRuleStates", () => {
  it("reports ids that went from passing to failing", () => {
    const prev = { a: true, b: true, c: false };
    const next = { a: false, b: true, c: false };
    expect(diffRuleStates(prev, next)).toEqual({ regressed: ["a"], recovered: [] });
  });

  it("reports recoveries and ignores brand-new rules", () => {
    expect(diffRuleStates({ a: false }, { a: true, fresh: false })).toEqual({
      regressed: [],
      recovered: ["a"],
    });
  });

  it("ignores a brand-new rule that is already passing", () => {
    expect(diffRuleStates({}, { fresh: true })).toEqual({ regressed: [], recovered: [] });
  });
});

describe("EVENT_LABELS", () => {
  it("names exactly the events the engine can run", () => {
    expect(Object.keys(EVENT_LABELS).sort()).toEqual(EVENT_DEFS.map((d) => d.id).sort());
  });
});

describe("explainRegression", () => {
  it("names the live event that is plausibly responsible", () => {
    expect(explainRegression({ ruleId: "digit-sum", liveEvents: ["infection"] })).toBe(
      "Reopened while the infection is active",
    );
  });

  it("stays neutral when no event is live", () => {
    expect(explainRegression({ ruleId: "digit-sum", liveEvents: [] })).toBe(
      "This rule is no longer satisfied",
    );
  });

  it("says the confirmation phrase is gone for the consent rule", () => {
    expect(explainRegression({ ruleId: "consent-preferences", liveEvents: [] })).toBe(
      "The confirmation phrase is no longer in your password",
    );
  });

  it("names the first live event when several run at once", () => {
    expect(
      explainRegression({ ruleId: "digit-sum", liveEvents: ["black-hole", "infection"] }),
    ).toBe("Reopened while the black hole is active");
  });
});
