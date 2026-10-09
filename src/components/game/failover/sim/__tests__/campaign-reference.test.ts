// @vitest-environment node
// Every campaign level's reference solution still wins it at the fixed 0.05 s step.
//
// The builds are the ones Server Survival's own proofs play (tests/sim/beatability,
// campaign-stars and achievements-proofs, MIT, pinned 7804e59): a level's briefed
// lesson, bought inside its own budget, wired through the real placement and wiring
// rules. Each is played on five seeds. A level that stops winning here is a FINDING for
// the owner, never something to retune in this file: tuning belongs to the level, and
// weakening an assertion would hide the very flip this file exists to surface.
//
// Levels 3-9 and 12 are covered, with their lesson-withheld counterparts, by
// beatability.test.ts. This file adds the rest, and the "constructed" group: levels
// upstream never wrote a reference solution for, played by a build derived from the
// level's own objectives. A constructed build failing is a weaker signal than an
// upstream one failing (the recipe may simply be wrong), and is reported as such.

import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleAutoscaling } from "../autoscaling";
import { TICK } from "../config";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { deleteObject } from "../topology";
import { injectTo } from "./helpers";
import { ensureWire, placeAt, play, svc, wire, type PlayResult } from "./campaign-play";

vi.setConfig({ testTimeout: 60_000 });

const SEEDS = ["ref-1", "ref-2", "ref-3", "ref-4", "ref-5"];

afterEach(() => resetSim({ seed: "after-campaign-reference" }));

interface Reference {
  level: number;
  name: string;
  build: () => void;
  /** An action taken mid-run, as the player would. */
  onFrame?: (elapsed: number) => void;
}

/** A fresh onFrame per play: the purchase it makes must not carry over between seeds. */
type ReferenceFactory = () => Reference;

const upgradeCompute = (): void => {
  svc("compute").upgrade();
};

// ---- upstream reference solutions ----

const UPSTREAM: ReferenceFactory[] = [
  () => ({
    level: 1,
    name: "the briefed four-service chain",
    build: () => {
      const waf = placeAt("waf", -20, 0);
      const alb = placeAt("alb", -10, 0);
      const compute = placeAt("compute", 0, 0);
      const db = placeAt("db", 10, 0);
      wire("internet", waf);
      wire(waf, alb);
      wire(alb, compute);
      wire(compute, db);
    },
  }),
  () => ({
    level: 10,
    name: "serverless only: WAF, queue, function, NoSQL and storage",
    build: () => {
      const waf = placeAt("waf", -20, 0);
      const sqs = placeAt("sqs", -10, 0);
      const fn = placeAt("serverless", 0, 0);
      const nosql = placeAt("nosql", 10, 5);
      const s3 = placeAt("s3", 10, -5);
      wire("internet", waf);
      wire(waf, sqs);
      wire(sqs, fn);
      wire(fn, nosql);
      wire(fn, s3);
    },
  }),
  () => ({
    level: 11,
    name: "both edge defences, firewall then gateway",
    build: () => {
      const waf = placeAt("waf", -28, 0);
      const gw = placeAt("apigw", -22, 8);
      wire("internet", waf);
      wire(waf, gw);
      wire(gw, svc("alb"));
      upgradeCompute();
    },
  }),
  () => ({
    level: 13,
    name: "subtraction: keep the cheap core, demolish the rest",
    build: () => {
      // Twelve services run and nothing new may be placed. Even deleting every
      // redundant node leaves upkeep above the bar, so the SQL box has to go too and
      // NoSQL inherits its reads and writes.
      const keep = ["waf", "alb", "compute", "nosql", "s3"];
      for (const s of S.services.slice()) {
        if (!keep.includes(s.type)) deleteObject(s.id);
      }
      // Some of these edges survive the demolition; the rest are new.
      ensureWire("internet", svc("waf"));
      ensureWire(svc("waf"), svc("alb"));
      ensureWire(svc("alb"), svc("compute"));
      ensureWire(svc("compute"), svc("nosql"));
      ensureWire(svc("compute"), svc("s3"));
    },
  }),
  () => ({
    level: 14,
    name: "the whole architecture from the edge in",
    build: () => {
      const waf = placeAt("waf", -25, 0);
      const alb = placeAt("alb", -15, 0);
      const compute = placeAt("compute", -5, 0);
      const cache = placeAt("cache", 5, 8);
      const db = placeAt("db", 15, 0);
      const cdn = placeAt("cdn", -15, 14);
      const s3 = placeAt("s3", 5, 14);
      wire("internet", waf);
      wire(waf, alb);
      wire(alb, compute);
      wire(compute, cache);
      wire(cache, db);
      wire(compute, db);
      wire(compute, s3);
      wire("internet", cdn);
      wire(cdn, s3);
      compute.upgrade();
    },
  }),
  () => ({
    level: 17,
    name: "a second firewall wired before the outage",
    build: () => {
      const waf2 = placeAt("waf", -22, -8);
      wire("internet", waf2);
      wire(waf2, svc("alb"));
    },
  }),
  () => {
    let bought = false;
    return {
      level: 20,
      name: "region B behind the DNS, plus a second compute bought from income",
      build: () => {
        const dns = svc("dns");
        const db = svc("db");
        const wafB = placeAt("waf", -20, -7);
        const albB = placeAt("alb", -10, -7);
        const compB = placeAt("compute", 0, -7);
        wire(dns, wafB);
        wire(wafB, albB);
        wire(albB, compB);
        wire(compB, db);
      },
      // The minimal $150 build wins only some seeds: region B alone runs near one
      // compute's ceiling during the blackout. The reinforced play buys a second
      // compute from income before the lights go out.
      onFrame: (t) => {
        if (bought || t < 20 || S.money < 60) return;
        const albB = S.services.filter((s) => s.type === "alb")[1];
        if (!albB) throw new Error("L20: region B's balancer is missing");
        const c2 = placeAt("compute", 0, -14);
        wire(albB, c2);
        wire(c2, svc("db"));
        bought = true;
      },
    };
  },
];

