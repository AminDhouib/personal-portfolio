// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  errorRate,
  recordBreakerFailure,
  recordBreakerSuccess,
  updateBreaker,
} from "../circuit-breaker";
import { CONFIG } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { Request } from "../request";
import { findRetryPeer } from "../retry";
import { isRoutable } from "../routing";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { deleteObject, findSPOFs } from "../topology";
import type { Service } from "../service";
import {
  connect,
  inject,
  injectTo,
  pinLoad,
  place,
  resetWorld,
  run,
  totalFailures,
} from "./helpers";
import { pin } from "./rng-pin";

// Failures are forced by pinning a node's load to 1: the engine's own failure
// roll is 2 * (load - 0.5), exactly 1 at full load, so every job that finishes
// processing there fails. Deterministic without touching the roll streams.

vi.mock("../rng", async (orig) =>
  (await import("./rng-pin")).withPin(await orig<typeof import("../rng")>()),
);

const R = CONFIG.resilience;

beforeEach(() => {
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-resilience" });
});

const forceFail = (service: Service): void => pinLoad(service, 1);

function fail(service: Service, n = 1): void {
  for (let i = 0; i < n; i++) recordBreakerFailure(service);
}

function succeed(service: Service, n = 1): void {
  for (let i = 0; i < n; i++) recordBreakerSuccess(service);
}

// Feed the breaker `seconds` of game time at 100 ms steps.
function tick(service: Service, seconds: number, dt = 0.1): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) updateBreaker(service, dt);
}

// Step until `predicate` holds, up to `limit` seconds of game time. Lets a test
// pin the exact tick a retry starts without hard-coding processing times.
function stepUntil(predicate: () => boolean, limit = 10): boolean {
  for (let i = 0; i < Math.round(limit / 0.05); i++) {
    if (predicate()) return true;
    step();
  }
  return predicate();
}

// A failed request lingers for the view, then leaves: let that happen.
function flushFailFades(): void {
  run(1);
}

function warnings(key: string): unknown[] {
  return S.events.filter((e) => e.kind === "warning" && e.key === key);
}

