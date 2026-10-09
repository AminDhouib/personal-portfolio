// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { stateHash } from "../hash";
import { resetSim, S } from "../state";
import { connect, place, resetWorld, run } from "./helpers";

afterEach(() => resetSim({ seed: "after-determinism" }));

/** A fixed board under survival traffic, run for two minutes. */
function playScripted(seed: string): number {
  resetWorld({ mode: "survival", seed, money: 5000 });
  S.currentRPS = 0.5;
  S.upkeepEnabled = true;
  const waf = place("waf");
  const alb = place("alb");
  const c1 = place("compute");
  const c2 = place("compute");
  const db = place("db");
  const s3 = place("s3");
  connect("internet", waf);
  connect(waf, alb);
  connect(alb, c1);
  connect(alb, c2);
  connect(c1, db);
  connect(c2, db);
  connect(c1, s3);
  connect(c2, s3);
  run(120);
  return stateHash();
}

describe("determinism", () => {
  it("the scripted run is a real one: traffic flows and money moves", () => {
    playScripted("failover-day-1");
    expect(S.requestsProcessed).toBeGreaterThan(20);
    expect(S.money).not.toBe(5000);
  });

  it("the same seed gives the same run", () => {
    expect(playScripted("failover-day-1")).toBe(playScripted("failover-day-1"));
  });

  it("a different seed gives a different run", () => {
    expect(playScripted("failover-day-1")).not.toBe(playScripted("failover-day-2"));
  });

  it("A, B, A shows no state leaking between runs", () => {
    const a1 = playScripted("failover-day-1");
    playScripted("failover-day-2");
    const a2 = playScripted("failover-day-1");
    expect(a2).toBe(a1);
  });

  it("the pinned seed still plays the way it did (change only on purpose)", () => {
    expect(playScripted("failover-pin")).toBe(PINNED_HASH);
  });
});

// Recorded from this build. A change here means the sim plays differently: bump it on purpose, never to quiet a failure.
// Re-pinned in T8-1b when stateHash gained the board layout, wiring and fleet state (was 1858401894).
const PINNED_HASH = 2572237937;