// ---- constructed (no upstream reference solution) ----

const CONSTRUCTED: ReferenceFactory[] = [
  () => ({
    level: 2,
    name: "storage behind compute, for the uploads",
    build: () => {
      const s3 = placeAt("s3", 10, -8);
      wire(svc("compute"), s3);
    },
  }),
  () => ({
    level: 15,
    name: "deploy the monitor, then buy the compute tier it points at",
    build: () => {
      placeAt("monitor", 14, 14);
      upgradeCompute();
    },
  }),
  () => ({
    level: 16,
    name: "monitor plus an auto-scaling compute group",
    build: () => {
      placeAt("monitor", 14, 14);
      toggleAutoscaling(svc("compute"));
    },
  }),
  () => ({
    level: 18,
    name: "a dead-letter queue behind both computes",
    build: () => {
      const dlq = placeAt("dlq", 10, -8);
      for (const c of S.services.filter((s) => s.type === "compute")) wire(c, dlq);
    },
  }),
  () => ({
    level: 19,
    name: "pub/sub fan-out to the order store and the notifier",
    build: () => {
      const pubsub = placeAt("pubsub", -2, 0);
      wire(svc("alb"), pubsub);
      wire(pubsub, svc("compute"));
      wire(pubsub, svc("notify"));
    },
  }),
];

// ---- reference solutions that need the auto-scaling and GPU mechanics ----

/**
 * Whether the sim serves inference yet: a GPU behind a Compute answers an INFERENCE
 * request. Probed by behaviour, not by file name, so these levels switch on by
 * themselves the moment the GPU mechanic is wired in, and cannot stay skipped after.
 */
function gpuServesInference(): boolean {
  try {
    resetSim({ seed: "probe-gpu", mode: "sandbox", budget: 100000 });
    const compute = placeAt("compute", 0, 0);
    wire(compute, placeAt("gpu", 8, 0));
    // The model takes about 12 s to load before the GPU answers anything.
    step(Math.round(13 / TICK));
    for (let i = 0; i < 4; i++) injectTo(compute, "INFERENCE");
    step(Math.round(30 / TICK));
    return (S.finances.income.countByType.INFERENCE ?? 0) > 0;
  } catch {
    return false;
  } finally {
    resetSim({ seed: "after-gpu-probe" });
  }
}

const gpuLanded = gpuServesInference();