describe("breaker: trip threshold", () => {
  it("a fresh service is closed and routable", () => {
    const c = place("compute");
    expect(c.breakerState).toBe("closed");
    expect(isRoutable(c)).toBe(true);
    expect(errorRate(c)).toBe(0);
  });

  it("does not trip below tripMinEvents, however bad the rate", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents - 1);
    expect(errorRate(c)).toBe(1);
    expect(c.breakerState).toBe("closed");
  });

  it("trips once tripMinEvents failures are in the window", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    expect(c.breakerState).toBe("open");
  });

  it("does not trip below the error-rate threshold", () => {
    const c = place("compute");
    fail(c, 4);
    succeed(c, 6); // 40% over 10 events
    expect(c.breakerState).toBe("closed");
  });

  it("does not trip exactly AT the threshold (strictly greater)", () => {
    const c = place("compute");
    // Alternating, so no prefix of the window ever exceeds 50% either: the rule
    // is evaluated after every single event, not at the end.
    for (let i = 0; i < 5; i++) {
      succeed(c);
      fail(c);
    }
    expect(errorRate(c)).toBeCloseTo(R.tripErrorRate, 10);
    expect(c.breakerState).toBe("closed");
  });

  it("trips just above the threshold", () => {
    const c = place("compute");
    fail(c, 6);
    succeed(c, 5); // 54.5% over 11 events
    expect(c.breakerState).toBe("open");
  });

  it("only remembers the last windowSize events", () => {
    const c = place("compute");
    fail(c, 4);
    succeed(c, R.windowSize); // pushes every failure out of the window
    expect(c.breakerEvents).toHaveLength(R.windowSize);
    expect(errorRate(c)).toBe(0);
    expect(c.breakerState).toBe("closed");
  });

  it("raises a danger alert when it trips, naming the service type by key", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    expect(warnings("alert_breaker_open")).toEqual([
      { kind: "warning", key: "alert_breaker_open", level: "danger", params: { type: "compute" } },
    ]);
  });

  it("ignores outcomes that trickle in while it is open", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    succeed(c, 50); // stragglers say nothing about recovery
    expect(c.breakerState).toBe("open");
    expect(c.breakerEvents).toHaveLength(0);
  });

  // The breaker listens to overload, NOT to topology mistakes. Without this a
  // half-built sandbox (no CDN, no storage) trips every Compute in the world
  // within seconds, taking down the traffic it CAN still serve.
  it("a routing dead end does not trip the breaker", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute); // ...and nothing downstream of Compute at all

    // Trickled in, so utilisation never nears the overload threshold: every one
    // of these failures is purely "there is nowhere to send it".
    for (let i = 0; i < 12; i++) {
      inject("READ");
      run(2);
      expect(compute.totalLoad).toBeLessThan(0.5);
    }

    expect(S.failures.READ).toBeGreaterThan(R.tripMinEvents);
    expect(compute.breakerState).toBe("closed");
    expect(S.resilience.trips).toBe(0);
  });

  it("the load / health failure roll does trip it", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);
    forceFail(compute); // pinned at full utilisation: drops every job

    for (let i = 0; i < 20; i++) inject("READ");
    run(12);

    expect(compute.breakerState).not.toBe("closed");
    expect(S.resilience.trips).toBeGreaterThan(0);
  });

  it("a queue overflow drop trips it too", () => {
    const compute = place("compute");
    const maxQueue = compute.config.maxQueueSize ?? 20;
    for (let i = 0; i < maxQueue; i++) compute.queue.push(new Request("READ"));

    // Arrivals that cannot be accepted are the other genuine "this node is
    // failing" signal. Only the requests are stepped: letting the node process
    // would drain the queue and there would be nothing to overflow.
    for (let i = 0; i < R.tripMinEvents; i++) {
      const req = injectTo(compute, "READ");
      for (let f = 0; f < 12; f++) req.update(0.05);
      expect(req.failed).toBe(true);
    }
    expect(compute.breakerState).toBe("open");
  });

  it("counts the trip on the session counter", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    expect(S.resilience.trips).toBe(1);
  });
});

describe("breaker: open skips routing", () => {
  it("isRoutable is false while open, like a disabled node", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    expect(isRoutable(c)).toBe(false);
    const d = place("db");
    d.isDisabled = true;
    expect(isRoutable(d)).toBe(false);
  });

  it("findConnectedService skips the tripped peer and returns the healthy one", () => {
    const compute = place("compute");
    const sick = place("db");
    const healthy = place("db");
    connect(compute, sick);
    connect(compute, healthy);

    expect(compute.findConnectedService("db")).toBe(sick);
    fail(sick, R.tripMinEvents);
    expect(compute.findConnectedService("db")).toBe(healthy);
  });

  it("fails over to a healthy Compute peer under real traffic", () => {
    const alb = place("alb");
    const sick = place("compute");
    const healthy = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, sick);
    connect(alb, healthy);
    connect(sick, db);
    connect(healthy, db);

    fail(sick, R.tripMinEvents);
    // Six requests on one capacity-4 node put it at 0.75 load, where the
    // engine's failure roll is exactly 0.5: pin the rolls so none fires.
    pin.value = 0.99;
    for (let i = 0; i < 6; i++) inject("READ");
    run(6);

    expect(sick.queue).toHaveLength(0);
    expect(sick.processing).toHaveLength(0);
    expect(S.requestsProcessed).toBe(6);
  });

  it("fails fast when the only downstream is tripped", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);

    fail(compute, R.tripMinEvents);
    inject("READ");
    run(3);

    expect(compute.queue).toHaveLength(0); // never piled onto the dying node
    expect(S.failures.READ).toBe(1);
  });

  it("names the breaker, not the wiring, when the only downstream is tripped", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);

    fail(compute, R.tripMinEvents);
    inject("READ");
    run(3);

    expect(S.failuresByReason[FAIL_REASONS.CIRCUIT_OPEN]).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBeUndefined();
  });

  it("the entry picker prefers a firewall whose breaker is closed", () => {
    const sick = place("waf");
    const healthy = place("waf");
    const alb = place("alb");
    connect("internet", sick);
    connect("internet", healthy);
    connect(sick, alb);
    connect(healthy, alb);

    fail(sick, R.tripMinEvents);
    for (let i = 0; i < 4; i++) inject("READ");
    step();

    expect(S.requests.every((r) => r.target === healthy)).toBe(true);
  });

  it("still uses a tripped entry point when every entry is tripped (no black hole)", () => {
    const waf = place("waf");
    const alb = place("alb");
    connect("internet", waf);
    connect(waf, alb);

    fail(waf, R.tripMinEvents);
    const req = inject("READ");

    expect(req.target).toBe(waf);
    expect(S.failures.READ).toBe(0);
  });

  it("Compute stops pulling from a tripped upstream queue", () => {
    const sqs = place("sqs");
    const compute = place("compute");
    connect(sqs, compute);
    const req = new Request("READ");
    S.requests.push(req);
    sqs.queue.push(req);

    fail(sqs, R.tripMinEvents);
    run(2);

    // The request is still parked on the queue's own pipeline, never pulled.
    expect(compute.queue).toHaveLength(0);
    expect(compute.processing).toHaveLength(0);
    expect(compute.incomingCount).toBe(0);
    expect(sqs.queue.length + sqs.processing.length).toBe(1);
  });
});

