// @vitest-environment node
// Per-service handler behavior over the real sim, for the handlers that arrived with
// the resilience stack: the replica read/write split, the SQS pull model and
// backpressure, the API gateway's prioritized shedding (and what a 429 is NOT),
// nosql, search, GeoDNS and Notification attribution, and the late-completion badge.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishRequest } from "../actions";
import { CONFIG } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { process as apigwProcess } from "../handlers/apigw";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { connect, inject, injectTo, must, place, resetWorld, run, totalFailures } from "./helpers";
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
  resetSim({ seed: "after-handlers-services" });
});

describe("read replica", () => {
  function replicaWorld() {
    const alb = place("alb");
    const compute = place("compute");
    const replica = place("replica");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, replica);
    connect(replica, db);
    return { alb, compute, replica, db };
  }

  it("READ traffic completes via the replica", () => {
    replicaWorld();
    inject("READ");
    run(10);
    expect(S.requestsProcessed).toBe(1);
    expect(S.failures.READ).toBe(0);
  });

  it("WRITE traffic fails at compute when only a replica is wired (no db/nosql on compute)", () => {
    replicaWorld();
    inject("WRITE");
    run(10);
    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.WRITE).toBe(1);
  });

  it("a WRITE that reaches a replica directly fails as READ_ONLY_REPLICA", () => {
    const { replica } = replicaWorld();
    injectTo(replica, "WRITE");
    run(5);
    expect(S.requestsProcessed).toBe(0);
    expect(S.failuresByReason[FAIL_REASONS.READ_ONLY_REPLICA]).toBe(1);
  });

  it("a replica with no master db/nosql fails even READ traffic", () => {
    const alb = place("alb");
    const compute = place("compute");
    const replica = place("replica");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, replica); // replica -> db missing
    inject("READ");
    run(10);
    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.READ).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.NO_MASTER]).toBe(1);
  });
});

describe("SQS pull model", () => {
  it("compute PULLS from an upstream queue (sqs never pushes to compute)", () => {
    const sqs = place("sqs");
    const compute = place("compute");
    const db = place("db");
    connect(sqs, compute);
    connect(compute, db);

    injectTo(sqs, "WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.failures.WRITE).toBe(0);
  });

  it("with no downstream at all the job waits in sqs processing (requeue-next)", () => {
    const sqs = place("sqs");
    injectTo(sqs, "WRITE");
    run(2);

    // Not failed, not finished: parked in the queue's processing list.
    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.WRITE).toBe(0);
    expect(sqs.processing).toHaveLength(1);
  });

  it("backpressure: a saturated downstream ALB requeues the job (requeue-stop) until it drains", () => {
    const sqs = place("sqs");
    const alb = place("alb");
    connect(sqs, alb);

    // Saturate the ALB's queue (maxQueueSize default 20) and its processing slots
    // with jobs that never finish.
    const filler = new Request("READ");
    alb.queue = Array.from({ length: 25 }, () => filler);
    alb.processing = Array.from({ length: alb.config.capacity }, () => ({
      req: filler,
      timer: -1e9,
    }));

    const req = injectTo(sqs, "WRITE");
    // Step sqs only: stepping the alb would consume the fake filler jobs.
    for (let i = 0; i < 20; i++) {
      sqs.update(0.1);
      req.update(0.1);
    }
    expect(sqs.processing).toHaveLength(1); // held back, not dropped
    expect(req.target).toBe(sqs);

    // Drain the ALB: the held job must now be forwarded.
    alb.queue = [];
    alb.processing = [];
    for (let i = 0; i < 20; i++) {
      sqs.update(0.1);
      req.update(0.1);
    }
    expect(sqs.processing).toHaveLength(0);
    expect(req.target).toBe(alb);
  });

  it("two upstream queues feed one compute round-robin", () => {
    const q1 = place("sqs");
    const q2 = place("sqs");
    const compute = place("compute");
    const db = place("db");
    connect(q1, compute);
    connect(q2, compute);
    connect(compute, db);
    pin.value = 0.99; // no load-failure noise
    for (let i = 0; i < 4; i++) {
      injectTo(q1, "WRITE");
      injectTo(q2, "WRITE");
    }
    run(20);
    expect(S.requestsProcessed).toBe(8);
    expect(S.requests).toHaveLength(0);
  });
});

