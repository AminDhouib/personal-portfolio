// @vitest-environment node
// A campaign level can opt in to survival's spike, traffic-shift and random-event
// machinery (levels 14 and 25 do, upstream's `enableSurvivalShifts`). Outside that
// opt-in only survival runs it, so a sandbox board stays quiet.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { updateMaliciousSpike, updateRandomEvents, updateTrafficShift } from "../events";
import { resetSim, S } from "../state";
import { resetWorld } from "./helpers";

beforeEach(() => resetWorld({ mode: "sandbox" }));
afterEach(() => resetSim({ seed: "after-scripted-events" }));

describe("scriptedEvents opens the survival event machinery outside survival", () => {
  it("is off by default, so a sandbox timer never moves", () => {
    updateTrafficShift(CONFIG.survival.trafficShift.interval + 1);
    updateRandomEvents(CONFIG.survival.randomEvents.checkInterval + 1);
    updateMaliciousSpike();
    expect(S.intervention.trafficShiftTimer).toBe(0);
    expect(S.intervention.randomEventTimer).toBe(0);
    expect(S.maliciousSpikeTicks).toBe(0);
  });

  it("runs all three timers when a level opts in", () => {
    S.scriptedEvents = true;
    updateTrafficShift(1);
    updateRandomEvents(1);
    updateMaliciousSpike();
    expect(S.intervention.trafficShiftTimer).toBe(1);
    expect(S.intervention.randomEventTimer).toBe(1);
    expect(S.maliciousSpikeTicks).toBe(1);
  });

  it("is cleared by a fresh run", () => {
    S.scriptedEvents = true;
    resetWorld({ mode: "sandbox" });
    expect(S.scriptedEvents).toBe(false);
  });
});