describe("breaker: half-open recovery", () => {
  it("moves to half-open after openSec of game time", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    tick(c, R.openSec - 0.5);
    expect(c.breakerState).toBe("open");
    tick(c, 0.6);
    expect(c.breakerState).toBe("half-open");
    expect(c.breakerProbes).toBe(R.probeCount);
  });

  it("half-open admits exactly probeCount requests", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    tick(c, R.openSec + 0.2);

    for (let i = 0; i < R.probeCount - 1; i++) {
      expect(isRoutable(c)).toBe(true);
      recordBreakerSuccess(c);
    }
    expect(isRoutable(c)).toBe(true);
    recordBreakerSuccess(c); // the last probe closes it
    expect(c.breakerState).toBe("closed");
  });

  it("probeCount successes close it and reset the window", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    tick(c, R.openSec + 0.2);
    succeed(c, R.probeCount);

    expect(c.breakerState).toBe("closed");
    expect(c.breakerEvents).toHaveLength(0);
    expect(isRoutable(c)).toBe(true);
  });

  it("raises an info alert when it closes", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    tick(c, R.openSec + 0.2);
    succeed(c, R.probeCount);
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "alert_breaker_closed",
      level: "info",
      params: { type: "compute" },
    });
  });

  it("a single failed probe re-opens it with the timer reset", () => {
    const c = place("compute");
    fail(c, R.tripMinEvents);
    tick(c, R.openSec + 0.2);
    succeed(c, R.probeCount - 1); // nearly recovered...
    recordBreakerFailure(c); // ...and then a probe dies

    expect(c.breakerState).toBe("open");
    expect(c.breakerOpenSince).toBe(0);
    expect(S.resilience.trips).toBe(2);

    tick(c, R.openSec - 0.5);
    expect(c.breakerState).toBe("open"); // full cooldown all over again
  });

  it("recovers under real traffic once the node is healthy again", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    fail(compute, R.tripMinEvents);
    expect(isRoutable(compute)).toBe(false);

    run(R.openSec + 0.5); // the breaker cools down on the update loop
    expect(compute.breakerState).toBe("half-open");

    for (let i = 0; i < R.probeCount; i++) inject("READ");
    run(6);

    expect(compute.breakerState).toBe("closed");
    expect(S.requestsProcessed).toBe(R.probeCount);
  });

  // Upstream pinned this against a harness that left the game paused. The sim has
  // no pause flag, only the fixed step, so the check that remains is that the
  // step loop alone carries a tripped breaker to half-open from a cold start.
  it("reaches half-open within its own openSec cooldown on the step loop alone", () => {
    resetWorld({ mode: "survival" });
    const compute = place("compute");
    fail(compute, R.tripMinEvents);
    expect(compute.breakerState).toBe("open");

    for (let t = 0; t < 8 && compute.breakerState === "open"; t += 0.05) step();

    expect(compute.breakerState).toBe("half-open");
  });
});

