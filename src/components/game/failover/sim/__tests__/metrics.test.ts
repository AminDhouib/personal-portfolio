// @vitest-environment node
// The observability layer over the real sim: ring-buffer sampling, error and latency
// attribution through failRequest and finishRequest, the monitoring gate, threshold
// alerts with their cooldown, lazy buffer pruning after a demolish, and the run
// boundary.
//
// Ported from upstream's metrics suite. Its freeze-on-pause case is dropped: the sim
// has no timeScale, and a run that is not stepped takes no samples because nothing
// ticks the sampler. Alerts are warning events with a key, not strings: the cases
// match on the key.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { failRequest, finishRequest } from "../actions";
import { recordBreakerFailure, updateBreaker } from "../circuit-breaker";
import { CONFIG, TICK } from "../config";
import {
  METRICS_BUFFER_SIZE,
  getSampleCount,
  getServiceMetrics,
  hasMonitoring,
  metricsTick,
} from "../metrics";
import { Request } from "../request";
import { retryRequest } from "../retry";
import type { Service } from "../service";
import { resetSim, S } from "../state";
import { createConnection, deleteObject } from "../topology";
import { inject, place, resetWorld, run, connect } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-metrics" }));

// Advance the sampler by `seconds` of game time without running the sim.
function tick(seconds: number): void {
  for (let i = 0, n = Math.round(seconds / TICK); i < n; i++) metricsTick();
}

function warningsMatching(key: string): number {
  return S.events.filter((e) => e.kind === "warning" && e.key === key).length;
}

function last(values: number[] | undefined): number {
  const v = values?.[values.length - 1];
  if (v === undefined) throw new Error("the series is empty");
  return v;
}

/** A request on the books, flying to `service`, so a failure attributes to it. */
function request(service?: Service): Request {
  const req = new Request("READ");
  S.requests.push(req);
  if (service) req.flyTo(service);
  return req;
}

describe("ring buffer sampling", () => {
  it("samples every service at 2 Hz", () => {
    const db = place("db");
    tick(3); // 3 s is 6 samples
    const m = getServiceMetrics(db.id);
    expect(m?.util).toHaveLength(6);
    expect(m?.queueDepth).toHaveLength(6);
    expect(m?.errorRate).toHaveLength(6);
    expect(m?.latency).toHaveLength(6);
  });

  it("caps each buffer at the 60 s window (120 samples)", () => {
    const db = place("db");
    tick(90); // 180 samples worth
    expect(getServiceMetrics(db.id)?.util).toHaveLength(METRICS_BUFFER_SIZE);
  });

  it("the sim ticks the sampler itself: a run takes samples with nobody calling metricsTick", () => {
    const db = place("db");
    run(3);
    expect(getServiceMetrics(db.id)?.util).toHaveLength(6);
    expect(getSampleCount()).toBe(6);
  });

  it("util samples reflect the service's smoothedLoad", () => {
    // The sampled series reads the trailing mean, not the instantaneous signal: that
    // can only take a few representable values, and an alert calibrated to it fired
    // at 170% of rated capacity. Real observability windows its averages too.
    const db = place("db");
    db.queue = Array.from({ length: 8 }, () => null as never);
    // The sim, not the sampler, advances the trailing mean; this isolates the
    // sampler, so drive the signal directly.
    db.smoothedLoad = 0.5;
    tick(0.5);
    expect(last(getServiceMetrics(db.id)?.util)).toBeCloseTo(0.5, 5);
  });

  it("queueDepth samples reflect the queue length", () => {
    const db = place("db");
    db.queue = Array.from({ length: 5 }, () => null as never);
    tick(0.5);
    expect(last(getServiceMetrics(db.id)?.queueDepth)).toBe(5);
  });
});

