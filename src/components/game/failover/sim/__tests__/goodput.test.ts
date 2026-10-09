// @vitest-environment node
// Lateness has a price, and goodput is the report of it.
//
// The bug this closes is not a crash, it is a LESSON TAUGHT BACKWARDS. Measured on
// the upstream game: a board with a Message Queue in front of a saturated Compute
// scored 0 failures and reputation 100 while requests stood twelve seconds in the
// pipe. In production that board is an outage, and the game's own hint recommended
// the move that gets people paged.
//
// A queue does not remove load. It converts drops into latency, and past the caller's
// deadline that is the same drop with the bill still paid. Rolling goodput is the
// bounded ratio that says so: of everything the board was asked to do in the last 30
// game seconds, what share was answered while someone still wanted it.
//
// Ported from upstream's goodput and goodput-hud suites. The campaign mode cases run
// in sandbox, which is the same rule for this purpose (the price is survival-only).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failRequest, finishRequest } from "../actions";
import { CONFIG, TICK, type TrafficMix } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { getRollingGoodput, metricsTick } from "../metrics";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { step } from "../tick";
import type { GameMode } from "../types";
import { connect, place, resetWorld } from "./helpers";

beforeEach(() => resetWorld({ mode: "survival" }));
afterEach(() => resetSim({ seed: "after-goodput" }));

const SLO = CONFIG.trafficTypes.READ.sloSec ?? 0;

/** The mix the lesson boards run: fixed here so a balance tweak cannot silently move the baseline. */
const REFERENCE_MIX: TrafficMix = {
  STATIC: 0.25,
  READ: 0.4,
  WRITE: 0.1,
  UPLOAD: 0.05,
  SEARCH: 0.1,
  MALICIOUS: 0.1,
  INFERENCE: 0,
};

function request(age: number): Request {
  const req = new Request("READ");
  S.requests.push(req);
  req.age = age;
  return req;
}

// Roll the goodput window one sample forward.
function roll(samples = 1): void {
  for (let i = 0; i < samples * Math.round(0.5 / TICK); i++) metricsTick();
}

describe("a request carries its own game-time age", () => {
  it("ages by GAME time, so the step size does not change how long a wait is", () => {
    const req = new Request("READ");
    S.requests.push(req);
    for (let i = 0; i < 60; i++) req.update(1 / 60); // one second at 60 fps
    const atNormal = req.age;

    const req2 = new Request("READ");
    S.requests.push(req2);
    for (let i = 0; i < 20; i++) req2.update(3 / 60); // one game-second in bigger steps
    expect(req2.age).toBeCloseTo(atNormal, 6);
  });

  it("a queued request ages while it waits: it is not free time", () => {
    const compute = place("compute");
    const req = new Request("READ");
    S.requests.push(req);
    compute.queue.push(req); // parked, going nowhere
    for (let i = 0; i < 120; i++) req.update(1 / 60);
    expect(req.age).toBeCloseTo(2, 1);
  });
});

