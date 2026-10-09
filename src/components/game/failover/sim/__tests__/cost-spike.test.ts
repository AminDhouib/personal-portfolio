// @vitest-environment node
// The COST SPIKE banner promised something the meter did not charge.
//
// getUpkeepMultiplier() bundles two different things: the RAMP (upkeep climbing over
// ten minutes, a survival progression mechanic) and the SPIKE
// (S.intervention.costMultiplier, set by a random EVENT). The event's arrival and its
// effect must not hide behind different gates. economy.test.ts pins the multiplier
// itself; this file pins what it was supposed to change: the money a service is
// really charged, and that the two multiply where both apply.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { resetSim, S } from "../state";
import { getUpkeepMultiplier } from "../economy";
import { place, resetWorld } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-cost-spike" }));

describe("a cost spike costs money", () => {
  it("a service really is charged double while the spike is up", () => {
    S.upkeepEnabled = true;
    const db = place("db");
    const rate = CONFIG.services.db.upkeep / 60;

    let before = S.money;
    db.update(1);
    const plain = before - S.money;

    S.intervention.costMultiplier = 2.0;
    before = S.money;
    db.update(1);
    const spiked = before - S.money;

    expect(plain).toBeCloseTo(rate, 6);
    expect(spiked).toBeCloseTo(rate * 2, 6);
  });

  it("the ramp stays survival-only: the gate still guards what it was for", () => {
    S.elapsedGameTime = CONFIG.survival.upkeepScaling.scaleTime; // fully ramped
    expect(getUpkeepMultiplier(), "the survival ramp leaked into sandbox").toBe(1.0);

    resetWorld({ mode: "survival" });
    S.elapsedGameTime = CONFIG.survival.upkeepScaling.scaleTime;
    expect(getUpkeepMultiplier()).toBeCloseTo(CONFIG.survival.upkeepScaling.maxMultiplier, 6);
  });

  it("...and the two multiply in survival, where both apply", () => {
    resetWorld({ mode: "survival" });
    S.elapsedGameTime = CONFIG.survival.upkeepScaling.scaleTime;
    S.intervention.costMultiplier = 2.0;
    expect(getUpkeepMultiplier()).toBeCloseTo(CONFIG.survival.upkeepScaling.maxMultiplier * 2, 6);
  });

  it("a reset starts with no intervention running", () => {
    resetWorld({ mode: "survival" });
    S.intervention.costMultiplier = 2.0;
    S.intervention.trafficBurstMultiplier = 3.0;
    resetWorld({ mode: "survival" });
    expect(S.intervention.costMultiplier).toBe(1.0);
    expect(S.intervention.trafficBurstMultiplier).toBe(1.0);
  });
});
