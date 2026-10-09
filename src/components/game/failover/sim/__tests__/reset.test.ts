// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { rand } from "../rng";
import { createState, resetSim, S } from "../state";
import { step } from "../tick";
import { connect, inject, place, resetWorld, run } from "./helpers";

afterEach(() => resetSim({ seed: "after-reset" }));

function playSomething(): void {
  const waf = place("waf");
  const alb = place("alb");
  const compute = place("compute");
  const db = place("db");
  connect("internet", waf);
  connect(waf, alb);
  connect(alb, compute);
  connect(compute, db);
  inject("READ");
  inject("MALICIOUS");
  run(60);
}

describe("resetSim", () => {
  it("after a scripted minute, a reset equals a fresh state", () => {
    resetWorld({ mode: "survival", seed: "reset-a" });
    playSomething();
    expect(S.tick).toBeGreaterThan(0);

    resetSim({ seed: "reset-b", mode: "survival" });
    expect(S).toEqual(createState({ seed: "reset-b", mode: "survival" }));
  });

  it("clears the entry round-robin", () => {
    resetWorld();
    const a = place("waf");
    const b = place("waf");
    connect("internet", a);
    connect("internet", b);
    inject("READ");
    expect(Object.keys(S.entryRR).length).toBeGreaterThan(0);

    resetSim({ seed: "x" });
    expect(S.entryRR).toEqual({});
  });

  it("restarts id counters", () => {
    resetWorld();
    place("alb");
    inject("READ");
    resetSim({ seed: "x" });
    expect(S.nextServiceId).toBe(1);
    expect(S.nextRequestId).toBe(1);
  });

  it("re-seeds the streams: the same seed replays the same draws", () => {
    resetSim({ seed: "replay" });
    const a = [rand("traffic"), rand("events"), rand("rolls")];
    resetSim({ seed: "other" });
    rand("traffic");
    resetSim({ seed: "replay" });
    const b = [rand("traffic"), rand("events"), rand("rolls")];
    expect(b).toEqual(a);
  });

  it("the three streams are independent of each other", () => {
    resetSim({ seed: "indep" });
    const first = rand("rolls");
    resetSim({ seed: "indep" });
    for (let i = 0; i < 50; i++) rand("traffic");
    expect(rand("rolls")).toBe(first);
  });

  it("a finished run does not stay finished after a reset", () => {
    resetWorld({ mode: "survival" });
    S.reputation = 0;
    step();
    expect(S.over).not.toBe(null);
    resetSim({ seed: "again", mode: "survival" });
    expect(S.over).toBe(null);
    step();
    expect(S.tick).toBe(1);
  });

  it("a dangling shift or spike from the last run does not leak", () => {
    resetWorld({ mode: "survival" });
    S.maliciousSpikeActive = true;
    S.normalTrafficDist = { READ: 1 };
    S.intervention.trafficShiftActive = true;
    resetSim({ seed: "clean", mode: "survival" });
    expect(S.maliciousSpikeActive).toBe(false);
    expect(S.normalTrafficDist).toBe(null);
    expect(S.intervention.trafficShiftActive).toBe(false);
  });

  it("sandbox and survival start with their own budgets", () => {
    resetSim({ seed: "m", mode: "sandbox" });
    const sandboxMoney = S.money;
    resetSim({ seed: "m", mode: "survival" });
    expect(S.money).not.toBe(sandboxMoney);
  });

  it("caps the pending event queue", () => {
    resetWorld();
    for (let i = 0; i < 600; i++) place("alb");
    expect(S.events.length).toBeLessThanOrEqual(512);
  });
});