describe("a late completion is worth less", () => {
  function completeAt(age: number, mode: GameMode = "survival") {
    resetWorld({ mode });
    const db = place("db");
    const req = request(age);
    const before = { money: S.money, rep: S.reputation };
    finishRequest(req, db);
    return {
      earned: S.money - before.money,
      repDelta: +(S.reputation - before.rep).toFixed(4),
      wasLate: req.wasLate,
      pastSlo: req.pastSlo,
    };
  }

  it("inside the SLO it pays in full and earns reputation", () => {
    const r = completeAt(SLO - 0.5);
    expect(r.wasLate).toBe(false);
    expect(r.earned).toBeCloseTo(CONFIG.trafficTypes.READ.reward, 5);
    expect(r.repDelta).toBeCloseTo(CONFIG.survival.SCORE_POINTS.SUCCESS_REPUTATION, 5);
  });

  it("past the SLO it still completes, but pays less and COSTS reputation", () => {
    // The whole point: not a failure. The request was served, the customer had gone.
    const before = { ...S.failures };
    const r = completeAt(SLO * 2);
    expect(r.wasLate).toBe(true);
    expect(r.earned).toBeLessThan(CONFIG.trafficTypes.READ.reward);
    expect(r.repDelta).toBeLessThan(0);
    expect(S.failures).toEqual(before);
  });

  it("the penalty is a GRADIENT, not a cliff", () => {
    const barely = completeAt(SLO * 1.05).earned;
    const middling = completeAt(SLO * 1.5).earned;
    const hopeless = completeAt(SLO * 3).earned;
    expect(barely).toBeGreaterThan(middling);
    expect(middling).toBeGreaterThan(hopeless);
    // Even a hopelessly late answer is worth serving: shedding it would be worse for
    // the player and would teach the wrong reflex.
    expect(hopeless).toBeGreaterThan(0);
  });

  it("outside survival the price is off: a catastrophically late answer pays in full", () => {
    const r = completeAt(SLO * 5, "sandbox");
    expect(r.earned).toBeCloseTo(CONFIG.trafficTypes.READ.reward, 5);
    expect(r.repDelta).toBeCloseTo(CONFIG.survival.SCORE_POINTS.SUCCESS_REPUTATION, 5);
    expect(r.wasLate).toBe(false);
  });

  it("survival counts each late completion ONCE: the price and the count are separate", () => {
    // The count moved out of the survival-only branch so other modes could have it
    // too. Leaving a copy behind in that branch double-counts, and the debrief would
    // then report more late requests than were served.
    const db = place("db");
    for (let i = 0; i < 4; i++) finishRequest(request(SLO * 2), db);
    expect(S.lateCompletions).toBe(4);
    expect(S.lateCompletions).toBeLessThanOrEqual(S.requestsProcessed);
  });

  it("GOODPUT IS A REPORT, NOT A PRICE: it sees lateness in every mode", () => {
    // The headline HUD number once read the priced flag (wasLate), which is
    // survival-only by design. So the same board, every answer three SLOs late,
    // measured 0% in survival and 100% GREEN everywhere else.
    const measure = (mode: GameMode): number | null => {
      resetWorld({ mode });
      const db = place("db");
      for (let i = 0; i < 10; i++) finishRequest(request(SLO * 3), db);
      roll();
      return getRollingGoodput();
    };
    const survival = measure("survival");
    const sandbox = measure("sandbox");
    expect(survival).toBe(0);
    expect(sandbox, "sandbox read 100% while every answer was late").toBe(survival);
  });

  it("...and a PUNCTUAL board still reads 100% in every mode", () => {
    // The mirror. A fix that simply buckets everything as late would satisfy the test
    // above and be just as wrong.
    for (const mode of ["survival", "sandbox"] as const) {
      resetWorld({ mode });
      const db = place("db");
      for (let i = 0; i < 10; i++) finishRequest(request(SLO - 0.5), db);
      roll();
      expect(getRollingGoodput(), `${mode} punished a board that was on time`).toBe(1);
    }
  });

  it("the PRICE stays survival-only: the report moving must not move balance", () => {
    // pastSlo is the observation; wasLate is what reputation and the SLOW badge read
    // back. Setting wasLate in every mode would re-price every tuned level.
    const r = completeAt(SLO * 5, "sandbox");
    expect(r.wasLate).toBe(false);
    expect(r.pastSlo).toBe(true);
    expect(r.earned).toBeCloseTo(CONFIG.trafficTypes.READ.reward, 5);
    expect(r.repDelta).toBeCloseTo(CONFIG.survival.SCORE_POINTS.SUCCESS_REPUTATION, 5);
  });

  it("...but the debrief counter still counts it outside survival, or it reports a lie", () => {
    // The price is survival-only on purpose. The COUNT must not be: the debrief
    // divides onTime by processed, so a board where every request stood past its SLO
    // used to report "served N/N on time, 100%": true of the counter, false of the room.
    resetWorld({ mode: "sandbox" });
    const db = place("db");
    for (let i = 0; i < 3; i++) finishRequest(request(SLO * 5), db);
    finishRequest(request(SLO - 0.5), db);

    expect(S.lateCompletions).toBe(3);
    expect(S.requestsProcessed).toBe(4);
  });
});

