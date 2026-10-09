// @vitest-environment node
// Sandbox archetypes, batch 1: DLQ, Pub/Sub, Auth, Scheduler, Notify. Every
// archetype gets (a) a distinguishable-behavior test proving it does something no
// existing service does, and (b) a termination test proving the cardinal invariant:
// in-flight drains to 0 after traffic stops, every request finishes, fails or is
// removed exactly once. Plus fan-out count exactness, DLQ park/drain/overflow,
// scheduler freeze at dt 0, auth malicious catch, notify silent fail,
// connection-validity (anti-cycle) checks, and a combined leak battery over all
// five wired together.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifySilentFail } from "../actions";
import { CONFIG } from "../config";
import { parkInDLQ } from "../dlq-park";
import { Request } from "../request";
import { resetSim, S } from "../state";
import type { ServiceType } from "../config";
import {
  connect,
  expectDrained,
  inject,
  injectTo,
  must,
  place,
  resetWorld,
  run,
  totalFailures,
} from "./helpers";
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
  resetSim({ seed: "after-archetypes" });
});

// A failed request lingers a moment for the view before it is removed.
function flushRemovals(): void {
  run(1);
}

// ============================ DEAD-LETTER QUEUE ============================
describe("Dead-Letter Queue", () => {
  // internet -> alb -> compute -> dlq, with NO database: every WRITE fails to route
  // at compute and must be parked in the DLQ instead of dropped.
  function dlqWorld() {
    const alb = place("alb");
    const compute = place("compute");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, dlq); // failure-sink edge
    return { alb, compute, dlq };
  }

  it("DISTINGUISHABLE: parks a finally-failed request, then recovers it (neither success nor failure)", () => {
    const { dlq } = dlqWorld();
    pin.value = 0.99; // no load-failure noise
    inject("WRITE");

    // Watch the request get parked, then drained back out over time.
    let peakParked = 0;
    for (let i = 0; i < 200; i++) {
      run(0.1);
      peakParked = Math.max(peakParked, dlq.parked.length);
    }

    expect(peakParked).toBe(1); // it WAS parked (no existing node holds a dead request)
    expect(dlq.parked).toHaveLength(0); // ...and drained away (recovered)
    expect(S.requestsProcessed).toBe(0); // never counted as a success
    expect(S.failures.WRITE).toBe(0); // never counted as a failure
    expect(S.requests).toHaveLength(0); // TERMINATION: no leak
  });

  it("draining costs money and refunds a little reputation", () => {
    const { dlq } = dlqWorld();
    pin.value = 0.99;
    S.reputation = 50; // the step caps standing at 100, so start below it
    const moneyBefore = S.money;
    const repBefore = S.reputation;
    inject("WRITE");
    run(25);

    expect(dlq.parked).toHaveLength(0);
    expect(S.money).toBeCloseTo(
      moneyBefore - must(CONFIG.services.dlq.drainCost, "dlq.drainCost"),
      5,
    );
    expect(S.reputation).toBeCloseTo(
      repBefore + must(CONFIG.services.dlq.drainRepRefund, "dlq.drainRepRefund"),
      5,
    );
  });

  it("overflow: a full DLQ refuses the park (caller fails normally) and takes an extra reputation penalty", () => {
    const { compute, dlq } = dlqWorld();
    // Fill the DLQ to its cap with real parked requests.
    dlq.parked = Array.from({ length: CONFIG.services.dlq.capacity }, () => new Request("WRITE"));
    const repBefore = S.reputation;

    const req = new Request("WRITE");
    const parked = parkInDLQ(req, compute);

    expect(parked).toBe(false); // refused: the caller must fail it
    expect(S.reputation).toBeCloseTo(
      repBefore - must(CONFIG.services.dlq.overflowRepPenalty, "dlq.overflowRepPenalty"),
      5,
    );
  });

  it("MALICIOUS is never parked (no dodging the breach penalty via a DLQ)", () => {
    const { compute, dlq } = dlqWorld();
    const req = new Request("MALICIOUS");
    expect(parkInDLQ(req, compute)).toBe(false);
    expect(dlq.parked).toHaveLength(0);
  });

  it("with no DLQ wired, the same WRITE fails normally (proves the DLQ is what changed the outcome)", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute); // no DLQ, no DB
    pin.value = 0.99;
    inject("WRITE");
    run(10);
    flushRemovals();

    expect(S.failures.WRITE).toBe(1);
    expect(S.requests).toHaveLength(0);
  });

  it("a DLQ is never a normal forward target (genericForward routes past it to the real downstream)", () => {
    // alb -> compute AND alb -> dlq: normal traffic must still reach compute, never
    // the sink.
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, compute);
    connect(alb, dlq);
    connect(compute, db);
    pin.value = 0.99;
    inject("WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(1); // delivered to compute -> db, not sunk
    expect(dlq.parked).toHaveLength(0);
  });
});

