// @vitest-environment node
// The AI Wave: INFERENCE traffic, the GPU Cluster batch engine, the Inference
// Gateway's sweep-then-dispatch deadline queue, and the survival staging that feeds
// them.
//
// Coverage map:
//   - INFERENCE class: config economics, per-request genLength variance;
//   - batching: fill / window / genLength scaling / bounded intake;
//   - model cold start: fresh placement, tier-reload with HELD arrivals, mid-run stall;
//   - quality: per-tier risk, badAnswers, the -0.5 constant, the success-side badge
//     event (never through the fail path);
//   - gateway: sweep BEFORE dispatch, expiry exactly-once vs the fail linger,
//     least-loaded dispatch, warming holds, the 20-cap;
//   - routing: forwardCandidates preference and exclusion, the compute INFERENCE
//     branch, MALICIOUS breach relabel at gpu and infgw, the edge rows;
//   - survival staging: 0, then 3%, then 10%, and the hype-shift gating;
//   - the leak battery: mid-batch demolish, region outage over a busy GPU, expiry storm,
//     all-GPU-warming.
//
// Ported from upstream's ai-wave suite. Power-grid cases live in power.test.ts (already
// ported with the grid itself). Dropped with the layers they test: share links, the
// finance panel and campaign-objective DOM/level cases, Service.restore (the persistence
// layer), the pause cases (the sim has no dt=0: a run that is not stepped has nothing
// to freeze) and the badge aggregation (a view concern; the sim emits one event per
// bad answer). Rolls that upstream pinned with Math.random are pinned with the rng pin.
// Times were seconds on a 0.1 s step; here they are the same seconds on the 0.05 s tick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAIL_LINGER_TICKS } from "../actions";
import { CONFIG, TICK } from "../config";
import {
  triggerRegionOutage,
  updateInferenceStaging,
  updateMaliciousSpike,
  updateTrafficShift,
} from "../events";
import { forwardCandidates } from "../handlers/forward";
import { Request } from "../request";
import { isRoutable } from "../routing";
import type { Service } from "../service";
import { snapshot } from "../snapshot";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { deleteObject, isValidEdge } from "../topology";
import type { TrafficType } from "../config";
import { connect, place, resetWorld, run, totalFailures } from "./helpers";
import { pin } from "./rng-pin";

vi.mock("../rng", async (orig) =>
  (await import("./rng-pin")).withPin(await orig<typeof import("../rng")>()),
);

beforeEach(() => {
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-ai-wave" });
});

/** A failed request lingers a few ticks for the view; run past that so it is gone. */
function flush(): void {
  step(FAIL_LINGER_TICKS + 1);
}

// Inject a request straight at a specific node (bypasses entry routing).
function flyInto(type: TrafficType, node: Service, genLength = 1): Request {
  const req = new Request(type);
  if (type === "INFERENCE") req.genLength = genLength;
  S.requests.push(req);
  req.flyTo(node);
  return req;
}

// Push INFERENCE requests straight into a node's arrival queue (no flight), with a
// pinned genLength so batch timing is deterministic.
function pushInference(node: Service, n: number, genLength = 1): Request[] {
  const reqs: Request[] = [];
  for (let i = 0; i < n; i++) {
    const req = new Request("INFERENCE");
    req.genLength = genLength;
    S.requests.push(req);
    node.queue.push(req);
    reqs.push(req);
  }
  return reqs;
}

// Seed gateway deadline entries directly, `age` seconds old.
function seedPending(infgw: Service, n: number, age = 0): Request[] {
  const reqs: Request[] = [];
  for (let i = 0; i < n; i++) {
    const req = new Request("INFERENCE");
    req.genLength = 1;
    S.requests.push(req);
    infgw.pending.push({ req, enqueuedAt: S.elapsedGameTime - age });
    reqs.push(req);
  }
  return reqs;
}

// A freshly placed GPU cold-starts; most cases want one that is already warm.
function warm(gpu: Service): Service {
  gpu.modelLoading = false;
  gpu.modelLoadTimer = 0;
  return gpu;
}

const badAnswerBadges = (gpu: Service): number =>
  S.events.filter(
    (e) => e.kind === "service-badge" && e.serviceId === gpu.id && e.key === "soft_bad_answer",
  ).length;

// ============================ INFERENCE TRAFFIC ============================
describe("INFERENCE traffic class", () => {
  it("carries the spec economics: reward $0.50, score 15, not cacheable, destination gpu", () => {
    const t = CONFIG.trafficTypes.INFERENCE;
    expect(t.reward).toBe(0.5);
    expect(t.score).toBe(15);
    expect(t.cacheable).toBe(false);
    expect(t.destination).toBe("gpu");
    expect(S.failures.INFERENCE).toBe(0); // the counter exists
  });

  it("rolls per-request genLength at spawn: 70% short 0.6-1.0, 30% long 1.8-3.0, mean about 1.28", () => {
    const lengths: number[] = [];
    for (let i = 0; i < 400; i++) lengths.push(new Request("INFERENCE").genLength);
    for (const g of lengths) {
      const short = g >= 0.6 && g <= 1.0;
      const long = g >= 1.8 && g <= 3.0;
      expect(short || long, `genLength ${g} outside both bands`).toBe(true);
    }
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeGreaterThan(1.15); // 1.28, well over 3 sigma at n=400
    expect(mean).toBeLessThan(1.42);
    // No other traffic has duration variance: it keeps the neutral 1.
    expect(new Request("READ").genLength).toBe(1);
  });
});

