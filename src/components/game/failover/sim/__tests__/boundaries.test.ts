// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { updateInferenceStaging } from "../events";
import { substationRemovalStrandsGpus } from "../power";
import { resetSim, S } from "../state";
import { resetWorld } from "./helpers";

beforeEach(() => resetWorld({ mode: "survival" }));
afterEach(() => resetSim({ seed: "after-boundaries" }));

describe("INFERENCE staging starts at exactly 300 s", () => {
  it("is still 0 a tick before, and 3% on the tick itself", () => {
    S.elapsedGameTime = 299.95;
    updateInferenceStaging();
    expect(S.trafficDistribution.INFERENCE ?? 0).toBe(0);

    S.elapsedGameTime = 300;
    updateInferenceStaging();
    expect(S.trafficDistribution.INFERENCE).toBeCloseTo(0.03, 12);
  });
});

describe("the substation demolish gate is boundary inclusive", () => {
  const sub = CONFIG.power.substationKw;

  it("a GPU draw that lands exactly on the reduced cap is legal", () => {
    S.power = { usedKw: 14 - sub, capKw: 14 };
    expect(substationRemovalStrandsGpus()).toBe(false);
  });

  it("one watt over the reduced cap is refused", () => {
    S.power = { usedKw: 14 - sub + 1, capKw: 14 };
    expect(substationRemovalStrandsGpus()).toBe(true);
  });
});
