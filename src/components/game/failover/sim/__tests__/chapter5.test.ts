// @vitest-environment node
// The arithmetic the AI Wave's lessons depend on, pinned against CONFIG so a config
// drive-by cannot silently invert one. Upstream's chapter5 suite also pins levels
// 21-25 (allowed services, budgets, pre-built boards, objectives); those are campaign
// data and live with the campaign, not here. Only the level-independent invariants
// are ported: the tier throughput ceilings every level's demand is sized against, the
// break-even fill, the grid arithmetic behind "the power wall", and the survival
// shifts that must not carry an INFERENCE key.
import { describe, expect, it } from "vitest";
import { CONFIG } from "../config";

const gpu = CONFIG.services.gpu;
const batchBase = gpu.batchBaseMs ?? 0;
const batchPerItem = gpu.batchPerItemMs ?? 0;
const batchSize = gpu.batchSize ?? 1;

// The saturated (pipelined) throughput ceiling in req/s at the mean genLength 1.28:
// the same analytic the ai-wave profit harness pins.
const MEAN_GEN = 1.28;
function ceilingAt(size: number): number {
  const batchMs = (batchBase + batchPerItem * size) * MEAN_GEN;
  return (size * 1000) / batchMs;
}

function breakEvenFill(): number {
  let lo = 0.01;
  let hi = 1.0;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const n = mid * batchSize;
    const batchMs = (batchBase + batchPerItem * n) * MEAN_GEN;
    const perMin = (n * CONFIG.trafficTypes.INFERENCE.reward * 60000) / batchMs - gpu.upkeep;
    if (perMin < 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

describe("chapter 5 arithmetic", () => {
  it("each model tier raises the throughput ceiling, and tier 3 is under three tier-1 GPUs", () => {
    const sizes = (gpu.tiers ?? []).map((t) => t.batchSize ?? batchSize);
    const ceilings = sizes.map(ceilingAt);
    expect(ceilings[0]).toBeLessThan(ceilings[1] ?? 0);
    expect(ceilings[1]).toBeLessThan(ceilings[2] ?? 0);
    // A single tier-3 GPU does not replace a fleet: the power-wall level needs more.
    expect(ceilings[2]).toBeLessThan(3 * (ceilings[0] ?? 0));
  });

  it("break-even sits mid-curve, so a half-fed second GPU is a loss", () => {
    const be = breakEvenFill();
    expect(be).toBeGreaterThan(0.4);
    expect(be).toBeLessThan(0.6);
    // Splitting a break-even-plus load across two GPUs halves each one's fill below it.
    expect((be + 0.05) / 2).toBeLessThan(be);
  });

  it("three GPUs need the base grid plus exactly two substations", () => {
    const p = CONFIG.power;
    expect(3 * p.gpuDrawKw).toBeGreaterThan(p.baseCapKw + p.substationKw);
    expect(3 * p.gpuDrawKw).toBeLessThanOrEqual(p.baseCapKw + 2 * p.substationKw);
  });

  it("only the AI Hype Wave carries an INFERENCE share; classic shifts have no such key", () => {
    // The base INFERENCE bleed therefore pauses during every classic shift, which is
    // why a GPU-less board is condemned by an objective, not by reputation alone.
    for (const shift of CONFIG.survival.trafficShift.shifts) {
      if (shift.name === "AI Hype Wave") continue;
      expect(shift.distribution.INFERENCE, shift.name).toBeUndefined();
    }
  });
});