// ============================== GPU BATCHING ==============================
describe("GPU batching", () => {
  it("a FULL batch launches immediately and runs as one job of (900+150n) x meanGenLength ms", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99; // no quality hits
    pushInference(gpu, 8, 1); // == batchSize at tier 1

    run(0.1); // drain, full, launch on the first tick
    expect(gpu.batchState).toBe("running");
    expect(gpu.batch).toHaveLength(8);
    expect(gpu.batchRunTimeMs).toBe((900 + 150 * 8) * 1); // 2100 ms

    run(1.9); // 2.0 s: under 2100 ms of run
    expect(S.requestsProcessed).toBe(0);
    run(0.2); // past 2100 ms
    expect(S.requestsProcessed).toBe(8);
    expect(S.requests).toHaveLength(0); // TERMINATION
  });

  it("a lonely request waits out the 1.5 s window and still pays nearly full price", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 1, 1);

    run(1.4); // window not yet elapsed
    expect(gpu.batchState).toBe("filling");
    expect(gpu.batch).toHaveLength(1);
    run(0.1); // window fires at 1.5 s
    expect(gpu.batchState).toBe("running");
    expect(gpu.batchRunTimeMs).toBe(900 + 150); // 1050 ms: 50% of a full batch's run for 12.5% of its revenue

    run(1.1);
    expect(S.requestsProcessed).toBe(1);
  });

  it("a partial batch (window-fired) runs all its members together", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 3, 1);

    run(1.4);
    expect(S.requestsProcessed).toBe(0);
    run(0.2); // window fires
    expect(gpu.batchState).toBe("running");
    run(1.5); // (900+450) x 1 = 1350 ms
    expect(S.requestsProcessed).toBe(3);
  });

  it("genLength scales the WHOLE batch: long generations slow everyone in it", () => {
    const gpu = warm(place("gpu"));
    pushInference(gpu, 2, 2.0);
    run(1.6); // window fires the pair
    expect(gpu.batchState).toBe("running");
    expect(gpu.batchRunTimeMs).toBe((900 + 300) * 2.0); // 2400 ms: double the genLength-1 batch
  });

  it("BOUNDED intake: the queue caps at batchSize while a batch runs, overflow takes QUEUE_FULL", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 8, 1);
    run(0.1); // batch of 8 running for 2100 ms

    for (let i = 0; i < 9; i++) flyInto("INFERENCE", gpu); // 9 arrivals vs cap 8
    run(1.0); // flights land while the batch still runs

    expect(gpu.queue).toHaveLength(8); // the bounded intake, exactly
    expect(S.failures.INFERENCE).toBe(1); // the 9th dropped QUEUE_FULL
  });

  it("a GPU does not run through the per-job pipeline: nothing lands in processing", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 3, 1);
    run(2);
    expect(gpu.processing).toHaveLength(0);
  });
});

// ============================ GPU MODEL COLD START ============================
describe("GPU model cold start", () => {
  it("a fresh GPU is loading (12 s at tier 1) and NOT routable: the dedicated flag, never isDisabled", () => {
    const gpu = place("gpu");
    expect(gpu.modelLoading).toBe(true);
    expect(gpu.isDisabled).toBe(false);
    expect(isRoutable(gpu)).toBe(false);
    run(11.5);
    expect(gpu.modelLoading).toBe(true); // still loading
    run(1.0); // past 12 s
    expect(gpu.modelLoading).toBe(false);
    expect(isRoutable(gpu)).toBe(true);
  });

  it("HELD arrivals: requests queued during the load age untouched and batch normally after it", () => {
    const gpu = place("gpu"); // loading for 12 s
    pin.value = 0.99;
    for (let i = 0; i < 4; i++) flyInto("INFERENCE", gpu);

    run(5); // mid-load: landed, held
    expect(gpu.queue).toHaveLength(4);
    expect(totalFailures()).toBe(0); // nothing died waiting: the stall IS the lesson
    expect(S.requestsProcessed).toBe(0);

    run(8); // load done at t=12; then window + run
    run(3);
    expect(S.requestsProcessed).toBe(4);
    expect(S.requests).toHaveLength(0); // TERMINATION post-load
  });

  it("tier upgrade RE-triggers the load at the new duration, holding queued arrivals across it", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    expect(gpu.upgrade()).toBe(true); // tier 2: batch 12, risk 4%, load 20 s
    expect(gpu.tier).toBe(2);
    expect(gpu.modelLoading).toBe(true);
    expect(gpu.config.loadTimeSec).toBe(20);
    expect(gpu.config.batchSize).toBe(12);
    expect(gpu.config.maxQueueSize).toBe(12); // bounded intake follows the tier

    pushInference(gpu, 3, 1);
    run(19); // still loading
    expect(gpu.queue).toHaveLength(3);
    expect(totalFailures()).toBe(0);
    run(1.2); // load completes
    run(3); // window + run
    expect(S.requestsProcessed).toBe(3);
  });

  it("an upgrade DURING a run stalls the batch until the reload completes, then it finishes", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 8, 1);
    run(0.1); // running, 2100 ms
    run(1.0);
    gpu.upgrade(); // self-inflicted outage: 20 s reload mid-run
    run(19); // whole reload
    expect(S.requestsProcessed).toBe(0); // batch held, not lost
    run(2.5); // reload done + the remaining ~1 s of run
    expect(S.requestsProcessed).toBe(8);
    expect(S.requests).toHaveLength(0);
  });

  it("tiers are model size: batch 8/12/16, risk 10%/4%/1%, load 12/20/30 s", () => {
    const tiers = CONFIG.services.gpu.tiers ?? [];
    expect(tiers.map((t) => t.batchSize)).toEqual([8, 12, 16]);
    expect(tiers.map((t) => t.qualityRisk)).toEqual([0.1, 0.04, 0.01]);
    expect(tiers.map((t) => t.loadTimeSec)).toEqual([12, 20, 30]);
    expect(tiers[0]?.cost).toBe(0);
  });

  it("a GPU upgrade is refused when the money is short, and the model keeps serving", () => {
    resetWorld({ money: CONFIG.services.gpu.cost });
    const gpu = warm(place("gpu"));
    expect(gpu.upgrade()).toBe(false);
    expect(gpu.tier).toBe(1);
    expect(gpu.modelLoading).toBe(false);
  });
});

