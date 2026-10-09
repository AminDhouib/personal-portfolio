// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG, TICK } from "../config";
import { resetSim, S } from "../state";
import { calculateTargetRPS, smoothTowardsRPS, step } from "../tick";
import { place, resetWorld } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-tick" }));

describe("the fixed step", () => {
  it("one tick is 0.05 s of game time, exactly", () => {
    expect(TICK).toBe(0.05);
    step();
    expect(S.tick).toBe(1);
    expect(S.elapsedGameTime).toBe(TICK);
  });

  it("game time is the tick count times TICK, with no drift over a long run", () => {
    step(20000);
    expect(S.elapsedGameTime).toBe(20000 * TICK);
  });

  it("step(0) and negative counts do nothing", () => {
    step(0);
    step(-5);
    expect(S.tick).toBe(0);
  });
});

describe("the RPS ramp", () => {
  it("smoothing closes 1% of the gap per 60 fps frame", () => {
    expect(smoothTowardsRPS(0, 100, 1 / 60)).toBeCloseTo(1, 9);
  });

  it("is step-size invariant: 1 s in 20 ticks equals 1 s in one", () => {
    let fine = 0;
    for (let i = 0; i < 20; i++) fine = smoothTowardsRPS(fine, 10, 0.05);
    expect(fine).toBeCloseTo(smoothTowardsRPS(0, 10, 1), 9);
  });

  it("the target grows with game time", () => {
    expect(calculateTargetRPS(0)).toBeCloseTo(CONFIG.survival.baseRPS, 9);
    expect(calculateTargetRPS(300)).toBeGreaterThan(calculateTargetRPS(60));
  });

  it("a survival run climbs toward the target and never past the cap", () => {
    resetWorld({ mode: "survival" });
    S.upkeepEnabled = false;
    S.currentRPS = 0.5;
    const start = S.currentRPS;
    step(Math.round(120 / TICK));
    expect(S.currentRPS).toBeGreaterThan(start);
    expect(S.currentRPS).toBeLessThanOrEqual(CONFIG.survival.maxRPS);
  });

  it("sandbox does not ramp", () => {
    S.currentRPS = 3;
    step(400);
    expect(S.currentRPS).toBe(3);
  });
});

describe("game over", () => {
  it("ends a survival run when reputation reaches zero, and then stops", () => {
    resetWorld({ mode: "survival" });
    S.reputation = 0;
    step();
    expect(S.over).toEqual({ reason: "reputation", atTick: 1 });
    expect(S.events).toContainEqual({ kind: "game-over", reason: "reputation" });
    step(100);
    expect(S.tick).toBe(1);
  });

  it("ends on debt past the floor", () => {
    resetWorld({ mode: "survival" });
    S.money = -1000;
    step();
    expect(S.over?.reason).toBe("money");
  });

  it("reports reputation when both are gone", () => {
    resetWorld({ mode: "survival" });
    S.money = -5000;
    S.reputation = 0;
    step();
    expect(S.over?.reason).toBe("reputation");
  });

  it("never ends a sandbox run", () => {
    S.reputation = 0;
    S.money = -9999;
    step(20);
    expect(S.over).toBe(null);
  });

  it("reputation is capped at 100", () => {
    S.reputation = 250;
    step();
    expect(S.reputation).toBe(100);
  });
});

describe("auto-repair upkeep", () => {
  it("charges per second only when upkeep is on", () => {
    place("alb");
    S.autoRepairEnabled = true;
    const before = S.money;
    step(20);
    expect(S.money).toBe(before);
    S.upkeepEnabled = true;
    step(20);
    expect(S.money).toBeLessThan(before);
  });
});
