// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CONFIG, SERVICE_TYPES } from "../config";

// The port reads a few config fields with `??` where upstream wrote `||`. The
// two differ only when the value is 0, so this pins that none of them is.
describe("config fields read with ?? instead of ||", () => {
  it("no queue cap is 0", () => {
    for (const type of SERVICE_TYPES) {
      const cap = CONFIG.services[type].maxQueueSize;
      if (cap !== undefined) expect(cap, type).toBeGreaterThan(0);
    }
  });

  it("the CDN has a hit rate", () => {
    expect(CONFIG.services.cdn.cacheHitRate).toBeGreaterThan(0);
  });

  it("score and penalty points are non-zero", () => {
    const points = CONFIG.survival.SCORE_POINTS;
    expect(points.MALICIOUS_MITIGATION_COST).toBeGreaterThan(0);
    expect(points.MALICIOUS_BREACH_PENALTY).toBeGreaterThan(0);
  });

  it("repairs cost something", () => {
    expect(CONFIG.survival.degradation.repairCostPercent).toBeGreaterThan(0);
  });
});