// =============================== GPU QUALITY ===============================
describe("GPU quality risk", () => {
  it("the reputation constant is -0.5 and lives in SCORE_POINTS", () => {
    expect(CONFIG.survival.SCORE_POINTS.QUALITY_RISK_REPUTATION).toBe(-0.5);
  });

  it("a bad answer COMPLETES and pays, then costs -0.5 rep and ticks badAnswers, never a counted failure", () => {
    const gpu = warm(place("gpu"));
    pushInference(gpu, 4, 1);
    S.reputation = 50;
    const moneyBefore = S.money;
    pin.value = 0.0; // every roll hits (0 < 0.1)

    run(0.1);
    run(1.5); // window fires
    run(1.7); // (900+600) x 1 = 1500 ms run

    expect(S.requestsProcessed).toBe(4); // all finished
    expect(gpu.badAnswers).toBe(4);
    expect(totalFailures()).toBe(0); // success-side event: the failure path is untouched
    expect(S.money - moneyBefore).toBeCloseTo(4 * 0.5, 5); // paid in full
    // 4 x (+0.1 success) + 4 x (-0.5 quality)
    expect(S.reputation).toBeCloseTo(50 + 4 * 0.1 - 4 * 0.5, 5);
  });

  it("legibility: each bad answer raises the amber 'Bad answer' soft badge over the GPU", () => {
    const gpu = warm(place("gpu"));
    pushInference(gpu, 3, 1);
    pin.value = 0.0;
    run(4);

    expect(badAnswerBadges(gpu)).toBe(3);
    // A badge is not a failure reason: it never touches the failure tally.
    expect(S.failuresByReason).toEqual({});
  });

  it("tier 3 rolls at 1%: with a roll above it, zero bad answers on a full batch", () => {
    const gpu = warm(place("gpu"));
    gpu.config = { ...gpu.config, qualityRisk: 0.01 };
    pushInference(gpu, 8, 1);
    pin.value = 0.05; // above 1%, below 10%
    run(3);
    expect(S.requestsProcessed).toBe(8);
    expect(gpu.badAnswers).toBe(0);
  });

  it("the quality roll comes from the rolls stream: same seed, same bad answers", () => {
    const play = (): number => {
      resetWorld({ seed: "bad-answers" });
      const gpu = warm(place("gpu"));
      pushInference(gpu, 8, 1);
      run(4);
      return gpu.badAnswers;
    };
    expect(play()).toBe(play());
  });
});

