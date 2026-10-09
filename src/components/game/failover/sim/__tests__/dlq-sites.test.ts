// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAIL_REASONS } from "../failure-reasons";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { connect, inject, place, resetWorld, run } from "./helpers";

// Pin every roll so a cache miss or a load failure can be forced.
const pin = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("../rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rng")>();
  return {
    ...real,
    rand: (stream: Parameters<typeof real.rand>[0]) => pin.value ?? real.rand(stream),
  };
});

// Record every call into the failOrPark seam, then run the real thing.
const seam = vi.hoisted(() => ({ calls: [] as Array<[number, string, string | null]> }));
vi.mock("../actions", async (importOriginal) => {
  const real = await importOriginal<typeof import("../actions")>();
  return {
    ...real,
    failOrPark: (...args: Parameters<typeof real.failOrPark>) => {
      seam.calls.push([args[0].id, args[1].type, args[2] ?? null]);
      real.failOrPark(...args);
    },
  };
});

beforeEach(() => {
  seam.calls.length = 0;
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-dlq-sites" });
});

// failOrPark is one seam: every place a request can run out of road must hand it
// to a wired dead-letter queue instead of dropping it. One case per call site.
function parkedIn(dlqId: string, reqId: number): boolean {
  return S.events.some((e) => e.kind === "request-parked" && e.id === reqId && e.dlqId === dlqId);
}

describe("the cache routes its dead ends through failOrPark too", () => {
  // A cache cannot be wired to a DLQ (the edge rule forbids it), so the park itself
  // is unreachable here; what matters is that the dead end goes through the seam.
  function missWith(type: "READ" | "STATIC"): Request {
    const cache = place("cache");
    const req = new Request(type);
    S.requests.push(req);
    req.flyTo(cache);
    pin.value = 0.99; // a miss
    run(20);
    return req;
  }

  it("a miss with no database behind it", () => {
    const req = missWith("READ");
    expect(seam.calls).toContainEqual([req.id, "cache", FAIL_REASONS.NO_ROUTE]);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBe(1);
  });

  it("a miss for a storage destination with nothing behind it", () => {
    const req = missWith("STATIC");
    expect(seam.calls).toContainEqual([req.id, "cache", FAIL_REASONS.NO_ROUTE]);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBe(1);
  });
});

describe("a wired DLQ catches the request at every failure site", () => {
  it("compute with no downstream for the destination", () => {
    const alb = place("alb");
    const compute = place("compute");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, dlq);
    const req = inject("READ");
    run(5);
    expect(parkedIn(dlq.id, req.id)).toBe(true);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBeUndefined();
  });

  it("a plain forward with nowhere to go", () => {
    const alb = place("alb");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, dlq);
    const req = inject("READ");
    run(3);
    expect(parkedIn(dlq.id, req.id)).toBe(true);
  });

  it("the load-failure roll", () => {
    const compute = place("compute");
    const dlq = place("dlq");
    connect(compute, dlq);
    compute.health = 20; // a damaged node fails (1 - 0.2) * 0.5 = 40% of the time
    const req = new Request("READ");
    S.requests.push(req);
    compute.processing.push({ req, timer: 1e9 });
    pin.value = 0.1;
    step();
    expect(parkedIn(dlq.id, req.id)).toBe(true);
    expect(S.failuresByReason[FAIL_REASONS.OVERLOADED]).toBeUndefined();
  });

  it("without a DLQ the same failures are plain drops", () => {
    const compute = place("compute");
    compute.health = 20;
    const req = new Request("READ");
    S.requests.push(req);
    compute.processing.push({ req, timer: 1e9 });
    pin.value = 0.1;
    step();
    expect(S.failuresByReason[FAIL_REASONS.OVERLOADED]).toBe(1);
    expect(S.events.some((e) => e.kind === "request-parked")).toBe(false);
  });
});
