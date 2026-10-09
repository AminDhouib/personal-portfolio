// @vitest-environment node
// The campaign fixtures themselves: level data integrity (Server Survival's
// tests/levels.test.mjs) and the objective helpers (tests/objectives.test.mjs), over
// the real sim state rather than hand-made stand-ins. Each level case encodes a bug
// upstream shipped: a connection index out of range, a traffic mix that does not sum
// to 1, a level with no timeout backstop.
//
// Dropped from upstream's level suite: the locale-key checks (titles, briefings and
// objective labels are not part of this fixture), and the diagram highlights.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SERVICE_TYPES } from "../config";
import { resetSim, S } from "../state";
import { place, resetWorld } from "./helpers";
import { CAMPAIGN_LEVELS } from "./fixtures/levels";
import { CampaignObjectives as O } from "./fixtures/objectives";
import { placeAt, play, svc, wire } from "./campaign-play";

afterEach(() => resetSim({ seed: "after-campaign-fixtures" }));

describe("campaign levels", () => {
  it("has 25 levels with sequential ids from 1", () => {
    expect(CAMPAIGN_LEVELS.map((l) => l.id)).toEqual(CAMPAIGN_LEVELS.map((_, i) => i + 1));
    expect(CAMPAIGN_LEVELS).toHaveLength(25);
  });

  it("groups levels into contiguous, non-decreasing chapters", () => {
    const chapters = CAMPAIGN_LEVELS.map((l) => l.chapter);
    expect(chapters).toEqual([...chapters].sort((a, b) => a - b));
  });

  it("objective ids are unique within each level", () => {
    for (const l of CAMPAIGN_LEVELS) {
      const ids = [...l.objectives.primary, ...l.objectives.bonus].map((o) => o.id);
      expect(new Set(ids).size, `level ${l.id}`).toBe(ids.length);
    }
  });

  describe.each(CAMPAIGN_LEVELS)("level $id", (level) => {
    it("traffic distribution sums to 1", () => {
      const sum = Object.values(level.trafficDistribution).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it("preBuilt connection indices are in range", () => {
      const n = level.preBuilt.services.length;
      for (const [from, to] of level.preBuilt.connections) {
        if (from !== "internet") expect(from).toBeLessThan(n);
        expect(to).toBeLessThan(n);
      }
    });

    it("has at least one primary objective and a timeout backstop", () => {
      expect(level.objectives.primary.length).toBeGreaterThan(0);
      expect(level.failConditions.timeoutSec).toBeGreaterThan(0);
    });

    it("names only services the sim has", () => {
      for (const s of level.preBuilt.services) expect(SERVICE_TYPES).toContain(s.type);
      for (const type of level.allowedServices) expect(SERVICE_TYPES).toContain(type);
    });

    it("pre-builds a board whose every wire the sim accepts", () => {
      // startCampaignLevel throws on a refused connection, so this is the check.
      expect(() => play(level.id, "fixture-board", () => {}, { capSec: 0 })).not.toThrow();
      expect(S.connections).toHaveLength(level.preBuilt.connections.length);
    });
  });
});

describe("objective helpers over the real sim state", () => {
  beforeEach(() => resetWorld());

  it("completedOfType and totalCompleted read the per-class completion counters", () => {
    S.finances.income.countByType.READ = 7;
    S.finances.income.countByType.WRITE = 2;
    S.finances.income.countByType.blocked = 40;
    expect(O.completedOfType(S, "READ")).toBe(7);
    expect(O.completedOfType(S, "SEARCH")).toBe(0);
    // Blocked attacks are not completions.
    expect(O.totalCompleted(S)).toBe(9);
  });

  it("totalFailures sums the failure table and failureRate is failed over all", () => {
    S.finances.income.countByType.READ = 9;
    S.failures.READ = 1;
    expect(O.totalFailures(S)).toBe(1);
    expect(O.failureRate(S)).toBeCloseTo(0.1);
  });

  it("failureRate is 0, not NaN, when nothing completed or failed", () => {
    expect(O.failureRate(S)).toBe(0);
  });

  it("hasService, countServices and usesOnly introspect the board", () => {
    place("waf");
    place("compute");
    place("compute");
    place("db");
    expect(O.hasService(S, "waf")).toBe(true);
    expect(O.hasService(S, "cache")).toBe(false);
    expect(O.countServices(S, "compute")).toBe(2);
    expect(O.usesOnly(S, "nosql", [])).toBe(false);
    expect(O.usesOnly(S, "compute", ["db"])).toBe(false);
    expect(O.usesOnly(S, "compute", ["cache", "sqs"])).toBe(true);
  });

  it("maxLoadOfType and busiestLoad are 0, not -Infinity, on an empty board", () => {
    expect(O.maxLoadOfType(S, "compute")).toBe(0);
    expect(O.busiestLoad(S)).toBe(0);
  });

  it("fleetScaledOut is latched by lastScaleAt and needs the group switched on", () => {
    const compute = place("compute");
    compute.asgEnabled = true;
    expect(O.fleetScaledOut(S, "compute")).toBe(false);
    compute.instances = 3;
    expect(O.fleetScaledOut(S, "compute")).toBe(true);
    compute.instances = 1;
    compute.lastScaleAt = 12.5;
    expect(O.fleetScaledOut(S, "compute")).toBe(true);
    compute.asgEnabled = false;
    expect(O.fleetScaledOut(S, "compute")).toBe(false);
    expect(O.fleetScaledOut(S, "container")).toBe(false);
  });

  it("netProfit is income minus every expense bucket", () => {
    S.finances.income.total = 100;
    Object.assign(S.finances.expenses, {
      services: 10,
      upkeep: 20,
      repairs: 5,
      autoRepair: 5,
      mitigation: 3,
      breach: 7,
    });
    expect(O.netProfit(S)).toBe(50);
  });

  it("totalUpkeepPerSec is the per-minute upkeep sum over 60", () => {
    place("compute");
    place("db");
    const perMinute = S.services.reduce((sum, s) => sum + (s.config.upkeep ?? 0), 0);
    expect(perMinute).toBeGreaterThan(0);
    expect(O.totalUpkeepPerSec(S)).toBeCloseTo(perMinute / 60);
  });

  it("survivedNodeFailure needs a real failure and the reputation bar", () => {
    expect(O.survivedNodeFailure(S, 75)).toBe(false);
    S.resilience.outages = 1;
    expect(O.survivedNodeFailure(S, 75)).toBe(true);
    S.reputation = 74;
    expect(O.survivedNodeFailure(S, 75)).toBe(false);
  });

  it("completedDuringRegionOutage counts from lights-out and freezes at lights-on", () => {
    expect(O.completedDuringRegionOutage(S)).toBe(0);
    S.requestsProcessed = 10;
    S.regionOutage = {
      serviceIds: [],
      endAtSec: 0,
      active: true,
      startedCompleted: 10,
      endedCompleted: null,
    };
    S.requestsProcessed = 25;
    expect(O.completedDuringRegionOutage(S)).toBe(15);
    S.regionOutage = { ...S.regionOutage, active: false, endedCompleted: 30 };
    S.requestsProcessed = 99;
    expect(O.completedDuringRegionOutage(S)).toBe(20);
  });

  it("totalBadAnswers sums the GPU fleet and ignores every other service", () => {
    const g1 = place("gpu");
    place("power");
    const g2 = place("gpu");
    const waf = place("waf");
    expect(O.totalBadAnswers(S)).toBe(0);
    g1.badAnswers = 3;
    g2.badAnswers = 4;
    waf.badAnswers = 99; // never counted: not a GPU
    expect(O.totalBadAnswers(S)).toBe(7);
  });

  it("the resilience counters read straight from the session counters", () => {
    S.inference.expired = 12;
    S.resilience.retries = 5;
    S.resilience.trips = 2;
    expect(O.expiredRequests(S)).toBe(12);
    expect(O.retriedRequests(S)).toBe(5);
    expect(O.breakerTrips(S)).toBe(2);
  });

  it("per-service completions drive the replica and NoSQL shares, 0 not NaN with no traffic", () => {
    expect(O.replicaShareOfReads(S)).toBe(0);
    expect(O.nosqlShareOfWrites(S)).toBe(0);
    S.finances.income.countByType.READ = 10;
    S.finances.income.countByType.WRITE = 8;
    S.completedByService.replica = 4;
    S.completedByService.nosql = 6;
    expect(O.completedByService(S, "replica")).toBe(4);
    expect(O.completedByService(S, "notify")).toBe(0);
    expect(O.replicaShareOfReads(S)).toBeCloseTo(0.4);
    expect(O.nosqlShareOfWrites(S)).toBeCloseTo(0.75);
  });
});

describe("the sim feeds the counters the objectives read", () => {
  it("a played level fills the per-class and per-service completion counts", () => {
    play(1, "fixture-counters", () => {
      const waf = placeAt("waf", -20, 0);
      const alb = placeAt("alb", -10, 0);
      const compute = placeAt("compute", 0, 0);
      const db = placeAt("db", 10, 0);
      wire("internet", waf);
      wire(waf, alb);
      wire(alb, compute);
      wire(compute, db);
      expect(svc("db")).toBe(db);
    });
    expect(O.completedOfType(S, "READ")).toBeGreaterThanOrEqual(50);
    // Every completed read and write finishes on the database in this chain.
    expect(O.completedByService(S, "db")).toBe(
      O.completedOfType(S, "READ") + O.completedOfType(S, "WRITE"),
    );
    expect(O.totalCompleted(S)).toBe(S.requestsProcessed);
  });
});