describe("retry with backoff", () => {
  // internet -> alb -> { sick, healthy } -> db, with `sick` pinned to fail every job.
  function twinWorld() {
    const alb = place("alb");
    const sick = place("compute");
    const healthy = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, sick);
    connect(alb, healthy);
    connect(sick, db);
    connect(healthy, db);
    forceFail(sick);
    return { alb, sick, healthy, db };
  }

  it("retries via a healthy peer instead of failing", () => {
    const { sick } = twinWorld();

    const req = injectTo(sick, "READ");
    run(2);

    expect(req.retries).toBe(1);
    expect(S.resilience.retries).toBe(1);
    expect(S.failures.READ).toBe(0);
  });

  it("a retried request completes exactly once", () => {
    const { sick } = twinWorld();

    injectTo(sick, "READ");
    run(8);

    expect(S.requestsProcessed).toBe(1);
    expect(S.failures.READ).toBe(0);
    expect(S.score.database).toBe(CONFIG.trafficTypes.READ.score);
    expect(S.requests).toHaveLength(0);
  });

  it("tells the view which node dropped it and where it is going", () => {
    const { sick, healthy } = twinWorld();

    const req = injectTo(sick, "READ");
    run(2);

    expect(S.events).toContainEqual({
      kind: "request-retry",
      id: req.id,
      serviceId: sick.id,
      peerId: healthy.id,
    });
  });

  it("holds the request for the backoff before it flies again", () => {
    const { sick, healthy } = twinWorld();

    const req = injectTo(sick, "READ");
    expect(stepUntil(() => req.retries === 1)).toBe(true);

    // Dropped, backing off, and pointedly NOT in flight yet.
    expect(req.retryDelay).toBeGreaterThan(0);
    expect(req.isMoving).toBe(false);
    expect(req.retryTarget).toBe(healthy);

    run(R.retryBackoffSec + 0.2);
    expect(req.retryDelay).toBe(0);
    expect(req.target).toBe(healthy);
  });

  it("never retries more than maxRetries times", () => {
    const alb = place("alb");
    const a = place("compute");
    const b = place("compute");
    connect("internet", alb);
    connect(alb, a);
    connect(alb, b);
    forceFail(a);
    forceFail(b); // both peers drop everything

    const req = injectTo(a, "READ");
    run(8);

    expect(req.retries).toBe(R.maxRetries);
    expect(S.failures.READ).toBe(1); // failed exactly once
    expect(S.requestsProcessed).toBe(0);
  });

  it("a request that burned its retry and died anyway is a 'retry failed', not a plain overload", () => {
    const alb = place("alb");
    const a = place("compute");
    const b = place("compute");
    connect("internet", alb);
    connect(alb, a);
    connect(alb, b);
    forceFail(a);
    forceFail(b);

    injectTo(a, "READ");
    run(8);

    expect(S.failuresByReason[FAIL_REASONS.RETRY_FAILED]).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.OVERLOADED]).toBeUndefined();
  });

  it("does not retry when there is no alternate path", () => {
    const alb = place("alb");
    const only = place("compute");
    connect("internet", alb);
    connect(alb, only);
    forceFail(only);

    const req = injectTo(only, "READ");
    run(3);

    expect(req.retries).toBe(0);
    expect(S.resilience.retries).toBe(0);
    expect(S.failures.READ).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.OVERLOADED]).toBe(1);
  });

  it("does not retry onto a peer whose breaker is open", () => {
    const alb = place("alb");
    const sick = place("compute");
    const alsoSick = place("compute");
    connect("internet", alb);
    connect(alb, sick);
    connect(alb, alsoSick);
    fail(alsoSick, R.tripMinEvents);

    expect(findRetryPeer(sick)).toBe(null);
  });

  it("does not retry onto a peer the upstream cannot reach", () => {
    const alb = place("alb");
    const other = place("alb");
    const sick = place("compute");
    const stranger = place("compute");
    connect("internet", alb);
    connect(alb, sick);
    connect(other, stranger); // wired to a DIFFERENT upstream

    expect(findRetryPeer(sick)).toBe(null);
  });

  it("finds an entry-point peer through the Internet node", () => {
    const sick = place("waf");
    const healthy = place("waf");
    connect("internet", sick);
    connect("internet", healthy);

    expect(findRetryPeer(sick)).toBe(healthy);
  });

  it("fails the request if its retry target disappears during the backoff", () => {
    const { sick, healthy } = twinWorld();

    const req = injectTo(sick, "READ");
    expect(stepUntil(() => req.retries === 1)).toBe(true);
    expect(req.retryTarget).toBe(healthy);

    deleteObject(healthy.id);
    run(R.retryBackoffSec + 0.2);
    flushFailFades();

    expect(S.requests).toHaveLength(0);
    expect(S.failuresByReason[FAIL_REASONS.RETRY_FAILED]).toBe(1);
  });

  it("the retried request is charged to the failing node exactly once", () => {
    const { sick } = twinWorld();

    const req = injectTo(sick, "READ");
    expect(stepUntil(() => req.retries === 1)).toBe(true);

    expect(sick.breakerEvents.filter((e) => e === 1)).toHaveLength(1);
  });
});