const NEEDS_A2: ReferenceFactory[] = [
  () => ({
    level: 21,
    name: "a never-upgraded tier-1 GPU behind both computes",
    build: () => {
      const gpu = placeAt("gpu", 10, -6);
      for (const c of S.services.filter((s) => s.type === "compute")) wire(c, gpu);
    },
  }),
  () => ({
    level: 22,
    name: "one GPU behind the inference gateway",
    build: () => {
      const infgw = placeAt("infgw", 0, -10);
      const gpu = placeAt("gpu", 10, -10);
      wire(svc("alb"), infgw);
      wire(infgw, gpu);
    },
  }),
  () => ({
    level: 23,
    name: "a second GPU behind the pre-built gateway, placed before Play",
    build: () => {
      const gpu2 = placeAt("gpu", 10, -14);
      wire(svc("infgw"), gpu2);
    },
  }),
  () => ({
    level: 24,
    name: "two substations and three GPUs (18 kW) behind the gateway",
    build: () => {
      placeAt("power", -20, -10);
      placeAt("power", -30, -10);
      const infgw = placeAt("infgw", 0, -8);
      wire(svc("alb"), infgw);
      for (const [x, z] of [
        [10, -8],
        [18, -8],
        [26, -8],
      ] as const) {
        wire(infgw, placeAt("gpu", x, z));
      }
      expect(S.power.usedKw).toBe(18);
    },
  }),
];

// A reference solution that does not win every seed, recorded as a known flip rather
// than loosened. `it.fails` keeps the suite green while the flip stands and turns red
// the day the level is fixed, so the record cannot go stale.
//
// L14 turns on survival's traffic shifts and random events, and the briefed
// single-chain build has no answer to a search-heavy shift, a capacity drop or a
// traffic burst. Measured over 40 seeds it wins about half (21 and 22 on two seed
// sets); with the events off it wins 40 of 40 (the second describe below pins that).
// Upstream's own proof played two seeds (1 and 42), which happen to draw the benign
// dice. The cause is the level's rolls, not the 0.05 s step, but it means the level's
// reference solution is not robust, which is the owner's call to tune or accept.
const KNOWN_FLIPS = new Set([14]);

function playAll(make: ReferenceFactory): PlayResult[] {
  return SEEDS.map((seed) => {
    const ref = make();
    return play(ref.level, seed, ref.build, { onFrame: ref.onFrame });
  });
}

function describeGroup(title: string, factories: ReferenceFactory[], skip = false): void {
  describe.skipIf(skip)(title, () => {
    for (const make of factories) {
      const { level, name } = make();
      const flip = KNOWN_FLIPS.has(level);
      const test = flip ? it.fails : it;
      test(`L${level} - ${name} - wins on all ${SEEDS.length} seeds${flip ? " (KNOWN FLIP)" : ""}`, () => {
        const results = playAll(make);
        const losses = results
          .filter((r) => r.outcome !== "win")
          .map(
            (r) =>
              `${r.seed}: ${r.outcome ?? "capped"} at ${r.elapsed.toFixed(1)}s ` +
              `(${r.failureReason ?? "no reason"}, rep ${r.reputation.toFixed(1)})`,
          );
        expect(losses, `L${level} no longer wins its reference solution`).toEqual([]);
      });
    }
  });
}

describeGroup("upstream reference solutions", UPSTREAM);
describeGroup("constructed reference solutions (no upstream recipe)", CONSTRUCTED);
describeGroup(
  "reference solutions that need the GPU mechanics (pending the ported mechanics)",
  NEEDS_A2,
  !gpuLanded,
);

describe("the known flip is the dice, not the build", () => {
  it("L14's briefed build wins every seed once survival's events are off", () => {
    const make = UPSTREAM.find((m) => m().level === 14);
    if (!make) throw new Error("L14 reference missing");
    const wins = SEEDS.filter((seed) => {
      const ref = make();
      const result = play(14, seed, () => {
        ref.build();
        S.scriptedEvents = false;
      });
      return result.outcome === "win";
    });
    expect(wins).toEqual(SEEDS);
  });
});

describe("and a constructed lesson is load-bearing", () => {
  it("L16 is lost on every seed without the auto-scaling group", () => {
    // The monitor alone shows the problem and fixes nothing: a fixed fleet fails by
    // never serving enough, which is the level's whole point.
    const wins = SEEDS.filter(
      (seed) => play(16, seed, () => void placeAt("monitor", 14, 14)).outcome === "win",
    );
    expect(wins).toEqual([]);
  });
});
