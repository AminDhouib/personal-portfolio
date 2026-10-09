// @vitest-environment node
// The smoothed load signal.
//
// `totalLoad`'s numerator is an integer job count, so on a tier-1 Compute it can only
// be 0.75, 1.00 or 1.25, and its mean dwell inside any band worth thresholding is a
// fraction of a second. A threshold on that signal describes a strobe. `smoothedLoad`
// is the same quantity through a trailing exponential mean.
//
// Nothing in the job path reads it, so the acceptance bar is deliberately harsh: the
// rest of the suite stays green with zero changed assertions, and forcing the signal
// to nonsense changes no outcome.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { resetSim, S } from "../state";
import { connect, inject, pinLoad, place, resetWorld, run } from "./helpers";

const TAU = CONFIG.load.smoothingTau;
const FRAME = 1 / 60;

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-smoothed" }));

describe("smoothedLoad is a correct trailing mean", () => {
  it("starts cold at zero on a freshly placed service", () => {
    const s = place("compute");
    expect(s.smoothedLoad).toBe(0);
  });

  it("reaches ~63% of a step after exactly tau, and ~95% after 3 tau", () => {
    // The defining property of an exponential mean: 1 - 1/e after one tau.
    const s = place("compute");
    pinLoad(s, 1.0);
    for (let t = 0; t < TAU; t += FRAME) s.update(FRAME);
    expect(s.smoothedLoad).toBeGreaterThan(0.6);
    expect(s.smoothedLoad).toBeLessThan(0.68);

    for (let t = 0; t < 2 * TAU; t += FRAME) s.update(FRAME);
    expect(s.smoothedLoad).toBeGreaterThan(0.93);
    expect(s.smoothedLoad).toBeLessThan(0.99);
  });

  it("converges to a steady load and never overshoots it", () => {
    const s = place("compute");
    pinLoad(s, 0.8);
    for (let t = 0; t < 10 * TAU; t += FRAME) {
      s.update(FRAME);
      expect(s.smoothedLoad).toBeLessThanOrEqual(0.8 + 1e-9);
    }
    expect(s.smoothedLoad).toBeCloseTo(0.8, 3);
  });

  it("decays back toward zero when the load goes away", () => {
    const s = place("compute");
    pinLoad(s, 1.0);
    for (let t = 0; t < 5 * TAU; t += FRAME) s.update(FRAME);
    expect(s.smoothedLoad).toBeGreaterThan(0.95);

    pinLoad(s, 0);
    for (let t = 0; t < 3 * TAU; t += FRAME) s.update(FRAME);
    expect(s.smoothedLoad).toBeLessThan(0.06);
  });

  it("tracks by GAME time, so fast-forward is not an advantage", () => {
    // The bug this forbids: a per-frame constant would make the signal move 3x
    // faster at triple speed and differ between a 60 Hz and a 144 Hz screen.
    const advance = (dt: number, seconds: number): number => {
      resetWorld();
      const s = place("compute");
      pinLoad(s, 1.0);
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) s.update(dt);
      return s.smoothedLoad;
    };
    // The exponential alpha is EXACTLY step-size invariant, so these agree to
    // floating-point noise rather than merely "closely": asserted at 9 decimals,
    // which the naive linear alpha (dt / tau) fails by 0.0005.
    const at60 = advance(1 / 60, 5);
    const at144 = advance(1 / 144, 5);
    const fastForward = advance(3 / 60, 5);
    const oneBigStep = advance(5, 5); // the whole interval in a single frame
    expect(at144).toBeCloseTo(at60, 9);
    expect(fastForward).toBeCloseTo(at60, 9);
    expect(oneBigStep).toBeCloseTo(at60, 9);
  });

  it("a pathological frame cannot overshoot the target", () => {
    // No clamp is needed: e^(-dt/tau) > 0 for every finite dt, so the signal
    // approaches the target from below and never crosses it.
    const s = place("compute");
    pinLoad(s, 1.0);
    s.update(60); // a 60-second frame
    expect(s.smoothedLoad).toBeLessThanOrEqual(1.0);
    expect(s.smoothedLoad).toBeCloseTo(1.0, 6);
  });

  it("is smoother than the raw signal it follows: the point of the step", () => {
    // A real board, not a pinned value: measure how much each signal jumps step to
    // step while traffic churns through a saturated node.
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);
    S.trafficDistribution = {
      STATIC: 0,
      READ: 1,
      WRITE: 0,
      UPLOAD: 0,
      SEARCH: 0,
      MALICIOUS: 0,
      INFERENCE: 0,
    };
    S.currentRPS = 8;

    let rawJumps = 0;
    let smoothJumps = 0;
    let prevRaw = compute.totalLoad;
    let prevSmooth = compute.smoothedLoad;
    for (let i = 0; i < 20 * 20; i++) {
      run(0.05);
      rawJumps += Math.abs(compute.totalLoad - prevRaw);
      smoothJumps += Math.abs(compute.smoothedLoad - prevSmooth);
      prevRaw = compute.totalLoad;
      prevSmooth = compute.smoothedLoad;
    }
    expect(rawJumps).toBeGreaterThan(0); // the raw signal really is churning
    expect(smoothJumps).toBeLessThan(rawJumps);
  });

  it("nothing reads it yet: pinning it to nonsense changes no outcome", () => {
    // The inertness proof. If a consumer existed, forcing the signal to an absurd
    // value would move something.
    const build = () => {
      const alb = place("alb");
      const compute = place("compute");
      const db = place("db");
      connect("internet", alb);
      connect(alb, compute);
      connect(compute, db);
      return { compute };
    };
    const play = (force: boolean) => {
      resetWorld({ seed: "smoothed-inert" });
      const { compute } = build();
      if (force) {
        // Force the smoothed signal far past anything the sim could produce.
        Object.defineProperty(compute, "smoothedLoad", {
          get: () => 99,
          set: () => {},
          configurable: true,
        });
      }
      for (let i = 0; i < 40; i++) inject("READ");
      run(20);
      return {
        processed: S.requestsProcessed,
        failures: { ...S.failures },
        reputation: S.reputation,
        money: S.money,
      };
    };

    const normal = play(false);
    const forced = play(true);
    expect(forced).toEqual(normal);
  });
});