// ========================= GPU ECONOMICS HARNESS =========================
describe("GPU profit/min-at-fill harness (the mandated curve)", () => {
  // The saturated (pipelined) regime: batches run back-to-back at fill f, n = f x
  // batchSize requests each, at the mean genLength 1.28. The analytic model pins the
  // CONFIG constants to the intended curve...
  //
  //   fill   n     batchMs   $/min    profit/min
  //   20%   1.6    1459.2    32.89     -27.11
  //   47%   3.74   1899.5    59.06      -0.94   (analytic break-even 46.8%)
  //   60%   4.8    2073.6    69.44      +9.44
  //  100%   8.0    2688.0    89.29     +29.29
  //
  // ...and the SIM measurement below is the authority that the game implements it. The
  // two only agree because the batch window seeds from the head's true FIRST arrival:
  // reset the window at drain instead and every partial batch pays a dead 1.5 s on top
  // of its run, which drags the live break-even from about half fill to about 93%.
  const gpuCfg = CONFIG.services.gpu;
  const MEAN_GEN = 1.28;
  const batchSize = gpuCfg.batchSize ?? 8;
  const profitPerMin = (fill: number): number => {
    const n = fill * batchSize;
    const batchMs = ((gpuCfg.batchBaseMs ?? 0) + (gpuCfg.batchPerItemMs ?? 0) * n) * MEAN_GEN;
    const revenuePerMin = (n * CONFIG.trafficTypes.INFERENCE.reward * 60000) / batchMs;
    return revenuePerMin - gpuCfg.upkeep;
  };

  // Drive the REAL tickGpu with a steady arrival stream and read profit off the
  // actually-served count. Deterministic: a 70/30 short/long genLength pattern at the
  // band means (exact mean 1.28), arrivals metered by rate, spawn-side overflow mirrored
  // on the bounded intake. Returns profit/min and the mean batch fill actually launched.
  function measureGpu(rps: number, seconds = 240) {
    resetWorld();
    const node = warm(place("gpu"));
    pin.value = 0.99; // no quality hits
    const gen = [0.8, 0.8, 2.4, 0.8, 0.8, 0.8, 2.4, 0.8, 0.8, 2.4];
    let acc = 0;
    let spawned = 0;
    let batches = 0;
    let filled = 0;
    for (let i = 0, n = Math.round(seconds / TICK); i < n; i++) {
      acc += rps * TICK;
      while (acc >= 1) {
        acc -= 1;
        // The bounded-intake drop (QUEUE_FULL in the live game): an arrival past the cap
        // earns nothing, so skip creating it.
        if (node.queue.length < (node.config.maxQueueSize ?? 8)) {
          pushInference(node, 1, gen[spawned % gen.length]);
        }
        spawned++;
      }
      const wasRunning = node.batchState === "running";
      const launchSize = node.batch.length;
      step();
      if (wasRunning && node.batchState === "filling") {
        batches++;
        filled += launchSize;
      }
    }
    const revenuePerMin =
      (S.requestsProcessed * CONFIG.trafficTypes.INFERENCE.reward * 60) / seconds;
    return {
      profitPerMin: revenuePerMin - gpuCfg.upkeep,
      fill: batches > 0 ? filled / (batches * batchSize) : 0,
    };
  }

  it("full-fill saturated profit is about +$29/min", () => {
    expect(profitPerMin(1.0)).toBeGreaterThan(27);
    expect(profitPerMin(1.0)).toBeLessThan(31);
  });

  it("20% fill LOSES money, 60% fill makes it: utilization is the whole game", () => {
    expect(profitPerMin(0.2)).toBeLessThan(0);
    expect(profitPerMin(0.6)).toBeGreaterThan(0);
  });

  it("break-even sits mid-curve (40-60% fill), so the second-GPU trap is real", () => {
    let lo = 0.01;
    let hi = 1.0;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (profitPerMin(mid) < 0) lo = mid;
      else hi = mid;
    }
    expect(lo).toBeGreaterThan(0.4);
    expect(lo).toBeLessThan(0.6);
  });

  it("SIM: the live game matches the analytic curve: red at 1.2 rps, break-even near 2.0, +$29 saturated", () => {
    // 1.2 rps is survival's 10%-share feed at 12 RPS: clearly in the red.
    expect(measureGpu(1.2).profitPerMin).toBeLessThan(-15);
    // 2.0 rps is the analytic break-even arrival (upkeep 60 / ($0.50 x 60)).
    const be = measureGpu(2.0);
    expect(Math.abs(be.profitPerMin)).toBeLessThan(4);
    // ...and it lands at MID-CURVE fill: the spec's "break-even about 52%".
    expect(be.fill).toBeGreaterThan(0.4);
    expect(be.fill).toBeLessThan(0.65);
    // Saturated: throughput pins to the ceiling, batches run full.
    const sat = measureGpu(4.0);
    expect(sat.profitPerMin).toBeGreaterThan(26);
    expect(sat.profitPerMin).toBeLessThan(32);
    expect(sat.fill).toBeGreaterThan(0.9);
  });

  it("infgw is priced for its scope: $70 with upkeep below the API Gateway's", () => {
    expect(CONFIG.services.infgw.cost).toBe(70);
    expect(CONFIG.services.infgw.upkeep).toBe(5);
    expect(CONFIG.services.infgw.upkeep).toBeLessThan(CONFIG.services.apigw.upkeep);
    expect(CONFIG.services.infgw.deadlineSec).toBe(6);
    expect(CONFIG.services.infgw.maxQueueSize).toBe(20);
  });

  it("INFERENCE income is booked per class, the ledger the batch lesson tells the player to read", () => {
    const node = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(node, 8, 1);
    run(3); // full batch launches and completes
    expect(S.finances.income.byType.INFERENCE).toBeCloseTo(8 * 0.5, 5);
    expect(S.finances.income.countByType.INFERENCE).toBe(8);
  });
});

