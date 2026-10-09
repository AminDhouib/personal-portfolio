// @vitest-environment node
// The post-run report.
//
// The debrief printed the SAME static paragraph whether the player won by understanding
// or lost by flailing, while the metrics layer was already collecting utilization,
// queue depth, error rate and latency and throwing all of it away at the level boundary.
//
// This is a SURFACE, not a mechanic, so its proof obligation is FIDELITY, not
// losability: the numbers it reports must equal the run the simulation actually
// produced. Upstream's two structural cases (the live panel never imports the report;
// only the debrief renders it) check DOM files and are dropped.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failRequest } from "../actions";
import { TICK } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { getRunReport, metricsTick } from "../metrics";
import { Request } from "../request";
import type { Service } from "../service";
import { resetSim, S } from "../state";
import { connect, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld({ mode: "survival" }));
afterEach(() => resetSim({ seed: "after-run-report" }));

function sample(): void {
  for (let i = 0; i < Math.round(0.5 / TICK); i++) metricsTick();
}

/** Pin a node's smoothed load to whatever `load()` says right now. */
function pinSmoothed(service: Service, load: () => number): void {
  Object.defineProperty(service, "smoothedLoad", { get: load, set: () => {}, configurable: true });
}

describe("peak load is a running watermark, not a buffer scan", () => {
  it("remembers a spike that happened BEFORE the metrics window", () => {
    // The load-bearing property. The ring buffers hold 120 samples x 0.5 s = 60
    // seconds, and long levels run 90-300 s. A scan of the buffers would silently
    // forget an early spike and report a confident wrong answer.
    const compute = place("compute");
    let load = 0;
    pinSmoothed(compute, () => load);

    S.elapsedGameTime = 20;
    load = 0.9; // the spike, at t=20 of a long level
    sample();

    load = 0.05; // quiet for the rest of the run
    for (let t = 21; t <= 140; t++) {
      S.elapsedGameTime = t;
      sample();
      sample();
    }

    const peak = getRunReport().peaks.find((p) => p.type === "compute");
    expect(peak).toBeDefined();
    expect(peak?.util).toBeCloseTo(0.9, 6);
    expect(peak?.atSec).toBeCloseTo(20, 1);
  });

  it("keeps the peak of a node that was deleted mid-run", () => {
    // The report is a post-mortem of the RUN, not a snapshot of the surviving board: a
    // node the player demolished after melting it is exactly the one they need told
    // about.
    const compute = place("compute");
    pinSmoothed(compute, () => 0.8);
    S.elapsedGameTime = 10;
    sample();

    S.services = S.services.filter((s) => s.id !== compute.id);
    S.elapsedGameTime = 30;
    sample();

    expect(getRunReport().peaks.some((p) => p.util >= 0.79)).toBe(true);
  });

  it("ranks the hottest node first", () => {
    const a = place("compute");
    const b = place("db");
    pinSmoothed(a, () => 0.3);
    pinSmoothed(b, () => 0.7);
    sample();
    expect(getRunReport().peaks.map((p) => p.type)).toEqual(["db", "compute"]);
  });

  it("a new run starts with no history", () => {
    const compute = place("compute");
    pinSmoothed(compute, () => 0.7);
    sample();
    expect(getRunReport().peaks.length).toBeGreaterThan(0);

    resetWorld({ mode: "survival" });
    expect(getRunReport().peaks).toEqual([]);
  });
});

describe("failure causes are tallied by REASON", () => {
  const mk = (type: "READ" | "WRITE" | "SEARCH"): Request => {
    const req = new Request(type);
    S.requests.push(req);
    return req;
  };

  it("counts each cause separately and ranks them", () => {
    // S.failures answers "what died" (by traffic type); this answers "why", which is
    // the half a learner needs to fix anything.
    for (let i = 0; i < 5; i++) failRequest(mk("READ"), FAIL_REASONS.QUEUE_FULL);
    for (let i = 0; i < 2; i++) failRequest(mk("WRITE"), FAIL_REASONS.NO_ROUTE);
    failRequest(mk("SEARCH"), FAIL_REASONS.OVERLOADED);

    const r = getRunReport();
    expect(r.topReasons[0]).toEqual({ key: FAIL_REASONS.QUEUE_FULL, count: 5 });
    expect(r.topReasons[1]).toEqual({ key: FAIL_REASONS.NO_ROUTE, count: 2 });
    expect(r.topReasons).toHaveLength(3);
  });

  it("tallying a reason changes nothing about which requests fail", () => {
    // The inertness contract: a reason is attribution, never a verdict. Same board,
    // reasons passed vs suppressed.
    const runWith = (passReasons: boolean) => {
      resetWorld({ mode: "survival" });
      failRequest(mk("READ"), passReasons ? FAIL_REASONS.QUEUE_FULL : null);
      return { failures: { ...S.failures }, processed: S.requestsProcessed };
    };
    expect(runWith(true)).toEqual(runWith(false));
  });
});

describe("the report matches the run it describes", () => {
  it("on-time and late completions add up to what was processed", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);
    S.currentRPS = 6;
    S.trafficDistribution = {
      STATIC: 0,
      READ: 1,
      WRITE: 0,
      UPLOAD: 0,
      SEARCH: 0,
      MALICIOUS: 0,
      INFERENCE: 0,
    };
    run(30);

    const r = getRunReport();
    expect(r.processed).toBeGreaterThan(0);
    expect(r.processed).toBe(S.requestsProcessed);
    expect(r.onTime + r.late).toBe(r.processed);
    expect(r.late).toBe(S.lateCompletions);
    expect(r.failures).toBe(Object.values(S.failures).reduce((a, n) => a + n, 0));
  });
});