// ============================== PUB/SUB TOPIC ==============================
describe("Pub/Sub Topic", () => {
  it("DISTINGUISHABLE: fans one event out to EXACTLY N terminating deliveries", () => {
    const pubsub = place("pubsub");
    const compute = place("compute");
    const serverless = place("serverless");
    const notify = place("notify");
    const db = place("db");
    connect(pubsub, compute);
    connect(pubsub, serverless);
    connect(pubsub, notify);
    connect(compute, db);
    connect(serverless, db);

    injectTo(pubsub, "WRITE"); // ONE inbound event
    run(15);

    expect(S.requestsProcessed).toBe(3); // one delivery per subscriber
    expect(S.requests).toHaveLength(0); // TERMINATION: every clone drained
  });

  it("THE MONEY PRINTER: subscribers used to multiply the money from one event", () => {
    // A clone is an extra DELIVERY of one arrival, not an extra arrival. It used to
    // run the full success path (money, score and standing), so wiring a second and
    // third subscriber tripled the income from unchanged customer traffic at a few
    // dollars of extra upkeep. That is fan-out backwards: real fan-out costs MORE
    // per event and is not paid more for it.
    const board = (subscriberCount: number) => {
      resetWorld({ mode: "survival" });
      const pubsub = place("pubsub");
      // Each subscriber gets its OWN database. Sharing one would make the
      // three-subscriber board saturate it, and the capacity effect is real but it
      // is not what this test is measuring. Isolating it leaves subscriber count as
      // the only variable.
      for (let i = 0; i < subscriberCount; i++) {
        const c = place("compute");
        const db = place("db");
        connect(pubsub, c);
        connect(c, db);
      }
      const before = { money: S.money, score: S.score.total, rep: S.reputation };
      for (let i = 0; i < 5; i++) injectTo(pubsub, "WRITE"); // five customer events
      run(20);
      return {
        earned: +(S.money - before.money).toFixed(4),
        score: S.score.total - before.score,
        rep: +(S.reputation - before.rep).toFixed(4),
        processed: S.requestsProcessed,
        leftover: S.requests.length,
        fails: totalFailures(),
      };
    };
    const one = board(1);
    const three = board(3);

    // The same five customers pay the same, whatever the topology behind them.
    expect(three.earned).toBeCloseTo(one.earned, 6);
    expect(three.score).toBe(one.score);
    expect(three.rep).toBeCloseTo(one.rep, 6);

    // ...and the deliveries themselves are still real and still counted: three
    // subscribers really did do three times the work.
    expect(three.processed).toBe(one.processed * 3);
    expect(three.leftover).toBe(0); // TERMINATION still holds
    expect(three.fails).toBe(0); // ...and nothing was dropped
  });

  it("the ORIGINAL still pays in full; only the copies are unpaid", () => {
    resetWorld({ mode: "survival" });
    const pubsub = place("pubsub");
    const compute = place("compute");
    const db = place("db");
    connect(pubsub, compute);
    connect(compute, db);
    const before = S.money;
    injectTo(pubsub, "WRITE");
    run(15);
    expect(S.money - before).toBeCloseTo(CONFIG.trafficTypes.WRITE.reward, 6);
  });

  it("...and a copy that FAILS still costs: fan-out buys risk, not revenue", () => {
    // The other half of the lesson. If copies were made inert entirely, extra
    // subscribers would be free, which is its own lie.
    resetWorld({ mode: "survival" });
    const pubsub = place("pubsub");
    const good = place("compute");
    const db = place("db");
    connect(pubsub, good);
    connect(good, db);
    // A second subscriber with nowhere to send its work.
    const orphan = place("compute");
    connect(pubsub, orphan);

    const before = { rep: S.reputation, fails: totalFailures() };
    for (let i = 0; i < 5; i++) injectTo(pubsub, "WRITE");
    run(20);
    expect(totalFailures(), "a delivery that goes nowhere is still a failure").toBeGreaterThan(
      before.fails,
    );
    expect(S.reputation).toBeLessThan(before.rep);
  });

  it("one subscriber: the original is delivered, no clone is minted", () => {
    const pubsub = place("pubsub");
    const notify = place("notify");
    connect(pubsub, notify);

    injectTo(pubsub, "WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.requests).toHaveLength(0);
  });

  it("fan-out count scales with subscriber count (2 subscribers, 2 deliveries)", () => {
    const pubsub = place("pubsub");
    const notify1 = place("notify");
    const notify2 = place("notify");
    connect(pubsub, notify1);
    connect(pubsub, notify2);

    injectTo(pubsub, "WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(2);
    expect(S.requests).toHaveLength(0);
  });

  it("no subscriber: the event fails and does not leak", () => {
    const pubsub = place("pubsub");
    injectTo(pubsub, "WRITE");
    run(10);
    flushRemovals();

    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.WRITE).toBe(1);
    expect(S.requests).toHaveLength(0);
  });

  it("a burst of events fans out without leaking (leak check under load)", () => {
    const pubsub = place("pubsub");
    const notify1 = place("notify");
    const notify2 = place("notify");
    connect(pubsub, notify1);
    connect(pubsub, notify2);
    pin.value = 0.99;

    for (let i = 0; i < 5; i++) injectTo(pubsub, "WRITE");
    run(20);

    expect(S.requestsProcessed).toBe(10); // 5 events x 2 subscribers
    expect(S.requests).toHaveLength(0);
  });
});

// ============================= AUTH / IDENTITY =============================
describe("Auth / Identity", () => {
  // internet -> auth -> alb -> compute -> db (no WAF: malicious reaches auth).
  function authWorld() {
    const auth = place("auth");
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", auth);
    connect(auth, alb);
    connect(alb, compute);
    connect(compute, db);
    return { auth, alb, compute, db };
  }

  it("DISTINGUISHABLE: trades latency for security: its processingTime dwarfs a plain load balancer's", () => {
    expect(CONFIG.services.auth.processingTime).toBeGreaterThan(
      CONFIG.services.alb.processingTime * 2,
    );
    expect(CONFIG.services.auth.catchRate).toBeGreaterThan(0);
  });

  it("catches MALICIOUS on the pass-through path when the roll is under catchRate", () => {
    authWorld();
    pin.value = 0.0; // 0 < catchRate: caught
    inject("MALICIOUS");
    run(10);

    expect(S.score.maliciousBlocked).toBeGreaterThan(0);
    expect(S.failures.MALICIOUS).toBe(0); // no breach
    expect(S.requests).toHaveLength(0);
  });

  it("MALICIOUS that is NOT caught slips through and breaches downstream", () => {
    authWorld();
    pin.value = 0.99; // 0.99 >= catchRate: slips
    inject("MALICIOUS");
    run(10);
    flushRemovals();

    expect(S.score.maliciousBlocked).toBe(0);
    expect(S.failures.MALICIOUS).toBe(1); // counted as a breach
    expect(S.requests).toHaveLength(0);
  });

  it("legitimate traffic passes through auth and completes (with the latency hop)", () => {
    authWorld();
    pin.value = 0.99;
    inject("READ");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.failures.READ).toBe(0);
    expect(S.requests).toHaveLength(0);
  });
});