describe("goodput is a bounded ratio, not an integral", () => {
  // Terminate one request the way the sim does, then roll the sample window.
  function serve({ age = 0, fail = false }: { age?: number; fail?: boolean } = {}): void {
    const db = S.services.find((s) => s.type === "db") ?? place("db");
    const req = request(age);
    if (fail) failRequest(req, FAIL_REASONS.QUEUE_FULL);
    else finishRequest(req, db);
  }

  it("reads null on an idle board: silence is not success", () => {
    // The precise failure it must not repeat: reputation says 100 when nothing has
    // happened, which is the least informative moment possible.
    roll(4);
    expect(getRollingGoodput()).toBeNull();
  });

  it("is 1.0 when every request is answered in time", () => {
    for (let i = 0; i < 10; i++) serve({ age: SLO - 1 });
    roll();
    expect(getRollingGoodput()).toBe(1);
  });

  it("counts a LATE completion against you, though it is not a failure", () => {
    // The distinction the whole lateness line of work exists to make: served, but
    // after the customer left. S.failures stays at zero here.
    const before = { ...S.failures };
    for (let i = 0; i < 5; i++) serve({ age: SLO - 1 });
    for (let i = 0; i < 5; i++) serve({ age: SLO * 2 });
    roll();
    expect(getRollingGoodput()).toBeCloseTo(0.5, 6);
    expect(S.failures).toEqual(before);
  });

  it("counts drops in the denominator", () => {
    // Otherwise a board that drops everything and serves three requests fast would
    // proudly report 100%.
    for (let i = 0; i < 3; i++) serve({ age: SLO - 1 });
    for (let i = 0; i < 7; i++) serve({ fail: true });
    roll();
    expect(getRollingGoodput()).toBeCloseTo(0.3, 6);
  });

  it("is bounded to 0..1 whatever happens", () => {
    for (let i = 0; i < 200; i++) serve({ fail: true });
    roll();
    const g = getRollingGoodput() ?? -1;
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(1);
  });

  it("the window actually rolls: a bad patch is forgotten after 30 game seconds", () => {
    // The point of a WINDOW: a board that was drowning and then recovered must be able
    // to show it, which reputation structurally cannot (it only climbs back at +0.1
    // per request).
    for (let i = 0; i < 20; i++) serve({ fail: true });
    roll();
    expect(getRollingGoodput()).toBe(0);

    // 30 game seconds of clean serving is 60 samples at 2 Hz.
    for (let s = 0; s < 60; s++) {
      serve({ age: SLO - 1 });
      roll();
    }
    expect(getRollingGoodput()).toBe(1);
  });

  it("a new run starts with an empty window", () => {
    for (let i = 0; i < 5; i++) serve({ fail: true });
    roll();
    expect(getRollingGoodput()).toBe(0);
    resetWorld({ mode: "survival" });
    expect(getRollingGoodput()).toBeNull();
  });

  it("says something reputation cannot: it separates a coasting board from a struggling one", () => {
    S.reputation = 100;
    roll(4);
    const coasting = getRollingGoodput();

    for (let i = 0; i < 10; i++) serve({ age: SLO * 2 }); // all late
    roll();
    const struggling = getRollingGoodput();

    expect(coasting).toBeNull(); // nothing happening
    expect(struggling).toBe(0); // busy, and every answer wasted
    expect(S.reputation).toBeGreaterThan(0); // reputation cannot tell them apart yet
  });
});

// The board the hint system tells the player to build, with and without the queue it
// recommends. Everything else is identical.
function board({ withQueue }: { withQueue: boolean }): void {
  resetWorld({ money: 1e9, mode: "survival", seed: "goodput-lesson" });
  const waf = place("waf");
  const alb = place("alb");
  const compute = place("compute");
  const cache = place("cache");
  const db = place("db");
  const s3 = place("s3");
  const search = place("search");
  const cdn = place("cdn");
  connect("internet", waf);
  connect(waf, alb);
  if (withQueue) {
    const sqs = place("sqs");
    connect(alb, sqs);
    connect(sqs, compute);
  } else {
    connect(alb, compute);
  }
  connect(compute, cache);
  connect(cache, db);
  connect(compute, db);
  connect(compute, s3);
  connect(compute, search);
  // STATIC goes to the edge, as it does on the reference board: without this a
  // quarter of the traffic lands on Compute and the "healthy" board is not.
  connect("internet", cdn);
  connect(cdn, s3);
  S.trafficDistribution = { ...REFERENCE_MIX };
}

