// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { resetSim, S } from "../state";
import { spawnRequest } from "../traffic";
import { connect, inject, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-lifecycle" }));

describe("full pipeline: spawn, route, process, finish", () => {
  it("a READ through waf, alb, compute, db is counted, paid and removed", () => {
    const waf = place("waf");
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", waf);
    connect(waf, alb);
    connect(alb, compute);
    connect(compute, db);

    const moneyBefore = S.money;
    inject("READ");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.requests).toHaveLength(0);
    expect(S.money).toBeCloseTo(moneyBefore + CONFIG.trafficTypes.READ.reward, 5);
    expect(S.score.database).toBe(CONFIG.trafficTypes.READ.score);
    expect(S.score.total).toBe(CONFIG.trafficTypes.READ.score);
    expect(S.failures.READ).toBe(0);
  });

  it("an UPLOAD lands in S3 and scores as storage", () => {
    const alb = place("alb");
    const compute = place("compute");
    const s3 = place("s3");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, s3);

    inject("UPLOAD");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.score.storage).toBe(CONFIG.trafficTypes.UPLOAD.score);
  });

  it("success gains reputation", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    S.reputation = 50;
    inject("WRITE");
    run(10);

    expect(S.reputation).toBeCloseTo(50 + CONFIG.survival.SCORE_POINTS.SUCCESS_REPUTATION, 5);
  });

  it("a request's age counts the time it waited, in game seconds", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    const req = inject("WRITE");
    run(1);
    expect(req.age).toBeCloseTo(1, 6);
  });
});

describe("WAF against MALICIOUS traffic", () => {
  it("blocks on intake: score and mitigation cost, no failure, request removed", () => {
    const waf = place("waf");
    connect("internet", waf);

    const moneyBefore = S.money;
    inject("MALICIOUS");
    run(2);

    expect(S.score.maliciousBlocked).toBe(CONFIG.survival.SCORE_POINTS.MALICIOUS_BLOCKED_SCORE);
    expect(S.money).toBeCloseTo(
      moneyBefore - CONFIG.survival.SCORE_POINTS.MALICIOUS_MITIGATION_COST,
      5,
    );
    expect(S.failures.MALICIOUS).toBe(0);
    expect(S.requestsProcessed).toBe(0);
    expect(S.requests).toHaveLength(0);
  });

  it("tells the view which firewall blocked it", () => {
    const waf = place("waf");
    connect("internet", waf);
    const req = inject("MALICIOUS");
    run(2);
    expect(S.events).toContainEqual({ kind: "request-blocked", id: req.id, serviceId: waf.id });
  });

  it("MALICIOUS that reaches compute without a firewall costs the breach penalty and reputation", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);

    const moneyBefore = S.money;
    S.reputation = 100;
    inject("MALICIOUS");
    run(10);

    expect(S.failures.MALICIOUS).toBe(1);
    expect(S.reputation).toBeCloseTo(
      100 + CONFIG.survival.SCORE_POINTS.MALICIOUS_PASSED_REPUTATION,
      5,
    );
    expect(S.money).toBeCloseTo(
      moneyBefore - CONFIG.survival.SCORE_POINTS.MALICIOUS_BREACH_PENALTY,
      5,
    );
  });

  it("relabels any MALICIOUS drop as the breach it is", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    const req = inject("MALICIOUS");
    run(10);
    const failed = S.events.find((e) => e.kind === "request-failed" && e.id === req.id);
    expect(failed).toMatchObject({ breach: true, reason: FAIL_REASONS.BREACH });
  });

  it("non-malicious traffic passes through the firewall unharmed", () => {
    const waf = place("waf");
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", waf);
    connect(waf, alb);
    connect(alb, compute);
    connect(compute, db);

    inject("READ");
    run(10);

    expect(S.requestsProcessed).toBe(1);
  });
});

describe("failure accounting", () => {
  it("a request with no entry point fails at once: counter, reputation and score", () => {
    S.reputation = 100;
    inject("READ"); // the Internet has no connections
    expect(S.failures.READ).toBe(1);
    expect(S.reputation).toBeCloseTo(100 + CONFIG.survival.SCORE_POINTS.FAIL_REPUTATION, 5);
    expect(S.score.total).toBeCloseTo(-CONFIG.trafficTypes.READ.score / 2, 5);
    expect(S.score.penalties).toBeCloseTo(CONFIG.trafficTypes.READ.score / 2, 5);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBe(1);
  });

  it("a dead-end pipeline fails the request at the last hop", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute); // compute has no db or s3 downstream

    inject("WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.WRITE).toBe(1);
  });

  it("a failed request lingers 500 ms for the view, then is removed", () => {
    const req = inject("READ"); // fails on the spot
    expect(S.requests).toContain(req);
    run(0.45);
    expect(S.requests).toContain(req);
    run(0.1);
    expect(S.requests).not.toContain(req);
  });

  it("an overflowing queue drops the arrival as QUEUE_FULL", () => {
    const alb = place("alb");
    connect("internet", alb);
    const filler = inject("READ");
    // Saturate it: every processing slot held by a job that never finishes, and a full queue.
    alb.processing = Array.from({ length: alb.config.capacity }, () => ({
      req: filler,
      timer: -1e12,
    }));
    alb.queue = Array.from({ length: CONFIG.services.alb.maxQueueSize ?? 20 }, () => filler);
    const req = inject("READ");
    run(1);
    expect(req.failed).toBe(true);
    expect(S.failuresByReason[FAIL_REASONS.QUEUE_FULL]).toBeGreaterThanOrEqual(1);
  });

  it("spawnRequest with an all-zero traffic mix spawns nothing", () => {
    S.trafficDistribution = { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, MALICIOUS: 0 };
    spawnRequest();
    expect(S.requests).toHaveLength(0);
    expect(S.failures.STATIC).toBe(0);
  });
});

describe("a late completion is worth less, but is not a failure", () => {
  function slowBoard() {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);
    return compute;
  }

  it("is counted late in every mode, and priced late only in survival", () => {
    for (const mode of ["sandbox", "survival"] as const) {
      resetWorld({ mode });
      slowBoard();
      const req = inject("READ");
      req.age = CONFIG.trafficTypes.READ.sloSec ?? 7; // already at the SLO
      S.reputation = 50;
      const moneyBefore = S.money;
      run(5);
      expect(S.requestsProcessed).toBe(1);
      expect(S.lateCompletions).toBe(1);
      const reward = S.money - moneyBefore;
      if (mode === "survival") {
        expect(req.wasLate).toBe(true);
        expect(reward).toBeLessThan(CONFIG.trafficTypes.READ.reward);
        expect(S.reputation).toBeLessThan(50);
      } else {
        expect(req.wasLate).toBe(false);
        expect(reward).toBeCloseTo(CONFIG.trafficTypes.READ.reward, 5);
        expect(S.reputation).toBeGreaterThan(50);
      }
      expect(S.failures.READ).toBe(0);
    }
  });
});
