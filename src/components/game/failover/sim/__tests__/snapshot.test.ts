// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateHash } from "../hash";
import { snapshot } from "../snapshot";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { connect, inject, place, resetWorld, run } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-snapshot" }));

describe("snapshot", () => {
  it("describes services, requests and links by plain values", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    inject("READ");

    const snap = snapshot();
    expect(snap.services.map((s) => s.type)).toEqual(["alb", "compute"]);
    expect(snap.services[0]).toMatchObject({
      id: alb.id,
      x: 0,
      z: 0,
      tier: 1,
      health: 100,
      disabled: false,
    });
    expect(snap.requests).toHaveLength(1);
    expect(snap.requests[0]?.type).toBe("READ");
    expect(snap.connections).toContainEqual({ from: alb.id, to: compute.id });
    expect(snap.internet).toEqual(S.internetNode.position);
  });

  it("is a copy: editing it never reaches the sim", () => {
    place("alb");
    const before = stateHash();
    const snap = snapshot();
    const first = snap.services[0];
    if (first) first.health = 1;
    snap.score.total = 999;
    snap.internet.x = 5;
    expect(stateHash()).toBe(before);
    expect(S.score.total).toBe(0);
  });

  it("reports progress toward the target, and the end of a run", () => {
    const alb = place("alb");
    connect("internet", alb);
    inject("READ");
    const p0 = snapshot().requests[0]?.progress ?? -1;
    step(5);
    const p1 = snapshot().requests[0]?.progress ?? -1;
    expect(p1).toBeGreaterThan(p0);
    expect(p1).toBeLessThanOrEqual(1);
    S.reputation = 0;
    S.gameMode = "survival";
    run(0.1);
    expect(snapshot().over).toBe("reputation");
  });
});

describe("stateHash", () => {
  it("changes when the sim changes", () => {
    const a = stateHash();
    step();
    expect(stateHash()).not.toBe(a);
  });

  it("is a 32-bit unsigned integer", () => {
    const h = stateHash();
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});
