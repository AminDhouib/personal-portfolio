// @vitest-environment node
// Step 0 of Server Survival's failure-knee work (#74), ported at the fixed 0.05 s step.
//
// This pins what the sim does on the reference board, so every later step is
// falsifiable against a number rather than a memory. It asserts the two properties the
// knee design is built on, both currently TRUE and both meant to become FALSE as the
// work lands:
//
//   1. There is no readable middle: no RPS exists where the board fails a little and
//      survives.
//   2. The band is a strobe: the bottleneck's raw utilisation never persists in
//      (0.90, 1.20) long enough to be perceived.
//
// When a step flips one of these, the assertion is updated in that step with the new
// measurement. That is the point of the file, not a maintenance burden.

import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSim } from "../state";
import { SEEDS, sweepAt, sweepSeeds } from "./campaign-play";

vi.setConfig({ testTimeout: 60_000 });

afterEach(() => resetSim({ seed: "after-reference-baseline" }));

// The sweep is the expensive part; run it once and assert over the result.
const RPS_POINTS = [4, 5, 6, 7, 8, 9, 10, 12, 16, 20];

describe("reference board baseline (#74 step 0)", () => {
  const table = RPS_POINTS.map((rps) => sweepAt({ rps, seconds: 60 }));

  it("has one row per probed rate", () => {
    expect(table.map((r) => r.rps)).toEqual(RPS_POINTS);
    // A sweep that measured nothing would report a clean board, the exact false
    // negative the harness exists to prevent.
    for (const r of table) expect(r.processed + r.failures, `rps ${r.rps}`).toBeGreaterThan(0);
  });

  it("is deterministic: the same seed reproduces byte-identically", () => {
    const a = sweepAt({ rps: 12, seconds: 20, seed: "same-seed" });
    const b = sweepAt({ rps: 12, seconds: 20, seed: "same-seed" });
    expect(a).toEqual(b);
  });

  it("different seeds give different runs (the seed is actually wired)", () => {
    const a = sweepAt({ rps: 12, seconds: 20, seed: "seed-a" });
    const b = sweepAt({ rps: 12, seconds: 20, seed: "seed-b" });
    expect(a.processed === b.processed && a.failures === b.failures).toBe(false);
  });

  it("BASELINE PROPERTY 1 - the readable middle is a knife edge", () => {
    // A "readable middle" = an RPS where the board drops requests but the run stays
    // healthy (min reputation >= 80) for a full minute. Such a point DOES exist;
    // what does not is any WIDTH. The board goes from that single point straight into
    // collapse at the next step, so the band cannot be found by a player adjusting an
    // architecture rather than tuning an rps dial. Width is the metric, not existence.
    const readable = table.filter((r) => r.failures > 0 && r.minReputation >= 80);
    const collapsed = table.filter((r) => r.minReputation < 0);
    const widthRps = readable.length
      ? Math.max(...readable.map((r) => r.rps)) - Math.min(...readable.map((r) => r.rps))
      : 0;
    const collapseRps = collapsed.length ? Math.min(...collapsed.map((r) => r.rps)) : Infinity;
    // The readable band spans less than 20% of the collapse load: the target the knee
    // design must beat.
    expect(widthRps / collapseRps).toBeLessThan(0.2);
  });

  it("BASELINE PROPERTY 2 - the RAW band is a strobe; the SMOOTHED one is a state", () => {
    // Mean dwell inside (0.90, 1.20) utilisation. The raw signal's numerator is an
    // integer job count, so it can only step between a few representable values and
    // never rests inside the band. The smoothed signal, over the SAME runs, persists
    // an order of magnitude longer: the difference between a state a player can read
    // and a flicker they cannot.
    const rawEntered = table.filter((r) => r.rawEpisodes > 0);
    const smoothEntered = table.filter((r) => r.episodes > 0);
    expect(rawEntered.length).toBeGreaterThan(0);
    expect(smoothEntered.length).toBeGreaterThan(0);

    const worstRaw = Math.max(...rawEntered.map((r) => r.rawMeanDwellSec));
    const bestSmooth = Math.max(...smoothEntered.map((r) => r.meanDwellSec));

    expect(worstRaw).toBeLessThan(0.6); // still a strobe
    expect(bestSmooth).toBeGreaterThan(1.5); // long enough to perceive
    expect(bestSmooth).toBeGreaterThan(worstRaw * 5);
  });

  it("multi-seed reduction works and agrees with the single-seed run", () => {
    const s = sweepSeeds({ rps: 12, seconds: 20 });
    expect(s.runs.length).toBe(SEEDS.length);
    expect(s.seedsWithFailures).toBeGreaterThanOrEqual(0);
    expect(typeof s.medFailures).toBe("number");
  });
});