describe("SPOF detection", () => {
  it("reports every single-instance type on the traffic path", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    const spofs = findSPOFs()
      .map((s) => s.type)
      .sort();
    expect(spofs).toEqual(["alb", "compute", "db"]);
  });

  it("a duplicated type is no longer a SPOF", () => {
    const alb = place("alb");
    const c1 = place("compute");
    const c2 = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, c1);
    connect(alb, c2);
    connect(c1, db);
    connect(c2, db);

    const types = findSPOFs().map((s) => s.type);
    expect(types).not.toContain("compute");
    expect(types).toContain("alb");
  });

  it("ignores services that are not on the traffic path", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    place("monitor"); // never wired, never routable-to
    const parked = place("s3"); // built but unconnected

    const ids = findSPOFs().map((s) => s.id);
    expect(ids).not.toContain(parked.id);
    expect(findSPOFs().map((s) => s.type)).not.toContain("monitor");
  });

  it("a disabled twin turns its surviving peer back into a SPOF", () => {
    const alb = place("alb");
    const c1 = place("compute");
    const c2 = place("compute");
    connect("internet", alb);
    connect(alb, c1);
    connect(alb, c2);
    expect(findSPOFs().map((s) => s.type)).not.toContain("compute");

    c2.isDisabled = true;
    expect(findSPOFs()).toContain(c1);
  });

  it("a tripped twin does the same", () => {
    const alb = place("alb");
    const c1 = place("compute");
    const c2 = place("compute");
    connect("internet", alb);
    connect(alb, c1);
    connect(alb, c2);

    fail(c2, R.tripMinEvents);
    expect(findSPOFs()).toContain(c1);
  });

  it("an empty world has no SPOFs", () => {
    expect(findSPOFs()).toEqual([]);
  });
});

