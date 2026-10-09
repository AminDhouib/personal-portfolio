// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateFailChanceBasedOnLoad } from "../actions";
import { CONFIG } from "../config";
import {
  chargeServerlessInvocation,
  getAutoRepairUpkeep,
  getUpkeepMultiplier,
  processAutoRepair,
  setAutoRepair,
} from "../economy";
import { resetSim, S } from "../state";
import { connect, inject, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-economy" }));

describe("load failure chance", () => {
  it("is nil up to half load, then climbs linearly to certain at full load", () => {
    expect(calculateFailChanceBasedOnLoad(0)).toBe(0);
    expect(calculateFailChanceBasedOnLoad(0.5)).toBe(0);
    expect(calculateFailChanceBasedOnLoad(0.55)).toBeCloseTo(0.1, 12);
    expect(calculateFailChanceBasedOnLoad(0.75)).toBeCloseTo(0.5, 12);
    expect(calculateFailChanceBasedOnLoad(1)).toBe(1);
  });
});

describe("getAutoRepairUpkeep", () => {
  it("is 0 while auto-repair is off", () => {
    place("db");
    expect(getAutoRepairUpkeep()).toBe(0);
  });

  it("charges autoRepairCostPercent of total service cost per minute", () => {
    resetWorld({ mode: "survival" });
    place("db"); // 150
    place("waf"); // 40
    setAutoRepair(true);
    const pct = CONFIG.survival.degradation.autoRepairCostPercent;
    expect(getAutoRepairUpkeep()).toBeCloseTo(((150 + 40) * pct) / 60, 10);
  });

  it("scales with the number of services", () => {
    resetWorld({ mode: "survival" });
    setAutoRepair(true);
    place("s3");
    const one = getAutoRepairUpkeep();
    expect(one).toBeGreaterThan(0);
    place("s3");
    expect(getAutoRepairUpkeep()).toBeCloseTo(one * 2, 10);
  });

  it("costs nothing where it does nothing: no charge outside survival", () => {
    place("db");
    place("waf");
    setAutoRepair(true);
    expect(getAutoRepairUpkeep()).toBe(0);
  });
});

describe("processAutoRepair", () => {
  it("heals damaged services at 5 hp/s in survival", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    db.health = 50;
    setAutoRepair(true);
    processAutoRepair(2);
    expect(db.health).toBeCloseTo(60, 5);
  });

  it("does not heal past 100", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    db.health = 99;
    setAutoRepair(true);
    processAutoRepair(2);
    expect(db.health).toBe(100);
  });

  it("does nothing outside survival", () => {
    const db = place("db");
    db.health = 50;
    setAutoRepair(true);
    processAutoRepair(2);
    expect(db.health).toBe(50);
  });

  it("does nothing while auto-repair is off", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    db.health = 50;
    processAutoRepair(2);
    expect(db.health).toBe(50);
  });
});

describe("serverless per-invocation charge", () => {
  it("debits perRequestCost and books it as upkeep", () => {
    const fn = place("serverless");
    const moneyBefore = S.money;
    const byServiceBefore = S.finances.expenses.byService.serverless ?? 0; // the purchase
    chargeServerlessInvocation(fn);
    const cost = CONFIG.services.serverless.perRequestCost ?? 0;
    expect(cost).toBeGreaterThan(0);
    expect(S.money).toBeCloseTo(moneyBefore - cost, 10);
    expect(S.finances.expenses.upkeep).toBeCloseTo(cost, 10);
    expect(S.finances.expenses.byService.serverless).toBeCloseTo(byServiceBefore + cost, 10);
  });

  it("is a no-op for every other service type", () => {
    const compute = place("compute");
    const moneyBefore = S.money;
    chargeServerlessInvocation(compute);
    expect(S.money).toBe(moneyBefore);
  });

  it("a completed request through serverless nets its reward minus the invocation charge", () => {
    const alb = place("alb");
    const fn = place("serverless");
    const db = place("db");
    connect("internet", alb);
    connect(alb, fn);
    connect(fn, db);

    const moneyBefore = S.money;
    inject("WRITE");
    run(12); // serverless processingTime is 900 ms, weighted 1.5

    expect(S.requestsProcessed).toBe(1);
    expect(S.money).toBeCloseTo(
      moneyBefore +
        CONFIG.trafficTypes.WRITE.reward -
        (CONFIG.services.serverless.perRequestCost ?? 0),
      5,
    );
  });
});