describe("error and latency attribution", () => {
  it("failRequest attributes the error to req.target's next errorRate sample", () => {
    const db = place("db");
    failRequest(request(db));
    tick(0.5);
    expect(last(getServiceMetrics(db.id)?.errorRate)).toBe(1);
  });

  it("failRequest with no target (an entry dead end) does not throw or attribute", () => {
    const db = place("db");
    expect(() => failRequest(request())).not.toThrow();
    tick(0.5);
    expect(last(getServiceMetrics(db.id)?.errorRate)).toBe(0);
  });

  it("finishRequest attributes success (errorRate 0) and latency from GAME time", () => {
    // Latency used to be stamped off the wall clock, which made every sample wrong at
    // any speed but 1x and unmeasurable headless: for the metric the Monitoring node
    // exists to sell. It reads the request's game-time age now.
    const db = place("db");
    const req = request();
    req.age = 0.25; // 250 ms of GAME time waiting
    finishRequest(req, db);
    tick(0.5);
    const m = getServiceMetrics(db.id);
    expect(last(m?.errorRate)).toBe(0);
    const lat = last(m?.latency);
    expect(lat).toBeGreaterThanOrEqual(240);
    expect(lat).toBeLessThan(1000);
  });

  it("errorRate is windowed: mixed errors and successes within one sample", () => {
    const db = place("db");
    for (let i = 0; i < 3; i++) failRequest(request(db));
    finishRequest(request(), db);
    tick(0.5);
    expect(last(getServiceMetrics(db.id)?.errorRate)).toBeCloseTo(0.75, 5);
  });

  it("counters reset per sample: a clean second sample drops errorRate back to 0", () => {
    const db = place("db");
    failRequest(request(db));
    tick(0.5);
    tick(0.5);
    const rates = getServiceMetrics(db.id)?.errorRate ?? [];
    expect(rates[rates.length - 2]).toBe(1);
    expect(rates[rates.length - 1]).toBe(0);
  });

  it("quiet samples carry the last latency average forward (sparkline continuity)", () => {
    const db = place("db");
    const req = request();
    req.age = 0.3;
    finishRequest(req, db);
    tick(0.5);
    tick(0.5); // no traffic this window
    const lat = getServiceMetrics(db.id)?.latency ?? [];
    expect(lat[lat.length - 1]).toBe(lat[lat.length - 2]);
    expect(lat[lat.length - 1]).toBeGreaterThan(0);
  });

  it("a retried failure is charged to the failing node, whichever path the request takes", () => {
    // retryRequest takes the request over instead of failRequest, so the error has to
    // be recorded there or the error rate would depend on whether a peer existed.
    const a = place("compute");
    const b = place("compute");
    const alb = place("alb");
    connect(alb, a);
    connect(alb, b);
    const req = request();
    // Drive the failure roll the way Service.update does, via the real retry hook.
    expect(retryRequest(req, a)).toBe(true);
    tick(0.5);
    expect(last(getServiceMetrics(a.id)?.errorRate)).toBe(1);
  });

  it("e2e: a completed request through the real pipeline lands a success on the db", () => {
    place("monitor");
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    inject("WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    // The sim sampled while it ran, so the finish sits in an earlier sample than the
    // last one: look across the whole series.
    const m = getServiceMetrics(db.id);
    expect(m?.errorRate.every((e) => e === 0)).toBe(true);
    expect(Math.max(...(m?.latency ?? [0]))).toBeGreaterThan(0);
  });
});

describe("hasMonitoring gating", () => {
  it("false with no monitor placed", () => {
    place("db");
    expect(hasMonitoring()).toBe(false);
  });

  it("true with a live monitor, false again when it is disabled (outage)", () => {
    const monitor = place("monitor");
    expect(hasMonitoring()).toBe(true);
    monitor.isDisabled = true;
    expect(hasMonitoring()).toBe(false);
  });

  it("monitor accepts no connections in either direction (the allowlist rejects unknown pairs)", () => {
    const monitor = place("monitor");
    const db = place("db");
    createConnection(monitor.id, db.id);
    createConnection(db.id, monitor.id);
    createConnection("internet", monitor.id);
    expect(S.connections).toHaveLength(0);
    expect(monitor.connections).toEqual([]);
    expect(db.connections).toEqual([]);
  });
});

describe("threshold alerts", () => {
  // A node held in steady overload. The alert reads smoothedLoad, which the SIM
  // advances inside Service.update; these cases isolate the sampler from the sim on
  // purpose, so the settled value is set directly: that is what a node sitting above
  // the threshold for a few seconds looks like.
  function overload(service: Service): void {
    const need = Math.ceil(service.config.capacity * 2 * 0.9);
    service.queue = Array.from({ length: need }, () => null as never);
    service.smoothedLoad = CONFIG.load.alertUtil + 0.05;
  }

  function relieve(service: Service): void {
    service.queue = [];
    service.smoothedLoad = 0;
  }

  it("does NOT fire without a monitoring service", () => {
    const db = place("db");
    overload(db);
    tick(5);
    expect(warningsMatching("alert_high_load")).toBe(0);
  });

  it("high-load fires after the configured sustained samples", () => {
    // 2 samples at 2 Hz is 1 s, down from 6 (3 s). The old count existed to filter a
    // noisy instantaneous signal; stacking it on a 2.5 s trailing mean would land the
    // alert AFTER the failures it must precede.
    place("monitor");
    const db = place("db");
    overload(db);
    const samples = CONFIG.load.alertSustainSamples;
    tick(0.5 * (samples - 1)); // one short
    expect(warningsMatching("alert_high_load")).toBe(0);
    tick(0.5); // the sample that trips it
    expect(warningsMatching("alert_high_load")).toBe(1);
  });

  it("the warning names the node type it is about", () => {
    place("monitor");
    const db = place("db");
    overload(db);
    tick(5);
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "alert_high_load",
      level: "warning",
      params: { type: "db" },
    });
  });

  it("a dip below the threshold resets the sustained-load streak", () => {
    place("monitor");
    const db = place("db");
    const samples = CONFIG.load.alertSustainSamples;
    overload(db);
    tick(0.5 * (samples - 1)); // one short of firing
    relieve(db); // dip
    tick(0.5);
    overload(db);
    tick(0.5 * (samples - 1)); // one short again: the streak restarted
    expect(warningsMatching("alert_high_load")).toBe(0);
  });

  it("respects the 15 s per-service cooldown, then fires again", () => {
    place("monitor");
    const db = place("db");
    overload(db);
    S.elapsedGameTime = 0;
    tick(10); // well past the sustained samples, still inside the cooldown
    expect(warningsMatching("alert_high_load")).toBe(1);
    S.elapsedGameTime = 16; // cooldown elapsed in game time
    tick(0.5);
    expect(warningsMatching("alert_high_load")).toBe(2);
  });

  it("queue alert fires at >= 90% of maxQueueSize", () => {
    place("monitor");
    const sqs = place("sqs"); // maxQueueSize 200
    sqs.queue = Array.from({ length: 180 }, () => null as never);
    tick(0.5);
    expect(warningsMatching("alert_queue_capacity")).toBe(1);
  });

  it("error-rate alert needs at least 5 events in the window", () => {
    place("monitor");
    const db = place("db");
    for (let i = 0; i < 4; i++) failRequest(request(db));
    tick(0.5); // 4 events, 100% errors: below the event floor
    expect(warningsMatching("alert_error_rate")).toBe(0);

    for (let i = 0; i < 5; i++) failRequest(request(db));
    tick(0.5);
    expect(warningsMatching("alert_error_rate")).toBe(1);
  });

  it("error-rate alert stays quiet at low rates even with many events", () => {
    place("monitor");
    const db = place("db");
    failRequest(request(db));
    for (let i = 0; i < 9; i++) finishRequest(request(), db);
    tick(0.5); // 10 events, 10% error rate
    expect(warningsMatching("alert_error_rate")).toBe(0);
  });

  it("a breaker trip goes through the same cooldown but not the monitoring gate", () => {
    // A breaker trip is a routing event, not an observability feature: no monitor
    // needed. It shares the per-service cooldown, so a flapping breaker is not a
    // wall of warnings.
    const db = place("db");
    S.elapsedGameTime = 0;
    for (let i = 0; i < CONFIG.resilience.tripMinEvents; i++) recordBreakerFailure(db);
    expect(db.breakerState).toBe("open");
    expect(warningsMatching("alert_breaker_open")).toBe(1);

    // Let it half-open and trip again inside the cooldown window: no second warning.
    updateBreaker(db, CONFIG.resilience.openSec);
    expect(db.breakerState).toBe("half-open");
    recordBreakerFailure(db);
    expect(db.breakerState).toBe("open");
    expect(warningsMatching("alert_breaker_open")).toBe(1);
  });
});

describe("lifecycle", () => {
  it("prunes buffers for deleted services on the next sample", () => {
    const db = place("db");
    tick(1);
    expect(getServiceMetrics(db.id)).toBeDefined();
    deleteObject(db.id);
    tick(0.5);
    expect(getServiceMetrics(db.id)).toBeUndefined();
  });

  it("a new run starts with no buffers, counters or sample clock", () => {
    const db = place("db");
    failRequest(request(db));
    tick(3);
    expect(getSampleCount()).toBeGreaterThan(0);

    resetWorld();
    expect(getSampleCount()).toBe(0);
    expect(getServiceMetrics(db.id)).toBeUndefined();
    // Fresh sampling starts clean: no leftover error counters, no half-way sample.
    const fresh = place("db");
    tick(0.5);
    const m = getServiceMetrics(fresh.id);
    expect(m?.util).toHaveLength(1);
    expect(m?.errorRate[0]).toBe(0);
  });

  it("monitor is placeable and charges its price", () => {
    const moneyBefore = S.money;
    const monitor = place("monitor");
    expect(monitor.type).toBe("monitor");
    expect(S.money).toBe(moneyBefore - CONFIG.services.monitor.cost);
  });
});
