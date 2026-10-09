// @vitest-environment node
// Is the lesson load-bearing? (Server Survival #254, ported at the fixed 0.05 s step)
//
// The repo already proves levels are WINNABLE. What it checks here is the other half:
// that a level is LOST when its own mechanic is ignored. A level that passes without
// the thing it teaches is not a lesson, it is a cutscene with a timer.
//
// Two levers are available on every one of these levels: the service the briefing
// teaches, and the $100 Compute tier (capacity 4 -> 10) that every budget here can
// afford. Upstream measured which one each level actually turns on (five seeds, burst
// patterns firing, a 0.1 s frame over Math.random):
//
//   level  teaches   taught+tier  tier only  taught only  neither
//   L3     CDN         5/5          0/5        5/5         0/5
//   L4     Cache       5/5          5/5        2/5         2/5
//   L5     Queue       5/5          0/5        0/5         0/5
//   L6     Replica     5/5          5/5        0/5         0/5
//   L7     Search      5/5          5/5        0/5         0/5
//   L8     NoSQL       5/5          5/5        0/5         0/5
//   L9     API GW      5/5          0/5        0/5         0/5
//   L12    2nd WAF     5/5          0/5        0/5         0/5
//
// L4 still passes on an untouched board. On L6, L7 and L8 the taught node is
// decorative in both directions: Compute runs 4 concurrent at 600 ms, about 6.7 req/s,
// and those levels arrive at 6-7 rps, so Compute binds before any downstream store can
// matter. L3, L5 and L9 and L12 are what a working lesson looks like: withhold the CDN,
// the queue, the gateway or the second WAF and the level is lost, whatever else is
// bought.
//
// This file pins the same table under the fixed step and seeded rolls. A level that
// flips is a finding for the owner, not something to retune here: the hollow set can
// only ever SHRINK, and the reference solutions must keep winning.

import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSim, S } from "../state";
import { deleteConnection } from "../topology";
import { placeAt, play, svc, wire } from "./campaign-play";

// Each test plays several full campaign levels, which is seconds of simulation rather
// than milliseconds of assertion; the explicit budget keeps a loaded CI runner from
// turning that into a flake.
vi.setConfig({ testTimeout: 60_000 });

const SEEDS = ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"];

// Buys the Compute tier. Service.upgrade() returns quietly when the money is short, so
// a level whose budget cannot afford its own reference build would measure something
// other than the row it is printed under (L3 sat like that upstream). Loud is better.
const tier = (levelId: number) => () => {
  const compute = svc("compute");
  const before = compute.tier;
  compute.upgrade();
  if (compute.tier === before) {
    throw new Error(
      `L${levelId}: the Compute tier did not land ($${Math.round(S.money)} left); ` +
        `this level cannot afford the build this file claims to measure`,
    );
  }
};

interface LevelRecipe {
  teaches: string;
  /** Places and wires the service the level is about. */
  taught: () => void;
}

const LEVELS: Record<number, LevelRecipe> = {
  3: {
    teaches: "CDN",
    taught: () => {
      const cdn = placeAt("cdn", -15, 12);
      wire("internet", cdn);
      wire(cdn, svc("s3"));
    },
  },
  4: {
    teaches: "Cache",
    taught: () => {
      const cache = placeAt("cache", 5, 8);
      wire(svc("compute"), cache);
      wire(cache, svc("db"));
    },
  },
  5: {
    teaches: "Queue",
    taught: () => {
      const sqs = placeAt("sqs", -5, 10);
      wire(svc("alb"), sqs);
      wire(sqs, svc("compute"));
    },
  },
  6: {
    teaches: "Replica",
    taught: () => {
      const replica = placeAt("replica", 12, 10);
      wire(replica, svc("db"));
      wire(svc("cache"), replica);
    },
  },
  7: {
    teaches: "Search",
    taught: () => {
      const search = placeAt("search", 12, -10);
      wire(svc("compute"), search);
    },
  },
  8: {
    teaches: "NoSQL",
    taught: () => {
      const nosql = placeAt("nosql", 12, 10);
      wire(svc("compute"), nosql);
    },
  },
  9: {
    teaches: "API Gateway",
    taught: () => {
      // A gateway sits BEFORE a balancer, never after one, and the level's own
      // pre-built waf -> alb edge has to come out too, or the balancer round-robins
      // between the direct path and the gateway and only half the traffic is limited.
      const waf = svc("waf");
      const alb = svc("alb");
      deleteConnection(waf.id, alb.id);
      const gw = placeAt("apigw", -15, 8);
      wire(waf, gw);
      wire(gw, alb);
    },
  },
  12: {
    teaches: "a second WAF",
    taught: () => {
      const waf2 = placeAt("waf", -20, 10);
      wire("internet", waf2);
      wire(waf2, svc("alb"));
    },
  },
};

