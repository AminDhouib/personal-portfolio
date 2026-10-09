// @vitest-environment node
// Multi-region failover over the real modules: the region-subtree computation, the
// forced region outage (trigger / restore / re-disable), GeoDNS shifting all traffic
// to the surviving region and back, the completed-request watermarks, and the leak
// battery proving the cardinal invariant: a request caught inside the dying region
// terminates (fails or is removed), it never hangs in a dead queue.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import {
  computeRegionSubtree,
  endRandomEvent,
  endRegionOutage,
  triggerRandomEvent,
  triggerRegionOutage,
  updateRegionOutage,
} from "../events";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import { resetSim, S } from "../state";
import { deleteObject } from "../topology";
import {
  accountedRequests,
  connect,
  expectDrained,
  inject,
  injectTo,
  place,
  resetWorld,
  run,
} from "./helpers";

beforeEach(() => {
  resetWorld();
});
afterEach(() => {
  resetSim({ seed: "after-multi-region" });
});

// The canonical two-region board: one GeoDNS fanning out to two complete
// WAF -> ALB -> Compute stacks that share a single backend DB.
function buildTwoRegions() {
  const dns = place("dns");
  const wafA = place("waf");
  const albA = place("alb");
  const computeA = place("compute");
  const wafB = place("waf");
  const albB = place("alb");
  const computeB = place("compute");
  const db = place("db");
  connect("internet", dns);
  connect(dns, wafA);
  connect(wafA, albA);
  connect(albA, computeA);
  connect(computeA, db);
  connect(dns, wafB);
  connect(wafB, albB);
  connect(albB, computeB);
  connect(computeB, db);
  return { dns, wafA, albA, computeA, wafB, albB, computeB, db };
}

function ids(services: Service[]): string[] {
  return services.map((s) => s.id).sort();
}

function resident(s: Service): number {
  return s.queue.length + s.processing.length + s.incomingCount;
}

describe("computeRegionSubtree", () => {
  it("kills exactly the exclusive stack behind the front door", () => {
    const { wafA, albA, computeA } = buildTwoRegions();
    expect(computeRegionSubtree(wafA.id).sort()).toEqual(ids([wafA, albA, computeA]));
  });

  it("a shared backend reachable from the other region stays up", () => {
    const { wafA, db } = buildTwoRegions();
    expect(computeRegionSubtree(wafA.id)).not.toContain(db.id);
  });

  it("with no second region, the shared DB dies with the only stack", () => {
    const dns = place("dns");
    const wafA = place("waf");
    const albA = place("alb");
    const computeA = place("compute");
    const db = place("db");
    connect("internet", dns);
    connect(dns, wafA);
    connect(wafA, albA);
    connect(albA, computeA);
    connect(computeA, db);
    expect(computeRegionSubtree(wafA.id).sort()).toEqual(ids([wafA, albA, computeA, db]));
  });

  it("a node fed by another Internet entry survives the region", () => {
    const { wafA, albA, computeA } = buildTwoRegions();
    // A second front door wired straight to the Internet AND into region A's
    // balancer: albA (and everything below it) now has a path that does not run
    // through the dying front door, so only wafA itself goes dark.
    const spare = place("waf");
    connect("internet", spare);
    connect(spare, albA);
    const region = computeRegionSubtree(wafA.id);
    expect(region).toEqual([wafA.id]);
    expect(region).not.toContain(albA.id);
    expect(region).not.toContain(computeA.id);
  });

  it("terminates and stays correct when the graph has a cycle", () => {
    const { wafA, albA, computeA } = buildTwoRegions();
    // Hand-crafted upward edge (createConnection would refuse it): the walk must
    // not loop forever, and the region must not change.
    computeA.connections.push(wafA.id);
    expect(computeRegionSubtree(wafA.id).sort()).toEqual(ids([wafA, albA, computeA]));
    computeA.connections.pop();
  });
});