// ============================ INFERENCE GATEWAY ============================
describe("Inference Gateway deadline queue", () => {
  it("SWEEPS before dispatching: an entry past the deadline is expired, never sent to a GPU", () => {
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    connect(infgw, gpu);
    S.elapsedGameTime = 100;
    seedPending(infgw, 2, 7); // older than deadlineSec 6
    const fresh = seedPending(infgw, 1, 0);

    infgw.update(TICK);

    expect(S.inference.expired).toBe(2);
    expect(infgw.expiredCount).toBe(2);
    expect(S.failures.INFERENCE).toBe(2); // failRequest(SLO_TIMEOUT), explicit: never failOrPark
    expect(S.failuresByReason["fail_slo_timeout"]).toBe(2);
    // Only the fresh entry was dispatched; the expired ones never flew.
    expect(fresh[0]?.target).toBe(gpu);
    expect(infgw.pending).toHaveLength(0);
  });

  it("expiry is exactly-once even across the fail linger (splice-before-fail)", () => {
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    connect(infgw, gpu);
    S.elapsedGameTime = 100;
    seedPending(infgw, 3, 7);

    infgw.update(TICK);
    expect(S.inference.expired).toBe(3);
    // The failed requests are still lingering in S.requests: tick more. They are out of
    // the array, so nothing double-expires or dispatches.
    expect(S.requests).toHaveLength(3);
    for (let i = 0; i < 5; i++) infgw.update(TICK);
    expect(S.inference.expired).toBe(3);
    expect(gpu.queue).toHaveLength(0);
    flush();
    expect(S.requests).toHaveLength(0);
  });

  it("dispatches heads to the LEAST-loaded routable GPU (queue + batch + in-flight)", () => {
    const infgw = place("infgw");
    place("power"); // grid headroom for the second GPU
    const busy = warm(place("gpu"));
    const idle = warm(place("gpu"));
    connect(infgw, busy);
    connect(infgw, idle);
    pushInference(busy, 5, 1); // busy carries a backlog

    const reqs = seedPending(infgw, 2, 0);
    infgw.update(TICK);

    expect(reqs[0]?.target).toBe(idle);
    expect(reqs[1]?.target).toBe(idle); // still lighter with 1 in flight vs 5 queued
  });

  it("holds entries while every GPU is warming, then dispatches the moment a load completes", () => {
    const infgw = place("infgw");
    const gpu = place("gpu"); // loading (12 s)
    connect(infgw, gpu);
    gpu.modelLoadTimer = 11.8; // almost done
    pin.value = 0.99;
    seedPending(infgw, 3, 0);

    infgw.update(TICK); // warming: nothing moves
    expect(infgw.pending).toHaveLength(3);
    expect(gpu.queue).toHaveLength(0);

    run(0.5); // load completes; the next gateway tick dispatches
    expect(infgw.pending).toHaveLength(0);
    run(4); // batch and finish
    expect(S.requestsProcessed).toBe(3);
    expect(S.requests).toHaveLength(0);
  });

  it("WARMUP GRACE: entries do not age while every connected GPU is loading, and serve after, not expire", () => {
    const infgw = place("infgw");
    const gpu = place("gpu"); // loading for 12 s: twice the 6 s deadline
    connect(infgw, gpu);
    pin.value = 0.99;
    seedPending(infgw, 3, 5.5); // 0.5 s of deadline left: doomed without the grace

    run(8); // the whole fleet is warming: the clock waits
    expect(S.inference.expired).toBe(0);
    expect(infgw.pending).toHaveLength(3);

    run(8); // load done at 12 s; the clock resumes at 5.5 s: dispatched, not swept
    expect(S.inference.expired).toBe(0);
    expect(infgw.pending).toHaveLength(0);
    run(4);
    expect(S.requestsProcessed).toBe(3); // reputation SAVED during the warmup window
    expect(S.requests).toHaveLength(0);
  });

  it("no grace without a fleet: a gateway with zero connected GPUs still expires honestly", () => {
    const infgw = place("infgw");
    seedPending(infgw, 3, 5.5);
    run(2); // nothing connected: the deadline is the only exit
    expect(S.inference.expired).toBe(3);
    flush();
    expect(S.requests).toHaveLength(0);
  });

  it("no grace while ONE connected GPU is live: entries age toward the deadline as usual", () => {
    const infgw = place("infgw");
    place("power"); // headroom for the second GPU
    const warmGpu = warm(place("gpu"));
    const coldGpu = place("gpu"); // loading, but its warm peer keeps the clock honest
    connect(infgw, warmGpu);
    connect(infgw, coldGpu);
    // The warm GPU is FULL, so entries cannot dispatch and must age.
    pushInference(warmGpu, (warmGpu.config.maxQueueSize ?? 8) + (warmGpu.config.batchSize ?? 8), 1);
    seedPending(infgw, 3, 5.5);
    run(1); // past the 6 s deadline: no freeze, they expire
    expect(S.inference.expired).toBe(3);
  });

  it("the held backlog is bounded at 20: an arrival past the cap takes the QUEUE_FULL drop", () => {
    const infgw = place("infgw");
    seedPending(infgw, 20, 0); // at capacity, no GPU to drain into
    const overflow = flyInto("INFERENCE", infgw);
    run(0.6); // land + admission tick

    expect(infgw.pending).toHaveLength(20);
    expect(S.failures.INFERENCE).toBe(1);
    expect(overflow.failed).toBe(true);
  });

  it("the HUD can read the expiry counter from the snapshot", () => {
    expect(snapshot().expired).toBe(0);
    S.inference.expired = 7;
    expect(snapshot().expired).toBe(7);
  });

  it("the snapshot carries what a GPU and a gateway panel need, as plain copies", () => {
    const infgw = place("infgw");
    const gpu = place("gpu"); // loading
    seedPending(infgw, 3, 0);
    gpu.badAnswers = 2;
    const [gw, g] = [snapshot().services[0], snapshot().services[1]];
    expect(gw?.pending).toBe(3);
    expect(g?.loading).toBe(true);
    expect(g?.badAnswers).toBe(2);
    expect(g?.batch).toBe(0);
    warm(gpu);
    expect(snapshot().services[1]?.loading).toBe(false);
  });

  it("a gateway only forwards to GPUs, and anything else is failed on the spot (fail_gpu_only)", () => {
    const infgw = place("infgw");
    flyInto("READ", infgw);
    run(1);
    flush();
    expect(S.failures.READ).toBe(1);
    expect(S.failuresByReason["fail_gpu_only"]).toBe(1);
  });
});