// Today's answer, measured. Membership means "this level still wins with its own
// lesson withheld". The assertion lets this set shrink and never grow, so fixing a
// level is a one-line deletion and shipping a new hollow one is a red build.
const KNOWN_HOLLOW = new Set([4, 6, 7, 8]);

type Build = "briefed" | "tierOnly" | "taughtOnly" | "untouched";

const BUILDS: Record<Build, (id: number) => () => void> = {
  briefed: (id) => () => {
    LEVELS[id]?.taught();
    tier(id)();
  },
  tierOnly: (id) => tier(id),
  taughtOnly: (id) => LEVELS[id]?.taught ?? (() => {}),
  untouched: () => () => {},
};

// A play is a pure function of (level, seed, build): the rolls are seeded and play()
// resets the world first. So each answer is computed once per file and reused.
const answers = new Map<string, number>();

function winRate(id: number, build: Build): number {
  const key = `${id}:${build}`;
  let wins = answers.get(key);
  if (wins === undefined) {
    const recipe = BUILDS[build](id);
    wins = SEEDS.filter((seed) => play(id, seed, recipe).outcome === "win").length;
    answers.set(key, wins);
  }
  return wins;
}

afterEach(() => resetSim({ seed: "after-beatability" }));

const ids = Object.keys(LEVELS).map(Number);

describe("every reference solution wins the level it belongs to", () => {
  for (const id of ids) {
    it(`L${id} - ${LEVELS[id]?.teaches}, played as briefed`, () => {
      expect(winRate(id, "briefed")).toBe(SEEDS.length);
    });
  }
});

describe("and the level is LOST when its own mechanic is ignored", () => {
  for (const id of ids) {
    it(`L${id} - ${LEVELS[id]?.teaches} withheld, everything else the same`, () => {
      const wins = winRate(id, "tierOnly");
      if (KNOWN_HOLLOW.has(id)) {
        // Recorded, not endorsed. The failure this guards against is a level QUIETLY
        // joining the set, so the only thing asserted is that it is still where we
        // wrote it down.
        expect(wins, `L${id} is recorded as hollow`).toBeGreaterThan(0);
      } else {
        expect(wins, `L${id}'s lesson must be load-bearing`).toBe(0);
      }
    });
  }

  it("the hollow set never grows", () => {
    const unexpected = ids.filter((id) => winRate(id, "tierOnly") > 0 && !KNOWN_HOLLOW.has(id));
    expect(
      unexpected,
      "a level began passing without the service it teaches: either the tuning " +
        "drifted or a new level shipped hollow",
    ).toEqual([]);
  });

  it("L5 shows the shape a fixed level has", () => {
    // Withhold the queue and the level is lost however much Compute is bought: a spike
    // is not something a faster box absorbs.
    expect(winRate(5, "tierOnly")).toBe(0);
    expect(winRate(5, "briefed")).toBe(SEEDS.length);
  });

  it("L12 shows it too, against a malicious share instead of a spike", () => {
    // What a second WAF defends against cannot be absorbed by a faster box, so no
    // amount of vertical scaling substitutes for it.
    expect(winRate(12, "tierOnly")).toBe(0);
    expect(winRate(12, "briefed")).toBe(SEEDS.length);
  });
});

describe("the Compute tier is the lever chapter 2 actually turns on", () => {
  // On these three the taught service loses on its own and the tier wins on its own:
  // the level is a vertical-scaling exercise wearing an architecture briefing.
  for (const id of [6, 7, 8]) {
    it(`L${id} - ${LEVELS[id]?.teaches} alone loses, the tier alone wins`, () => {
      expect(winRate(id, "taughtOnly"), `L${id} taught-only`).toBe(0);
      expect(winRate(id, "tierOnly"), `L${id} tier-only`).toBe(SEEDS.length);
    });
  }

  it("one level still passes on a board the player never touched", () => {
    const untouched = [3, 4, 5, 9].filter((id) => winRate(id, "untouched") > 0);
    // Asserting the defect so the fix has something to turn red. When a level here
    // stops passing untouched, this list is what to edit. L5 and L9 are probed and
    // expected to be absent: L5's burst makes its queue load-bearing, and L9's
    // recalibrated gateway means an untouched board drowns.
    expect(untouched).toEqual([4]);
  });
});