describe("getUpkeepMultiplier", () => {
  it("is 1.0 outside survival", () => {
    S.elapsedGameTime = 10000;
    expect(getUpkeepMultiplier()).toBe(1.0);
  });

  it("scales linearly from base to max over scaleTime in survival", () => {
    resetWorld({ mode: "survival" });
    const { baseMultiplier, maxMultiplier, scaleTime } = CONFIG.survival.upkeepScaling;

    S.elapsedGameTime = 0;
    expect(getUpkeepMultiplier()).toBeCloseTo(baseMultiplier, 10);

    S.elapsedGameTime = scaleTime / 2;
    expect(getUpkeepMultiplier()).toBeCloseTo((baseMultiplier + maxMultiplier) / 2, 10);

    S.elapsedGameTime = scaleTime * 3; // clamped at max
    expect(getUpkeepMultiplier()).toBeCloseTo(maxMultiplier, 10);
  });

  it("a cost spike multiplies in, in any mode", () => {
    S.intervention.costMultiplier = 3.0;
    expect(getUpkeepMultiplier()).toBeCloseTo(3.0, 10);
    resetWorld({ mode: "survival" });
    S.intervention.costMultiplier = 3.0;
    S.elapsedGameTime = 0;
    expect(getUpkeepMultiplier()).toBeCloseTo(3.0, 10);
  });
});

describe("calculateFailChanceBasedOnLoad", () => {
  it("is 0 at or below 50% load", () => {
    expect(calculateFailChanceBasedOnLoad(0)).toBe(0);
    expect(calculateFailChanceBasedOnLoad(0.5)).toBe(0);
  });

  it("rises linearly above 50%: 2 * (load - 0.5)", () => {
    expect(calculateFailChanceBasedOnLoad(0.75)).toBeCloseTo(0.5, 10);
    expect(calculateFailChanceBasedOnLoad(1.0)).toBeCloseTo(1.0, 10);
  });
});

describe("per-step upkeep drain (Service.update)", () => {
  it("deducts config.upkeep / 60 per second when upkeep is enabled", () => {
    const db = place("db");
    S.upkeepEnabled = true;
    const moneyBefore = S.money;
    db.update(1);
    expect(S.money).toBeCloseTo(moneyBefore - CONFIG.services.db.upkeep / 60, 5);
    expect(S.finances.expenses.upkeep).toBeCloseTo(CONFIG.services.db.upkeep / 60, 5);
  });

  it("charges nothing with upkeep disabled (the sandbox toggle)", () => {
    const db = place("db");
    S.upkeepEnabled = false;
    const moneyBefore = S.money;
    db.update(1);
    expect(S.money).toBe(moneyBefore);
  });

  it("bills every instance of a scaled-out fleet, warming ones included", () => {
    const compute = place("compute");
    S.upkeepEnabled = true;
    const one = (() => {
      const before = S.money;
      compute.update(1);
      return before - S.money;
    })();
    compute.instances = 2;
    compute.warming = [3];
    const before = S.money;
    compute.update(1);
    expect(before - S.money).toBeCloseTo(one * 3, 6);
  });

  it("scales with the survival upkeep ramp", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    S.upkeepEnabled = true;
    S.elapsedGameTime = CONFIG.survival.upkeepScaling.scaleTime; // multiplier at its max
    const before = S.money;
    db.update(1);
    expect(before - S.money).toBeCloseTo(
      (CONFIG.services.db.upkeep / 60) * CONFIG.survival.upkeepScaling.maxMultiplier,
      6,
    );
  });
});