// ============================= SCHEDULER / CRON =============================
describe("Scheduler / Cron", () => {
  function schedulerWorld() {
    const scheduler = place("scheduler");
    const compute = place("compute");
    const db = place("db");
    connect(scheduler, compute);
    connect(compute, db);
    return { scheduler, compute, db };
  }

  it("DISTINGUISHABLE: generates its OWN traffic with zero external RPS", () => {
    schedulerWorld();
    pin.value = 0.99; // avoid load-failure noise
    expect(S.requestsProcessed).toBe(0);

    run(15); // more than one intervalSec (8s): exactly one burst

    expect(S.requestsProcessed).toBe(
      must(CONFIG.services.scheduler.burstSize, "scheduler.burstSize"),
    );
    expect(S.requests).toHaveLength(0); // TERMINATION
  });

  it("respects pause: at dt=0 the cron timer never advances and nothing is emitted", () => {
    const { scheduler } = schedulerWorld();
    for (let i = 0; i < 300; i++) scheduler.update(0); // paused frames: dt is 0

    expect(S.requests).toHaveLength(0);
    expect(S.requestsProcessed).toBe(0);
  });

  it("emits a second burst after a second interval elapses", () => {
    schedulerWorld();
    pin.value = 0.99;
    run(20); // two intervals (8s, 16s) have passed

    expect(S.requestsProcessed).toBe(
      must(CONFIG.services.scheduler.burstSize, "scheduler.burstSize") * 2,
    );
    expect(S.requests).toHaveLength(0);
  });

  it("with no downstream wired it emits nothing (no stranded requests)", () => {
    place("scheduler"); // unconnected
    run(20);

    expect(S.requests).toHaveLength(0);
    expect(S.requestsProcessed).toBe(0);
  });
});