describe("region outage lifecycle", () => {
  it("fires: the region is disabled, the rest of the board is not", () => {
    const { wafA, albA, computeA, wafB, albB, computeB, db, dns } = buildTwoRegions();
    expect(triggerRegionOutage(25)).toBe(true);
    for (const s of [wafA, albA, computeA]) expect(s.isDisabled).toBe(true);
    for (const s of [dns, wafB, albB, computeB, db]) expect(s.isDisabled).toBe(false);
    expect(S.regionOutage?.active).toBe(true);
  });

  it("records the outage on the resilience counter exactly once", () => {
    buildTwoRegions();
    triggerRegionOutage(25);
    run(1);
    expect(S.resilience.outages).toBe(1);
  });

  it("announces itself with the front door type and the region size", () => {
    buildTwoRegions();
    triggerRegionOutage(25);
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "region_outage_warning",
      level: "danger",
      params: { type: "waf", count: 3 },
    });
  });

  it("restores the same region by itself after the duration of game time", () => {
    const { wafA, albA, computeA } = buildTwoRegions();
    triggerRegionOutage(2);
    run(1.9);
    expect(wafA.isDisabled).toBe(true);
    run(0.3);
    for (const s of [wafA, albA, computeA]) expect(s.isDisabled).toBe(false);
    expect(S.regionOutage?.active).toBe(false);
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "region_outage_restored",
      level: "info",
    });
  });

  it("the restore clock is game time: a stopped clock never shortens the outage", () => {
    const { wafA } = buildTwoRegions();
    triggerRegionOutage(25);
    // No ticks pass, however many times it is polled.
    for (let i = 0; i < 200; i++) updateRegionOutage();
    expect(wafA.isDisabled).toBe(true);
    expect(S.regionOutage?.active).toBe(true);
  });

  it("re-disables the SAME region after another event clobbers the disable flags", () => {
    const { wafA, albA, computeA, db } = buildTwoRegions();
    triggerRegionOutage(25);

    // A random SERVICE_OUTAGE is live on the shared DB when it ends: its cleanup
    // re-enables EVERY disabled service, the region's included.
    triggerRandomEvent("SERVICE_OUTAGE", 30000, db.id);
    expect(db.isDisabled).toBe(true);
    endRandomEvent();
    expect(wafA.isDisabled).toBe(false); // the clobber this test is about
    expect(db.isDisabled).toBe(false);

    updateRegionOutage();
    for (const s of [wafA, albA, computeA]) expect(s.isDisabled).toBe(true);
    expect(db.isDisabled).toBe(false);
  });

  it("the restore leaves a node alone while a random SERVICE_OUTAGE owns it", () => {
    const { wafA, albA, computeA } = buildTwoRegions();
    triggerRegionOutage(25);
    // A random outage independently picks a node inside the dark region.
    triggerRandomEvent("SERVICE_OUTAGE", 60000, computeA.id);
    endRegionOutage();
    expect(wafA.isDisabled).toBe(false);
    expect(albA.isDisabled).toBe(false);
    expect(computeA.isDisabled).toBe(true); // endRandomEvent owns this restore
  });

  it("survives a service demolished mid-outage", () => {
    const { wafA, albA } = buildTwoRegions();
    triggerRegionOutage(25);
    expect(deleteObject(albA.id)).toBe(true);
    expect(() => endRegionOutage()).not.toThrow();
    expect(wafA.isDisabled).toBe(false);
  });

  it("ending an outage twice is harmless", () => {
    buildTwoRegions();
    triggerRegionOutage(25);
    endRegionOutage();
    const stamped = S.regionOutage?.endedCompleted;
    S.requestsProcessed += 5;
    endRegionOutage();
    expect(S.regionOutage?.endedCompleted).toBe(stamped);
  });

  it("is inert with no DNS front door on the board", () => {
    const waf = place("waf");
    connect("internet", waf);
    expect(triggerRegionOutage(25)).toBe(false);
    expect(waf.isDisabled).toBe(false);
    expect(S.resilience.outages).toBe(0);
    expect(S.regionOutage).toBeNull();
  });

  it("is cleared by a reset", () => {
    buildTwoRegions();
    triggerRegionOutage(25);
    resetWorld();
    expect(S.regionOutage).toBeNull();
  });
});

describe("GeoDNS traffic shift", () => {
  it("during the outage every request completes through region B; region A sees nothing", () => {
    const world = buildTwoRegions();
    triggerRegionOutage(1000);

    // Kept at 4 so region B's single Compute stays at or below 50% load: the
    // failure roll is 0 and the test is deterministic.
    for (let i = 0; i < 4; i++) inject("READ");
    let regionATouched = 0;
    for (let i = 0; i < 100; i++) {
      run(0.1);
      regionATouched += resident(world.wafA) + resident(world.albA) + resident(world.computeA);
    }

    expect(S.requestsProcessed).toBe(4); // all completed, via region B
    expect(regionATouched).toBe(0);
  });

  it("after the restore, round-robin spreads traffic back across BOTH regions", () => {
    const world = buildTwoRegions();
    triggerRegionOutage(5);
    S.elapsedGameTime += 5;
    updateRegionOutage();
    expect(world.wafA.isDisabled).toBe(false);

    let regionASaw = 0;
    let regionBSaw = 0;
    for (let i = 0; i < 8; i++) {
      inject("READ");
      for (let f = 0; f < 15; f++) {
        run(0.1);
        regionASaw += resident(world.wafA);
        regionBSaw += resident(world.wafB);
      }
    }
    expect(regionASaw).toBeGreaterThan(0);
    expect(regionBSaw).toBeGreaterThan(0);
  });
});