// ================================= ROUTING =================================
describe("routing: type-aware forwarding + the compute branch", () => {
  it("forwardCandidates prefers infgw, then gpu, then the generic set for INFERENCE", () => {
    const alb = place("alb");
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    const compute = place("compute");
    // Hand-wire (unit level) so all three are simultaneous candidates.
    alb.connections = [infgw.id, gpu.id, compute.id];
    const req = new Request("INFERENCE");

    expect(forwardCandidates(alb, req)).toEqual([infgw]);
    alb.connections = [gpu.id, compute.id];
    expect(forwardCandidates(alb, req)).toEqual([gpu]);
    alb.connections = [compute.id];
    expect(forwardCandidates(alb, req)).toEqual([compute]); // generic fallback still knows the way
  });

  it("forwardCandidates EXCLUDES infgw/gpu for everything else: they join the dlq exclusion", () => {
    const alb = place("alb");
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    const compute = place("compute");
    const dlq = place("dlq");
    alb.connections = [infgw.id, gpu.id, compute.id, dlq.id];

    expect(forwardCandidates(alb, new Request("READ"))).toEqual([compute]);
    expect(forwardCandidates(alb, new Request("MALICIOUS"))).toEqual([compute]);
  });

  it("a GPU still loading its model is not a forward candidate", () => {
    const alb = place("alb");
    const gpu = place("gpu"); // loading
    alb.connections = [gpu.id];
    expect(forwardCandidates(alb, new Request("INFERENCE"))).toEqual([]);
    warm(gpu);
    expect(forwardCandidates(alb, new Request("INFERENCE"))).toEqual([gpu]);
  });

  it("integration: an ALB sends INFERENCE to its gateway and READ to its compute, never crossed", () => {
    const alb = place("alb");
    const infgw = place("infgw");
    const compute = place("compute");
    connect(alb, infgw);
    connect(alb, compute);
    pin.value = 0.99;

    for (let i = 0; i < 4; i++) flyInto("INFERENCE", alb);
    for (let i = 0; i < 3; i++) flyInto("READ", alb);
    run(2);

    // All 4 INFERENCE are held at the (gpu-less) gateway...
    expect(infgw.pending.length + infgw.queue.length).toBe(4);
    // ...and all 3 READs went to compute (and died there: no DB wired).
    expect(S.failures.READ).toBe(3);
    expect(S.failures.INFERENCE).toBe(0);
  });

  it("the API Gateway's forward carries the same preference/exclusion (shared filter)", () => {
    const apigw = place("apigw");
    const infgw = place("infgw");
    const alb = place("alb");
    connect(apigw, infgw);
    connect(apigw, alb);
    pin.value = 0.99;

    const inf = flyInto("INFERENCE", apigw);
    const read = flyInto("READ", apigw);
    run(1);

    expect(inf.target).toBe(infgw);
    expect(read.target === infgw).toBe(false);
  });

  it("compute's explicit INFERENCE branch: infgw first, direct gpu second, else NO_ROUTE", () => {
    // 1) infgw preferred over a direct gpu.
    let compute = place("compute");
    const infgw = place("infgw");
    let gpu = warm(place("gpu"));
    connect(compute, infgw);
    connect(compute, gpu);
    pin.value = 0.99;
    const viaGw = flyInto("INFERENCE", compute);
    run(1.5);
    expect(viaGw.target).toBe(infgw);

    // 2) direct gpu when no gateway.
    resetWorld();
    pin.value = 0.99;
    compute = place("compute");
    gpu = warm(place("gpu"));
    connect(compute, gpu);
    const direct = flyInto("INFERENCE", compute);
    run(1.5);
    expect(direct.target).toBe(gpu);

    // 3) neither: NO_ROUTE, counted under S.failures.INFERENCE.
    resetWorld();
    pin.value = 0.99;
    compute = place("compute");
    connect(compute, place("db"));
    flyInto("INFERENCE", compute);
    run(1.5);
    flush();
    expect(S.failures.INFERENCE).toBe(1);
    expect(S.requests).toHaveLength(0);
  });

  it("a MALICIOUS request reaching a GPU is the breach it is: the existing failRequest relabel", () => {
    const gpu = warm(place("gpu"));
    const moneyBefore = S.money;
    flyInto("MALICIOUS", gpu);
    run(1);
    flush();

    expect(S.failures.MALICIOUS).toBe(1);
    expect(moneyBefore - S.money).toBeCloseTo(50, 5); // MALICIOUS_BREACH_PENALTY
    expect(S.reputation).toBeCloseTo(95, 5); // -5
    expect(S.requests).toHaveLength(0);
  });

  it("a MALICIOUS request reaching the gateway relabels identically", () => {
    const infgw = place("infgw");
    const moneyBefore = S.money;
    flyInto("MALICIOUS", infgw);
    run(1);
    flush();
    expect(S.failures.MALICIOUS).toBe(1);
    expect(moneyBefore - S.money).toBeCloseTo(50, 5);
  });

  it("non-INFERENCE at a GPU fails fast with the gpu-only lesson (fail_gpu_only)", () => {
    const gpu = warm(place("gpu"));
    flyInto("READ", gpu);
    run(1);
    flush();
    expect(S.failures.READ).toBe(1);
    expect(S.requestsProcessed).toBe(0);
    expect(S.events.some((e) => e.kind === "request-failed" && e.reason === "fail_gpu_only")).toBe(
      true,
    );
  });
});

// =========================== CONNECTION VALIDITY ===========================
describe("edge rows around gpu and infgw", () => {
  it("accepts exactly the spec'd feeds into infgw, infgw to gpu, and the compute-tier to gpu edges", () => {
    for (const from of ["alb", "apigw", "compute", "serverless", "container"]) {
      expect(isValidEdge(from, "infgw"), `${from} -> infgw`).toBe(true);
    }
    expect(isValidEdge("infgw", "gpu")).toBe(true);
    for (const from of ["compute", "serverless", "container"]) {
      expect(isValidEdge(from, "gpu"), `${from} -> gpu`).toBe(true);
    }
  });

  it("rejects everything else around gpu and infgw: no entry edges, no loops back up", () => {
    expect(isValidEdge("internet", "gpu")).toBe(false);
    expect(isValidEdge("internet", "infgw")).toBe(false);
    expect(isValidEdge("waf", "gpu")).toBe(false);
    expect(isValidEdge("waf", "infgw")).toBe(false);
    expect(isValidEdge("sqs", "infgw")).toBe(false);
    expect(isValidEdge("gpu", "db")).toBe(false); // gpu is a pure terminal
    expect(isValidEdge("gpu", "infgw")).toBe(false);
    expect(isValidEdge("infgw", "alb")).toBe(false);
  });
});

