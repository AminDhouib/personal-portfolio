// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TICK, CONFIG } from "../config";
import { updateScore } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { connect, inject, place, resetWorld, run } from "./helpers";
import { step } from "../tick";

// Pin every roll the sim makes so a test can choose which side of a threshold it lands on.
const pin = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("../rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rng")>();
  return {
    ...real,
    rand: (stream: Parameters<typeof real.rand>[0]) => pin.value ?? real.rand(stream),
  };
});

beforeEach(() => {
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-service" });
});

describe("upgrade", () => {
  it("buys the next tier: pays its cost, takes its capacity, books the expense", () => {
    const compute = place("compute");
    const next = CONFIG.services.compute.tiers?.[1];
    expect(next).toBeDefined();
    if (!next) return;
    const before = S.money;
    const spent = S.finances.expenses.services;

    expect(compute.upgrade()).toBe(true);

    expect(compute.tier).toBe(2);
    expect(compute.config.capacity).toBe(next.capacity);
    expect(S.money).toBe(before - next.cost);
    expect(S.finances.expenses.services).toBe(spent + next.cost);
    expect(S.events).toContainEqual({ kind: "service-upgraded", id: compute.id, tier: 2 });
  });

  it("is refused, with a money-short flash, when the money is not there", () => {
    const compute = place("compute");
    S.money = 0;
    expect(compute.upgrade()).toBe(false);
    expect(compute.tier).toBe(1);
    expect(S.events).toContainEqual({ kind: "money-short" });
  });

  it("is refused for a type with no tiers, and past the last tier", () => {
    expect(place("waf").upgrade()).toBe(false);
    const db = place("db");
    while (db.upgrade()) {
      // climb to the top
    }
    expect(db.tier).toBe(CONFIG.services.db.tiers?.length);
    expect(db.upgrade()).toBe(false);
  });
});

describe("repair", () => {
  it("costs a rounded-up share of the build price and restores full health", () => {
    const compute = place("db");
    const raw = compute.config.cost * CONFIG.survival.degradation.repairCostPercent;
    expect(Number.isInteger(raw)).toBe(false); // so ceil and floor differ
    compute.health = 40;
    const before = S.money;
    const spent = S.finances.expenses.repairs;

    expect(compute.repair()).toBe(true);

    expect(compute.health).toBe(100);
    expect(S.money).toBe(before - Math.ceil(raw));
    expect(S.finances.expenses.repairs).toBe(spent + Math.ceil(raw));
    expect(S.events).toContainEqual({ kind: "service-repaired", id: compute.id });
  });

  it("does nothing for a healthy service", () => {
    const compute = place("compute");
    const before = S.money;
    expect(compute.repair()).toBe(false);
    expect(S.money).toBe(before);
  });

  it("is refused, with a warning, when the money is short", () => {
    const compute = place("compute");
    compute.health = 40;
    S.money = 0;
    expect(compute.repair()).toBe(false);
    expect(compute.health).toBe(40);
    expect(S.events).toContainEqual({ kind: "money-short" });
    expect(S.events).toContainEqual(
      expect.objectContaining({ kind: "warning", key: "repair_need_money" }),
    );
  });
});

describe("a damaged node fails more", () => {
  // A finished job fails when the roll is under (load chance + health penalty).
  // Load is nil here, so the penalty alone decides: (1 - health/100) * 0.5.
  // The job goes on to fail for want of a route, so the load-failure roll is
  // read from the OVERLOADED counter, not from `failed`.
  function overloadedAfter(health: number, roll: number): number {
    const compute = place("compute");
    compute.health = health;
    expect(health).toBeLessThan(CONFIG.survival.degradation.criticalHealth);
    const req = new Request("READ");
    S.requests.push(req);
    compute.processing.push({ req, timer: 1e9 });
    pin.value = roll;
    step();
    return S.failuresByReason[FAIL_REASONS.OVERLOADED] ?? 0;
  }

  it("fails under the penalty (health 20 gives 0.4) and not above it", () => {
    expect(overloadedAfter(20, 0.39)).toBe(1);
    resetWorld();
    expect(overloadedAfter(20, 0.41)).toBe(0);
  });

  it("a healthy node adds no penalty", () => {
    const compute = place("compute");
    compute.health = CONFIG.survival.degradation.criticalHealth;
    const req = new Request("READ");
    S.requests.push(req);
    compute.processing.push({ req, timer: 1e9 });
    pin.value = 0.01;
    step();
    expect(S.failuresByReason[FAIL_REASONS.OVERLOADED] ?? 0).toBe(0);
  });
});

describe("processing time", () => {
  function msUntilDone(type: "serverless" | "container" | "alb"): number {
    const service = place(type);
    const req = new Request("STATIC");
    S.requests.push(req);
    service.processing.push({ req, timer: 0 });
    let ms = 0;
    for (let i = 0; i < 400 && service.processing.length > 0; i++) {
      step();
      ms += TICK * 1000;
    }
    return ms;
  }

  it("serverless and container scale it by the traffic class's weight", () => {
    const weight = CONFIG.trafficTypes.STATIC.processingWeight;
    expect(weight).not.toBe(1);
    for (const type of ["serverless", "container"] as const) {
      resetWorld();
      const base = CONFIG.services[type].processingTime;
      const ms = msUntilDone(type);
      expect(ms, type).toBeGreaterThanOrEqual(base * weight);
      expect(ms, type).toBeLessThan(base * weight + TICK * 1000 * 2);
    }
  });

  it("other types ignore the weight", () => {
    const base = CONFIG.services.alb.processingTime;
    const ms = msUntilDone("alb");
    expect(ms).toBeGreaterThanOrEqual(base);
    expect(ms).toBeLessThan(base + TICK * 1000 * 2);
  });
});

describe("intake accounting", () => {
  it("a blocked attack books the mitigation expense", () => {
    const waf = place("waf");
    connect("internet", waf);
    const before = S.finances.expenses.mitigation;
    inject("MALICIOUS");
    run(2);
    expect(S.finances.expenses.mitigation).toBe(
      before + CONFIG.survival.SCORE_POINTS.MALICIOUS_MITIGATION_COST,
    );
  });

  it("a breach books the breach expense", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    inject("MALICIOUS");
    run(10);
    expect(S.finances.expenses.breach).toBe(CONFIG.survival.SCORE_POINTS.MALICIOUS_BREACH_PENALTY);
  });
});

describe("a failure that carries no score", () => {
  it("still costs the fallback penalty (upstream reads score || 5)", () => {
    expect(CONFIG.trafficTypes.MALICIOUS.score).toBe(0);
    updateScore(new Request("MALICIOUS"), "FAILED");
    expect(S.score.penalties).toBe(2.5);
    expect(S.score.total).toBe(-2.5);
  });
});

describe("INFERENCE answer length", () => {
  it("is short 70% of the time and long otherwise", () => {
    pin.value = 0.5; // under 0.7: short, 0.6 + 0.5 * 0.4
    expect(new Request("INFERENCE").genLength).toBeCloseTo(0.8, 12);
    pin.value = 0.9; // over 0.7: long, 1.8 + 0.9 * 1.2
    expect(new Request("INFERENCE").genLength).toBeCloseTo(2.88, 12);
  });
});
