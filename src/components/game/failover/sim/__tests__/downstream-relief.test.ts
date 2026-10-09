// @vitest-environment node
// Where does a data-tier choice actually land?
//
// The claim is that a cache/replica/nosql choice "cannot relieve Compute" because
// the sim frees Compute's slot the instant it forwards a request downstream
// (Service.update splices the job out of `processing` and returns before the
// downstream node runs). Measured here, that claim is half right.
//
//   1. A cache DOES relieve the DATA tier. With a cache in front of it the DB
//      carries noticeably less load: the cache absorbs the READs that hit.
//
//   2. A cache does NOT relieve the APP tier. Compute's own load is the same to
//      within noise whether or not a cache sits downstream, because Compute lets go
//      of the request the moment it forwards it.
//
//   3. There is no arrival rate at which the DB is the bottleneck. Below Compute's
//      throughput ceiling the DB is comfortable; ABOVE it Compute saturates, fails
//      traffic at its own door, and the DB is STARVED: its load falls as arrival
//      rises.
//
// This file is the evidence for that decision, pinned so it cannot rot. If the
// engine is ever changed so downstream latency feeds back into Compute occupancy,
// fact 2 flips, and that is exactly the signal to revisit the grading question.
import { afterEach, describe, expect, it } from "vitest";
import { resetSim, S } from "../state";
import { connect, place, resetWorld, run } from "./helpers";

afterEach(() => resetSim({ seed: "after-relief" }));

// READ-heavy so the data tier is the whole story. A pinch of MALICIOUS keeps the
// WAF honest; no STATIC/UPLOAD so nothing competes for the DB path.
const READ_MIX = {
  STATIC: 0,
  READ: 0.85,
  WRITE: 0.1,
  UPLOAD: 0,
  SEARCH: 0,
  MALICIOUS: 0.05,
  INFERENCE: 0,
};

// waf -> alb -> compute -> db, optionally with compute -> cache -> db in front.
// Compute is upgraded in BOTH arms so it is never the variable under test: the only
// difference is whether a cache sits between Compute and the DB.
function runBoard({
  withCache,
  rps,
  seconds = 40,
  seed = "relief-board",
}: {
  withCache: boolean;
  rps: number;
  seconds?: number;
  seed?: string;
}) {
  resetWorld({ money: 1e9, seed });
  const waf = place("waf");
  const alb = place("alb");
  const compute = place("compute");
  const db = place("db");
  connect("internet", waf);
  connect(waf, alb);
  connect(alb, compute);
  if (withCache) {
    const cache = place("cache");
    connect(compute, cache);
    connect(cache, db);
  }
  connect(compute, db);
  compute.upgrade(); // tier 2 in both arms: Compute is held constant
  S.trafficDistribution = { ...READ_MIX };
  S.currentRPS = rps;
  run(seconds);
  return { computeLoad: compute.smoothedLoad, dbLoad: db.smoothedLoad };
}

describe("a cache relieves the data tier but not the app tier", () => {
  it("1. the DB carries meaningfully less load when a cache fronts it", () => {
    // Assert a 15% relief, well inside the measured margin, so the fact is pinned
    // without pinning noise.
    const withCache = runBoard({ withCache: true, rps: 10 });
    const noCache = runBoard({ withCache: false, rps: 10 });
    expect(withCache.dbLoad).toBeLessThan(noCache.dbLoad * 0.85);
  });

  it("2. Compute's load is unchanged by the cache: it lets go on forward", () => {
    // Compute frees its slot the instant it forwards, so the downstream choice
    // never reaches it. If the engine is ever changed to hold the slot until the
    // downstream answers, this assertion flips.
    const withCache = runBoard({ withCache: true, rps: 10 });
    const noCache = runBoard({ withCache: false, rps: 10 });
    expect(Math.abs(withCache.computeLoad - noCache.computeLoad)).toBeLessThan(0.06);
  });

  it("3. no arrival rate makes the DB the bottleneck: Compute starves it first", () => {
    // Below Compute's ceiling the DB is comfortable; above it Compute saturates and
    // fails traffic at its own door, so LESS reaches the DB. The DB's load
    // therefore FALLS as arrival rises, the opposite of a bottleneck.
    const calm = runBoard({ withCache: false, rps: 10 });
    const flooded = runBoard({ withCache: false, rps: 44 });
    expect(flooded.dbLoad).toBeLessThan(calm.dbLoad * 0.5);
  });
});