describe("region outage leak battery", () => {
  it("requests queued and processing inside the region terminate at lights-out", () => {
    const { wafA } = buildTwoRegions();
    for (let i = 0; i < 10; i++) injectTo(wafA, "READ");
    run(0.55); // just past the flight time: the batch has landed in the WAF's queue
    expect(wafA.queue.length + wafA.processing.length).toBeGreaterThan(0);

    triggerRegionOutage(1000);
    expect(wafA.queue).toHaveLength(0);
    expect(wafA.processing).toHaveLength(0);

    run(5); // stragglers already forwarded deeper drain via B or fail
    run(1);
    expectDrained();
    expect(accountedRequests()).toBe(10);
  });

  it("a request mid-air INTO the dying region terminates and frees its slot", () => {
    const { wafA } = buildTwoRegions();
    const req = injectTo(wafA, "READ");
    expect(req.isMoving).toBe(true);
    expect(wafA.incomingCount).toBe(1);

    triggerRegionOutage(1000);
    expect(wafA.incomingCount).toBe(0);
    expect(req.failed).toBe(true);

    run(3);
    expectDrained();
    expect(S.failures.READ).toBe(1);
  });

  it("failed region requests carry the REGION_DOWN attribution, not a breach", () => {
    const { wafA } = buildTwoRegions();
    injectTo(wafA, "READ");
    run(0.6);
    const repBefore = S.reputation;
    triggerRegionOutage(1000);
    // One plain failure: the usual reputation hit, no breach penalty.
    expect(S.failures.READ).toBe(1);
    expect(S.failures.MALICIOUS).toBe(0);
    expect(S.failuresByReason[FAIL_REASONS.REGION_DOWN]).toBe(1);
    expect(S.reputation).toBe(repBefore + CONFIG.survival.SCORE_POINTS.FAIL_REPUTATION);
  });

  it("MALICIOUS caught in the dead region is removed silently: no breach, no block", () => {
    const { wafA } = buildTwoRegions();
    // Straight into the queue (skip the flight) so the WAF has not blocked it yet.
    const req = injectTo(wafA, "MALICIOUS");
    req.isMoving = false;
    req.progress = 1;
    wafA.incomingCount = 0;
    wafA.queue.push(req);

    const repBefore = S.reputation;
    const moneyBefore = S.money;
    triggerRegionOutage(1000);

    expect(S.requests).toHaveLength(0); // removed immediately, no fade
    expect(S.failures.MALICIOUS).toBe(0);
    expect(S.score.maliciousBlocked).toBe(0);
    expect(S.reputation).toBe(repBefore);
    expect(S.money).toBe(moneyBefore);
  });

  it("no request ever hangs at a dark node while the outage runs", () => {
    const world = buildTwoRegions();
    for (let i = 0; i < 12; i++) inject("READ");
    run(0.8); // spread across dns/regionA/regionB mid-flight
    triggerRegionOutage(1000);
    run(3);
    for (const s of [world.wafA, world.albA, world.computeA]) {
      expect(s.queue).toHaveLength(0);
      expect(s.processing).toHaveLength(0);
      expect(s.incomingCount).toBe(0);
    }
  });

  it("full battery: live traffic through outage AND restore drains to zero", () => {
    buildTwoRegions();
    let injected = 0;
    const pump = (n: number) => {
      for (let i = 0; i < n; i++) {
        inject(i % 5 === 0 ? "MALICIOUS" : "READ");
        injected++;
        run(0.3);
      }
    };

    pump(8); // healthy two-region flow
    triggerRegionOutage(6);
    pump(8); // one-region flow
    S.elapsedGameTime += 6;
    updateRegionOutage();
    expect(S.regionOutage?.active).toBe(false);
    pump(8); // both regions again

    run(25);
    run(1);
    expectDrained();
    expect(accountedRequests()).toBe(injected);
  });
});

describe("completed-request watermarks", () => {
  it("count what was served during the dark and freeze at the restore", () => {
    buildTwoRegions();
    S.requestsProcessed = 40;
    triggerRegionOutage(10);
    const outage = S.regionOutage;
    expect(outage?.startedCompleted).toBe(40);
    expect(outage?.endedCompleted).toBeNull();

    S.requestsProcessed = 95;
    S.elapsedGameTime += 10;
    updateRegionOutage(); // the restore stamps the end watermark
    S.requestsProcessed = 200; // after-restore traffic
    expect(outage?.endedCompleted).toBe(95);
    expect((outage?.endedCompleted ?? 0) - (outage?.startedCompleted ?? 0)).toBe(55);
  });
});