// ============================== NOTIFICATION ==============================
describe("Notification", () => {
  it("DISTINGUISHABLE: a successful send earns MORE reputation than a plain database terminal", () => {
    // Notify success.
    S.reputation = 50; // the step caps standing at 100, so start below it
    const notify = place("notify");
    const repStart = S.reputation;
    injectTo(notify, "WRITE");
    run(5);
    const notifyGain = S.reputation - repStart;

    // DB success, fresh world.
    resetWorld();
    S.reputation = 50;
    const db = place("db");
    const repStart2 = S.reputation;
    injectTo(db, "WRITE");
    run(5);
    const dbGain = S.reputation - repStart2;

    expect(S.requestsProcessed).toBe(1);
    expect(notifyGain).toBeGreaterThan(dbGain); // the reputation hook
    expect(notifyGain).toBeCloseTo(
      dbGain + must(CONFIG.services.notify.repBonus, "notify.repBonus"),
      5,
    );
  });

  it("a successful send still terminates cleanly and pays the money reward", () => {
    const notify = place("notify");
    const moneyBefore = S.money;
    injectTo(notify, "WRITE");
    run(5);

    expect(S.requestsProcessed).toBe(1);
    expect(S.money).toBeGreaterThan(moneyBefore); // reward paid
    expect(S.requests).toHaveLength(0);
  });

  it("silent failure (direct): dissatisfaction, no counted failure, request removed", () => {
    const notify = place("notify");
    const req = injectTo(notify, "WRITE");
    const repBefore = S.reputation;

    notifySilentFail(req, notify);

    expect(S.reputation).toBeCloseTo(
      repBefore - must(CONFIG.services.notify.dissatisfaction, "notify.dissatisfaction"),
      5,
    );
    expect(notify.dissatisfactionCount).toBe(1);
    expect(S.failures.WRITE).toBe(0); // not a scored failure
    expect(S.requestsProcessed).toBe(0);
    expect(S.requests.includes(req)).toBe(false); // removed
  });

  it("overload failures are SILENT: drops accrue dissatisfaction, never a scored failure", () => {
    const notify = place("notify");
    const cap = CONFIG.services.notify.capacity;
    // Construct a genuinely overloaded frame directly: a full slate of jobs whose
    // processing is already finished, plus a backed-up queue, so totalLoad > 0.5
    // and the load-failure roll fires on every completion.
    const mk = (): Request => {
      const r = new Request("WRITE");
      S.requests.push(r);
      return r;
    };
    for (let i = 0; i < cap; i++) notify.processing.push({ req: mk(), timer: 1e9 });
    // Deep queue (more than cap) so totalLoad stays above 0.5 through every one of
    // this frame's completions; otherwise load falls under threshold mid-loop and
    // the tail of the jobs would succeed instead of dropping.
    for (let i = 0; i < cap + 10; i++) notify.queue.push(mk());
    pin.value = 0.0; // completion rolls fail while overloaded

    const repBefore = S.reputation;
    notify.update(0.1); // the overloaded frame: all cap jobs drop silently

    // The signature that distinguishes it from every other node: drops happened
    // (dissatisfaction accrued) yet NONE were counted as a scored failure.
    expect(notify.dissatisfactionCount).toBe(cap);
    expect(S.failures.WRITE).toBe(0);
    expect(S.reputation).toBeCloseTo(
      repBefore - cap * must(CONFIG.services.notify.dissatisfaction, "notify.dissatisfaction"),
      5,
    );

    // Drain the rest (the queued jobs complete under normal load): no leak.
    pin.value = null;
    run(10);
    expect(S.requests).toHaveLength(0);
  });
});