// ============================ SURVIVAL STAGING ============================
describe("survival staging: 0, then 3%, then 10%, and hype gating", () => {
  beforeEach(() => resetWorld({ mode: "survival" }));

  const sumOf = (dist: Partial<Record<TrafficType, number>>): number =>
    Object.values(dist).reduce((a, b) => a + b, 0);

  it("before 300 s the base INFERENCE share stays 0", () => {
    S.elapsedGameTime = 299;
    updateInferenceStaging();
    expect(S.trafficDistribution.INFERENCE).toBe(0);
  });

  it("after 300 s the base moves to 3%, taken proportionally, summing to 1", () => {
    S.elapsedGameTime = 301;
    updateInferenceStaging();
    const d = S.trafficDistribution;
    expect(d.INFERENCE).toBeCloseTo(0.03, 9);
    expect(sumOf(d)).toBeCloseTo(1, 9);
    // Proportional: STATIC and READ keep their ratio.
    const before = CONFIG.survival.trafficDistribution;
    expect((d.STATIC ?? 0) / (d.READ ?? 1)).toBeCloseTo(
      (before.STATIC ?? 0) / (before.READ ?? 1),
      9,
    );
  });

  it("once a GPU exists the base rebalances to 10%: steady food between hypes", () => {
    S.elapsedGameTime = 100; // ownership wins even before 300 s (no dead GPU)
    place("gpu");
    updateInferenceStaging();
    expect(S.trafficDistribution.INFERENCE).toBeCloseTo(0.1, 9);
    expect(sumOf(S.trafficDistribution)).toBeCloseTo(1, 9);
  });

  it("is a no-op outside survival", () => {
    resetWorld({ mode: "sandbox" });
    const before = { ...S.trafficDistribution };
    S.elapsedGameTime = 400;
    place("gpu");
    updateInferenceStaging();
    expect(S.trafficDistribution).toEqual(before);
  });

  it("the sim steps it: a long survival run reaches the 3% base on its own", () => {
    S.upkeepEnabled = false;
    S.elapsedGameTime = 0;
    step(Math.round(305 / TICK));
    // A shift or spike may be running by now; staging targets the base it will restore.
    const base =
      S.maliciousSpikeActive && S.normalTrafficDist
        ? S.normalTrafficDist
        : S.intervention.trafficShiftActive && S.intervention.originalTrafficDist
          ? S.intervention.originalTrafficDist
          : S.trafficDistribution;
    expect(base.INFERENCE ?? 0).toBeCloseTo(0.03, 9);
  });

  it("mid-shift, staging adjusts the BASE the shift will restore, not the live shifted mix", () => {
    S.elapsedGameTime = 400;
    S.intervention.trafficShiftActive = true;
    S.intervention.originalTrafficDist = { ...CONFIG.survival.trafficDistribution };
    S.trafficDistribution = {
      STATIC: 0.1,
      READ: 0.35,
      WRITE: 0.25,
      UPLOAD: 0.05,
      SEARCH: 0.15,
      MALICIOUS: 0.1,
    };

    updateInferenceStaging();

    expect(S.intervention.originalTrafficDist?.INFERENCE).toBeCloseTo(0.03, 9);
    expect(S.trafficDistribution.INFERENCE ?? 0).toBe(0); // live shift untouched
  });

  it("during a malicious spike, staging targets the saved normal mix the spike will restore", () => {
    S.elapsedGameTime = 400;
    S.maliciousSpikeActive = true;
    S.normalTrafficDist = { ...CONFIG.survival.trafficDistribution };
    updateInferenceStaging();
    expect(S.normalTrafficDist.INFERENCE).toBeCloseTo(0.03, 9);
  });

  it("a malicious spike scales the INFERENCE share down like every classic share, not to zero", () => {
    S.trafficDistribution = {
      STATIC: 0.25,
      READ: 0.2,
      WRITE: 0.15,
      UPLOAD: 0.05,
      SEARCH: 0.05,
      MALICIOUS: 0.2,
      INFERENCE: 0.1,
    };
    // Drive the spike start through the real tick counter: one tick before the cycle edge.
    const spike = CONFIG.survival.maliciousSpike;
    S.maliciousSpikeTicks = Math.round(spike.interval / TICK) - 1;
    updateMaliciousSpike();
    expect(S.maliciousSpikeActive).toBe(true);
    // 0.1 of the 0.8 non-malicious mass, rescaled to the remainder.
    expect(S.trafficDistribution.INFERENCE).toBeCloseTo(
      (0.1 / 0.8) * (1 - spike.maliciousPercent),
      9,
    );
    expect(S.trafficDistribution.MALICIOUS).toBeCloseTo(spike.maliciousPercent, 9);
  });

  it("the AI Hype Wave is written out in CONFIG: INFERENCE 25%, classic shares x0.75, sums to 1", () => {
    const hype = CONFIG.survival.trafficShift.shifts.find((s) => s.name === "AI Hype Wave");
    expect(hype).toBeDefined();
    expect(hype && "requiresService" in hype ? hype.requiresService : null).toBe("gpu");
    expect(hype?.distribution.INFERENCE).toBeCloseTo(0.25, 9);
    expect(hype?.distribution.STATIC).toBeCloseTo(0.3 * 0.75, 9);
    expect(sumOf(hype?.distribution ?? {})).toBeCloseTo(1, 9);
  });

  it("losing the last GPU mid-shift does NOT cancel a running hype wave", () => {
    const shift = CONFIG.survival.trafficShift;
    pin.value = 0.99; // the last eligible shift: the hype wave once a GPU exists
    const gpu = place("gpu");
    updateTrafficShift(shift.interval);
    expect(S.intervention.currentShift?.name).toBe("AI Hype Wave");
    expect(S.trafficDistribution.INFERENCE).toBeCloseTo(0.25, 9);

    deleteObject(gpu.id); // the ownership gate was selection-time only
    S.intervention.trafficShiftTimer = 5;
    updateTrafficShift(TICK);
    expect(S.intervention.trafficShiftActive).toBe(true);
    expect(S.intervention.currentShift?.name).toBe("AI Hype Wave");

    S.intervention.trafficShiftTimer = shift.duration;
    updateTrafficShift(TICK); // runs out its natural duration
    expect(S.intervention.trafficShiftActive).toBe(false);
  });
});