// No new path may leak a request or loop it forever. Every scenario below stops
// traffic and then asserts the world drains completely (nothing queued, nothing
// processing, nothing in flight, nothing backing off), and that every injected
// request was accounted for exactly once as completed, failed or throttled.
describe("termination / leak battery", () => {
  // Every request lands in exactly one bucket: completed, failed, or blocked by
  // the WAF (scored, then removed: neither a completion nor a failure).
  // Throttled requests are none of the three, so worlds that can throttle assert
  // the total as a lower bound instead.
  function accounted(): number {
    const blocked = S.score.maliciousBlocked / CONFIG.survival.SCORE_POINTS.MALICIOUS_BLOCKED_SCORE;
    return S.requestsProcessed + totalFailures() + blocked;
  }

  function drain(seconds = 25): void {
    run(seconds);
    flushFailFades();
  }

  function assertDrained(): void {
    expect(S.requests).toHaveLength(0);
    for (const s of S.services) {
      expect(s.queue, `${s.type} queue`).toHaveLength(0);
      expect(s.processing, `${s.type} processing`).toHaveLength(0);
      expect(s.incomingCount, `${s.type} incoming`).toBe(0);
    }
  }

  it("drains with a breaker open on the only downstream", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    fail(compute, R.tripMinEvents);

    for (let i = 0; i < 20; i++) inject("READ");
    drain();

    assertDrained();
    expect(accounted()).toBe(20);
  });

  it("drains while a breaker is half-open and probing", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);
    fail(compute, R.tripMinEvents);
    run(R.openSec + 0.2);
    expect(compute.breakerState).toBe("half-open");

    for (let i = 0; i < 20; i++) inject("READ");
    drain();

    assertDrained();
    expect(accounted()).toBe(20);
  });

  it("drains when every retry is exhausted", () => {
    const alb = place("alb");
    const a = place("compute");
    const b = place("compute");
    connect("internet", alb);
    connect(alb, a);
    connect(alb, b);
    forceFail(a);
    forceFail(b);

    for (let i = 0; i < 20; i++) inject("READ");
    drain();

    assertDrained();
    expect(accounted()).toBe(20);
    expect(S.resilience.retries).toBeGreaterThan(0);
  });

  it("drains when a retry has nowhere to go", () => {
    const alb = place("alb");
    const only = place("compute");
    connect("internet", alb);
    connect(alb, only);
    forceFail(only);

    for (let i = 0; i < 20; i++) inject("READ");
    drain();

    assertDrained();
    expect(accounted()).toBe(20);
    expect(S.resilience.retries).toBe(0);
  });

  it("drains when every downstream is tripped, queue included", () => {
    const waf = place("waf");
    const sqs = place("sqs");
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", waf);
    connect(waf, sqs);
    connect(sqs, alb);
    connect(alb, compute);
    connect(compute, db);

    for (let i = 0; i < 20; i++) inject("READ");
    for (const s of [waf, sqs, alb, compute, db]) fail(s, R.tripMinEvents);

    drain(60); // long enough for every breaker to probe its way back
    assertDrained();
    expect(accounted()).toBe(20);
  });

  it("drains a burst through a world that is failing every which way", () => {
    const waf = place("waf");
    const apigw = place("apigw");
    const alb = place("alb");
    const sqs = place("sqs");
    const sick = place("compute");
    const healthy = place("compute");
    const cache = place("cache");
    const db = place("db");
    connect("internet", waf);
    connect(waf, apigw);
    connect(apigw, alb);
    connect(alb, sqs);
    connect(sqs, sick);
    connect(sqs, healthy);
    connect(sick, cache);
    connect(healthy, cache);
    connect(cache, db);
    connect(sick, db);
    connect(healthy, db);

    forceFail(sick); // retries and breaker trips both in play
    fail(db, R.tripMinEvents); // and a tripped terminal node

    const burst = 60;
    const mix = ["READ", "WRITE", "STATIC", "SEARCH", "MALICIOUS"] as const;
    for (let i = 0; i < burst; i++) inject(mix[i % 5] ?? "READ");
    drain(90);

    assertDrained();
    // The API Gateway can throttle here, and a throttled request is neither
    // completed nor failed, so this is the exact ledger minus throttles.
    expect(accounted()).toBeLessThanOrEqual(burst);
    expect(accounted()).toBeGreaterThan(burst * 0.8);
  });

  it("drains a pending retry backoff when the world is torn down", () => {
    const { sick, healthy } = (() => {
      const alb = place("alb");
      const s = place("compute");
      const h = place("compute");
      connect("internet", alb);
      connect(alb, s);
      connect(alb, h);
      forceFail(s);
      return { sick: s, healthy: h };
    })();

    for (let i = 0; i < 10; i++) injectTo(sick, "READ");
    expect(stepUntil(() => S.requests.some((r) => r.retryDelay > 0))).toBe(true);

    deleteObject(sick.id);
    deleteObject(healthy.id);
    drain();
    assertDrained();
  });
});