describe("API gateway shedding", () => {
  function gateway() {
    const alb = place("alb");
    const apigw = place("apigw");
    const compute = place("compute");
    connect("internet", apigw);
    connect(apigw, alb);
    connect(alb, compute);
    return apigw;
  }
  const limit = (): number => must(CONFIG.services.apigw.rateLimit, "apigw.rateLimit");

  it("refuses SHEDDABLE traffic at 60% of the limit while CRITICAL is carried to the last slot", () => {
    const apigw = gateway();
    const sheddable = CONFIG.trafficTypes.STATIC;
    const critical = CONFIG.trafficTypes.WRITE;
    expect(sheddable.criticality).toBe("SHEDDABLE");
    expect(critical.criticality).toBe("CRITICAL");

    const job = (type: "STATIC" | "WRITE") => ({ req: new Request(type), timer: 0 });
    // Up to 60% of the limit everything passes.
    const edge = Math.floor(limit() * CONFIG.shedding.SHEDDABLE);
    for (let i = 0; i < edge; i++) {
      const j = job("STATIC");
      S.requests.push(j.req);
      apigwProcess(apigw, j);
      expect(j.req.throttled).toBe(false);
    }
    // One past the edge: SHEDDABLE is refused, CRITICAL is not.
    const shed = job("STATIC");
    S.requests.push(shed.req);
    expect(apigwProcess(apigw, shed)).toBe("next");
    expect(shed.req.throttled).toBe(true);

    const kept = job("WRITE");
    S.requests.push(kept.req);
    apigwProcess(apigw, kept);
    expect(kept.req.throttled).toBe(false);
  });

  it("a 429 is a soft fail: no failure counted, a gentler reputation hit, an event, then it leaves", () => {
    const apigw = gateway();
    apigw.rateCounter = 10_000; // well past every class threshold
    const req = new Request("READ");
    S.requests.push(req);
    const repBefore = S.reputation;

    expect(apigwProcess(apigw, { req, timer: 0 })).toBe("next");

    expect(req.throttled).toBe(true);
    expect(totalFailures()).toBe(0);
    expect(S.reputation).toBeCloseTo(
      repBefore + CONFIG.survival.SCORE_POINTS.THROTTLED_REPUTATION,
      6,
    );
    expect(S.events).toContainEqual({ kind: "request-throttled", id: req.id, serviceId: null });
    expect(S.requests).toContain(req); // lingers for the view
    run(1);
    expect(S.requests).not.toContain(req);
    expect(S.requestsProcessed).toBe(0);
  });

  it("the per-second counter resets, so shedding is a rate and not a lifetime cap", () => {
    const apigw = gateway();
    apigw.rateCounter = limit() + 5;
    apigw.update(1.0);
    expect(apigw.rateCounter).toBe(0);
  });

  it("never trips its own breaker by shedding", () => {
    const apigw = gateway();
    apigw.rateCounter = 10_000;
    for (let i = 0; i < 40; i++) {
      const req = new Request("STATIC");
      S.requests.push(req);
      apigwProcess(apigw, { req, timer: 0 });
    }
    expect(apigw.breakerState).toBe("closed");
  });
});

describe("nosql and search", () => {
  it("nosql serves READ and WRITE but cannot search: NOT_INDEXED", () => {
    const nosql = place("nosql");
    injectTo(nosql, "READ");
    injectTo(nosql, "WRITE");
    run(5);
    expect(S.requestsProcessed).toBe(2);

    injectTo(nosql, "SEARCH");
    run(5);
    expect(S.requestsProcessed).toBe(2);
    expect(S.failuresByReason[FAIL_REASONS.NOT_INDEXED]).toBe(1);
  });

  it("nosql refuses traffic that does not belong in a store: WRONG_STORE", () => {
    const nosql = place("nosql");
    injectTo(nosql, "UPLOAD"); // an UPLOAD belongs in object storage
    run(5);
    expect(S.requestsProcessed).toBe(0);
    expect(S.failuresByReason[FAIL_REASONS.WRONG_STORE]).toBe(1);
  });

  it("search completes SEARCH only: anything else is SEARCH_ONLY", () => {
    const search = place("search");
    injectTo(search, "SEARCH");
    run(5);
    expect(S.requestsProcessed).toBe(1);

    injectTo(search, "READ");
    run(5);
    expect(S.requestsProcessed).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.SEARCH_ONLY]).toBe(1);
  });
});

describe("failure attribution at the new handlers", () => {
  it("a GeoDNS with nothing downstream fails the record as NO_ROUTE", () => {
    const dns = place("dns");
    connect("internet", dns);
    inject("READ");
    run(5);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBe(1);
  });

  it("a Pub/Sub with no subscriber fails the event as NO_SUBSCRIBER", () => {
    const pubsub = place("pubsub");
    injectTo(pubsub, "WRITE");
    run(5);
    expect(S.failuresByReason[FAIL_REASONS.NO_SUBSCRIBER]).toBe(1);
  });

  it("a warehouse that is asked to serve a read says ANALYTICS_STORE", () => {
    const warehouse = place("warehouse");
    injectTo(warehouse, "READ");
    run(20);
    expect(S.failuresByReason[FAIL_REASONS.ANALYTICS_STORE]).toBe(1);
  });

  it("a Notification completes anything it is sent", () => {
    const notify = place("notify");
    for (const type of ["READ", "WRITE", "STATIC"] as const) injectTo(notify, type);
    run(5);
    expect(S.requestsProcessed).toBe(3);
  });
});

describe("the late-completion badge", () => {
  it("badges the node that made a request wait past its SLO, in survival", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    const req = new Request("READ");
    S.requests.push(req);
    req.age = 1000; // far past any SLO
    finishRequest(req, db);
    expect(req.wasLate).toBe(true);
    expect(S.events).toContainEqual({ kind: "service-badge", serviceId: db.id, key: "soft_slow" });
  });

  it("does not badge an on-time completion", () => {
    resetWorld({ mode: "survival" });
    const db = place("db");
    const req = new Request("READ");
    S.requests.push(req);
    req.age = 0.01;
    finishRequest(req, db);
    expect(S.events.some((e) => e.kind === "service-badge")).toBe(false);
  });
});