// =============================== LEAK BATTERY ===============================
describe("the leak battery: every request terminates exactly once", () => {
  it("MID-BATCH DEMOLISH: deleting a GPU re-homes its live batch, queue and in-flight arrivals", () => {
    const gpu = warm(place("gpu"));
    pin.value = 0.99;
    pushInference(gpu, 8, 1);
    run(0.1); // batch running
    pushInference(gpu, 3, 1); // next-batch queue
    flyInto("INFERENCE", gpu); // mid-air arrival
    expect(S.requests).toHaveLength(12);

    deleteObject(gpu.id);
    expect(S.requests).toHaveLength(0); // NOTHING stranded
    expect(S.services).toHaveLength(0);
  });

  it("REGION OUTAGE over a busy GPU: batch + gateway entries die with their region, exactly once", () => {
    const dns = place("dns");
    const alb = place("alb");
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    connect("internet", dns);
    connect(dns, alb);
    connect(alb, infgw);
    connect(infgw, gpu);

    // A busy region: a running batch of 3 and 2 gateway entries.
    pushInference(gpu, 3, 1);
    gpu.update(TICK); // the queue drains into the batch; force-launch for determinism
    gpu.batchState = "running";
    gpu.batchRunTimeMs = 5000;
    gpu.batchRunTimer = 0;
    seedPending(infgw, 2, 0);
    expect(S.requests).toHaveLength(5);

    expect(triggerRegionOutage(10)).toBe(true);

    expect(gpu.batch).toHaveLength(0); // swept, not left to finish in the dark
    expect(infgw.pending).toHaveLength(0);
    expect(gpu.isDisabled).toBe(true);
    expect(S.failures.INFERENCE).toBe(5); // failed as REGION_DOWN, counted once each
    expect(S.failuresByReason["fail_region_down"]).toBe(5);
    flush();
    expect(S.requests).toHaveLength(0);
  });

  it("EXPIRY STORM: a full gateway with no routable GPU drains entirely through the deadline, once each", () => {
    const infgw = place("infgw");
    seedPending(infgw, 20, 0);

    run(8); // well past the 6 s deadline
    expect(S.inference.expired).toBe(20); // exactly once each
    expect(infgw.pending).toHaveLength(0);
    flush();
    expect(S.requests).toHaveLength(0);
  });

  it("ALL-GPU-WARMING: with every GPU loading, held traffic waits under the grace and terminates post-load", () => {
    const infgw = place("infgw");
    place("power"); // grid headroom for the second GPU
    const g1 = place("gpu"); // both loading for 12 s: longer than the 6 s deadline
    const g2 = place("gpu");
    connect(infgw, g1);
    connect(infgw, g2);
    pin.value = 0.99;
    seedPending(infgw, 10, 0);

    run(8);
    expect(g1.queue.length + g2.queue.length).toBe(0); // never dispatched into the dark
    expect(S.inference.expired).toBe(0); // the warmup grace: the clock waited
    expect(infgw.pending).toHaveLength(10);

    run(12); // loads complete at 12 s; dispatch, batch, finish
    flush();
    expect(S.inference.expired).toBe(0);
    expect(S.requestsProcessed).toBe(10); // TERMINATION: served, not leaked
    expect(S.requests).toHaveLength(0);
  });

  it("END-TO-END drain: waf, alb, infgw, gpu serves a burst to zero in-flight", () => {
    const waf = place("waf");
    const alb = place("alb");
    const infgw = place("infgw");
    const gpu = warm(place("gpu"));
    connect("internet", waf);
    connect(waf, alb);
    connect(alb, infgw);
    connect(infgw, gpu);
    pin.value = 0.99;

    for (let t = 0; t < 24; t++) {
      flyInto("INFERENCE", waf);
      run(0.1);
    }
    run(40);
    flush();

    expect(S.requestsProcessed).toBeGreaterThan(0);
    expect(S.requests).toHaveLength(0); // NOTHING leaked
    const held = S.services.some(
      (s) =>
        s.queue.length > 0 || s.processing.length > 0 || s.batch.length > 0 || s.pending.length > 0,
    );
    expect(held).toBe(false);
  });
});