// ===================== CONNECTION VALIDITY (anti-cycle) =====================
describe("archetype connection rules (no cycles)", () => {
  const rejects = (fromType: ServiceType, toType: ServiceType): boolean => {
    const from = place(fromType);
    const to = place(toType);
    connect(from, to);
    return !from.connections.includes(to.id);
  };

  it("DLQ is a pure sink: it has no outgoing edges", () => {
    expect(rejects("dlq", "compute")).toBe(true);
    expect(rejects("dlq", "alb")).toBe(true);
  });

  it("Notification is a pure sink: it has no outgoing edges", () => {
    expect(rejects("notify", "compute")).toBe(true);
    expect(rejects("notify", "db")).toBe(true);
  });

  it("Scheduler is a pure source: nothing may route INTO it", () => {
    expect(rejects("compute", "scheduler")).toBe(true);
    expect(rejects("alb", "scheduler")).toBe(true);
  });

  it("Pub/Sub does not route back up to a load balancer or gateway (no loop)", () => {
    expect(rejects("pubsub", "alb")).toBe(true);
    expect(rejects("pubsub", "apigw")).toBe(true);
  });

  it("valid archetype edges are accepted", () => {
    const compute = place("compute");
    const dlq = place("dlq");
    connect(compute, dlq);
    expect(compute.connections).toContain(dlq.id);

    const alb = place("alb");
    const pubsub = place("pubsub");
    connect(alb, pubsub);
    expect(alb.connections).toContain(pubsub.id);

    const scheduler = place("scheduler");
    const sqs = place("sqs");
    connect(scheduler, sqs);
    expect(scheduler.connections).toContain(sqs.id);
  });
});

// =============================== LEAK BATTERY ===============================
describe("combined leak battery (the cardinal invariant)", () => {
  it("all five archetypes wired together: mixed traffic + cron all drain to 0", () => {
    // internet -> auth -> alb ; alb -> pubsub, alb -> compute, alb -> dlq
    // pubsub -> compute2, pubsub -> notify, pubsub -> s3
    // compute -> db, compute -> dlq ; scheduler -> sqs -> compute2 ; compute2 -> db
    const auth = place("auth");
    const alb = place("alb");
    const pubsub = place("pubsub");
    const compute = place("compute");
    const compute2 = place("compute");
    const db = place("db");
    const s3 = place("s3");
    const notify = place("notify");
    const dlq = place("dlq");
    const scheduler = place("scheduler");
    const sqs = place("sqs");

    connect("internet", auth);
    connect(auth, alb);
    connect(alb, pubsub);
    connect(alb, compute);
    connect(alb, dlq);
    connect(pubsub, compute2);
    connect(pubsub, notify);
    connect(pubsub, s3);
    connect(compute, db);
    connect(compute, dlq);
    connect(compute2, db);
    connect(scheduler, sqs);
    connect(sqs, compute2);

    // Drive mixed external traffic AND let the scheduler self-inject.
    for (let t = 0; t < 120; t++) {
      if (t % 3 === 0) inject("READ");
      if (t % 4 === 0) inject("WRITE");
      if (t % 5 === 0) inject("STATIC");
      if (t % 7 === 0) inject("MALICIOUS");
      run(0.1);
    }

    // Stop all traffic, the cron source included (it would otherwise keep emitting a
    // fresh burst every interval, so some burst would always still be in the air);
    // let everything, DLQ backlog included, drain out, then let the fades pass.
    scheduler.connections = [];
    run(60);
    flushRemovals();

    expect(S.requests).toHaveLength(0); // NOTHING leaked
    expect(dlq.parked).toHaveLength(0); // DLQ fully drained
  });

  it("every spawned request is accounted for exactly once (processed + failed + parked-recovered)", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    const dlq = place("dlq");
    const notify = place("notify");
    const pubsub = place("pubsub");
    connect("internet", alb);
    connect(alb, pubsub);
    connect(alb, compute);
    connect(compute, db);
    connect(compute, dlq);
    connect(pubsub, notify);

    for (let t = 0; t < 80; t++) {
      if (t % 2 === 0) inject("WRITE");
      if (t % 3 === 0) inject("READ");
      run(0.1);
    }
    run(40);
    flushRemovals();

    // The only surviving state is the terminal counters: no request object is
    // still alive anywhere.
    expect(S.requests).toHaveLength(0);
    expectDrained();
  });
});
