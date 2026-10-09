// @vitest-environment node
// The power grid (placement and demolish gates) and the demolish rule for nodes that
// hold requests outside queue and processing (a DLQ's parked backlog, a stream's
// partitions).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { hasPowerHeadroom, recomputePower } from "../power";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { createService, deleteObject, isValidEdge } from "../topology";
import { connect, expectDrained, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-power" }));

describe("power grid", () => {
  it("recomputePower derives {usedKw, capKw} from live services", () => {
    expect(S.power).toEqual({ usedKw: 0, capKw: 8 });
    place("gpu");
    expect(S.power).toEqual({ usedKw: 6, capKw: 8 });
    place("power");
    expect(S.power).toEqual({ usedKw: 6, capKw: 14 });
    place("gpu");
    expect(S.power).toEqual({ usedKw: 12, capKw: 14 });
  });

  it("placement gate BOTH directions: the 2nd GPU is refused on the base cap, allowed after a substation", () => {
    place("gpu"); // 6 of 8: fine
    const before = S.services.length;
    const moneyBefore = S.money;
    expect(createService("gpu", { x: 60, z: 60 })).toBeNull(); // refused
    expect(S.services).toHaveLength(before);
    expect(S.money).toBe(moneyBefore); // and nothing was charged
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "power_gate_blocked",
      level: "danger",
    });

    place("power"); // cap 14
    expect(createService("gpu", { x: 60, z: 60 })).not.toBeNull(); // allowed now
    expect(S.services).toHaveLength(before + 2);
  });

  it("the gate is boundary INCLUSIVE: a draw landing exactly on the cap is legal", () => {
    // Pin the <= (not <) directly on the predicate.
    S.power = { usedKw: 8, capKw: 14 };
    expect(hasPowerHeadroom()).toBe(true); // 8 + 6 == 14: exactly on it
    S.power = { usedKw: 9, capKw: 14 };
    expect(hasPowerHeadroom()).toBe(false); // one watt over
    recomputePower();
  });

  it("3 GPUs (18 kW) fit on base 8 + TWO substations (20 kW); a 4th is refused", () => {
    const p = CONFIG.power;
    expect(3 * p.gpuDrawKw).toBeGreaterThan(p.baseCapKw + p.substationKw); // two GPUs' grid is not enough
    expect(3 * p.gpuDrawKw).toBeLessThanOrEqual(p.baseCapKw + 2 * p.substationKw);

    place("power");
    place("power");
    place("gpu");
    place("gpu");
    place("gpu");
    expect(S.power).toEqual({ usedKw: 18, capKw: 20 });
    const before = S.services.length;
    expect(createService("gpu", { x: 70, z: 70 })).toBeNull();
    expect(S.services).toHaveLength(before);
  });

  it("deletion gate (anti-cheese): a substation whose loss strands powered GPUs refuses demolition", () => {
    const sub = place("power");
    place("gpu");
    const gpu2 = place("gpu"); // 12 kW on cap 14
    const moneyBefore = S.money;

    expect(deleteObject(sub.id)).toBe(false); // buy-place-refund attempt
    expect(S.services.some((s) => s.id === sub.id)).toBe(true); // refused
    expect(S.money).toBe(moneyBefore); // no refund cheese
    expect(S.events).toContainEqual({
      kind: "warning",
      key: "power_delete_blocked",
      level: "danger",
    });

    expect(deleteObject(gpu2.id)).toBe(true); // GPU deletion stays free
    expect(S.services.some((s) => s.id === gpu2.id)).toBe(false);
    expect(S.power.usedKw).toBe(6);

    expect(deleteObject(sub.id)).toBe(true); // now the cap can shrink safely
    expect(S.services.some((s) => s.id === sub.id)).toBe(false);
    expect(S.power).toEqual({ usedKw: 6, capKw: 8 });
  });

  it("a reset puts the grid back to the base cap", () => {
    place("power");
    place("gpu");
    resetWorld();
    expect(S.power).toEqual({ usedKw: 0, capKw: CONFIG.power.baseCapKw });
  });

  it("power has NO edges in either direction: unwireable like monitor", () => {
    for (const other of ["internet", "waf", "alb", "compute", "gpu", "infgw", "sqs"]) {
      expect(isValidEdge(other, "power"), `${other} -> power`).toBe(false);
      expect(isValidEdge("power", other), `power -> ${other}`).toBe(false);
    }
  });
});

describe("demolishing a node that holds requests outside queue and processing", () => {
  it("removes a DLQ's parked requests with it, so none is stranded", () => {
    const alb = place("alb");
    const compute = place("compute");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, dlq); // no database: every WRITE parks
    // Fill the sink faster than it drains by parking straight into it.
    for (let i = 0; i < 5; i++) {
      const r = new Request("WRITE");
      S.requests.push(r);
      r.parked = true;
      dlq.parked.push(r);
    }
    expect(S.requests).toHaveLength(5);

    expect(deleteObject(dlq.id)).toBe(true);
    expect(S.requests).toHaveLength(0);
    run(2);
    expectDrained();
  });

  it("removes a stream's partitioned records with it", () => {
    const stream = place("stream");
    const sink = place("s3");
    connect(stream, sink);
    stream.partitions = [[], [], []];
    for (let i = 0; i < 6; i++) {
      const r = new Request("WRITE");
      S.requests.push(r);
      stream.partitions[i % 3]?.push(r);
    }
    expect(S.requests).toHaveLength(6);

    expect(deleteObject(stream.id)).toBe(true);
    expect(S.requests).toHaveLength(0);
  });
});