// Survival's pricing and wear, without its events: the lesson is about the queue, so
// the spike, the shifts, the random events and the ramp must not move the offered
// load or the mix under it.
function playBoard({
  withQueue,
  rps,
  seconds = 60,
}: {
  withQueue: boolean;
  rps: number;
  seconds?: number;
}) {
  const sv = CONFIG.survival;
  const saved = {
    spike: sv.maliciousSpike.enabled,
    shift: sv.trafficShift.enabled,
    random: sv.randomEvents.enabled,
    ramp: sv.rpsAcceleration.enabled,
  };
  sv.maliciousSpike.enabled = false;
  sv.trafficShift.enabled = false;
  sv.randomEvents.enabled = false;
  sv.rpsAcceleration.enabled = false;
  try {
    board({ withQueue });
    if (S.services.length === 0) throw new Error("board did not build");
    for (let i = 0, n = Math.round(seconds / TICK); i < n; i++) {
      S.currentRPS = rps; // the survival ramp would otherwise move it every step
      step();
    }
  } finally {
    sv.maliciousSpike.enabled = saved.spike;
    sv.trafficShift.enabled = saved.shift;
    sv.randomEvents.enabled = saved.random;
    sv.rpsAcceleration.enabled = saved.ramp;
  }
  const failures = Object.values(S.failures).reduce((a, b) => a + b, 0);
  const processed = S.requestsProcessed;
  const late = S.lateCompletions;
  return {
    processed,
    late,
    failures,
    lateShare: processed ? late / processed : 0,
    // Goodput: completions that were still wanted, over everything the board was asked
    // to do. Throughput counts answers; goodput counts answers someone was still
    // waiting for.
    goodput: processed + failures ? (processed - late) / (processed + failures) : 0,
    reputation: +S.reputation.toFixed(1),
  };
}

describe("THE LESSON: buffering relocates failure, it does not remove it", () => {
  it("a queue converts drops into lateness, and lateness is visible", () => {
    const bare = playBoard({ withQueue: false, rps: 8 });
    const queued = playBoard({ withQueue: true, rps: 8 });

    // The queue really does absorb drops: that part was always true, and it is why
    // the hint recommends it.
    expect(queued.failures).toBeLessThan(bare.failures / 5);
    // ...but it pays for them in WAITING, and the waiting is no longer free.
    expect(bare.late).toBe(0); // the unbuffered board drops instead of stalling
    expect(queued.lateShare).toBeGreaterThan(0.35);
  });

  it("a healthy board is never late: the price only bites under saturation", () => {
    // If a well-built board paid this tax, the mechanic would be a flat tax on
    // playing, not a lesson about saturation.
    for (const rps of [2, 4, 6]) {
      const r = playBoard({ withQueue: false, rps, seconds: 30 });
      expect(r.late, `rps=${rps} should have no late completions`).toBe(0);
      expect(r.reputation).toBeGreaterThan(80);
    }
  });

  it("goodput separates a working board from a busy one", () => {
    // Throughput alone cannot tell these apart; that is why it is the wrong number to
    // steer by.
    const healthy = playBoard({ withQueue: true, rps: 4, seconds: 30 });
    const drowning = playBoard({ withQueue: true, rps: 10, seconds: 30 });
    // A healthy buffered board wastes nothing; a drowning one throws away a good share
    // of everything it does, while its THROUGHPUT still looks busy.
    expect(healthy.goodput).toBeGreaterThan(0.9);
    expect(drowning.goodput).toBeLessThan(healthy.goodput * 0.8);
  });
});
