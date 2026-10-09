// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { dispatch } from "../action-log";
import { CONFIG } from "../config";
import { replay } from "../replay";
import { scoreOf } from "../score";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { BOARD_A, play } from "./scripted";

// Sandbox is the same sim with the survival rules switched off by S.gameMode:
// no ramp, no events, no degradation, no upkeep, no way to lose, and no score.

afterEach(() => resetSim({ seed: "after-sandbox" }));

const TICKS_10_MIN = 12_000;

describe("sandbox has no failure", () => {
  it("an empty board bleeds reputation below zero and the run goes on", () => {
    resetSim({ seed: "sb-empty", mode: "sandbox" });
    step(TICKS_10_MIN);
    expect(S.reputation).toBeLessThan(0);
    expect(S.over).toBeNull();
    expect(S.tick).toBe(TICKS_10_MIN);
  });

  it("the same empty board in survival does end", () => {
    resetSim({ seed: "sb-empty", mode: "survival" });
    step(TICKS_10_MIN);
    expect(S.over?.reason).toBe("reputation");
  });

  it("debt past the survival floor does not end the run", () => {
    resetSim({ seed: "sb-debt", mode: "sandbox" });
    S.money = -5000;
    step(40);
    expect(S.over).toBeNull();

    resetSim({ seed: "sb-debt", mode: "survival" });
    S.money = -5000;
    step(1);
    expect(S.over?.reason).toBe("money");
  });

  it("only the player can end it, by retiring", () => {
    resetSim({ seed: "sb-retire", mode: "sandbox" });
    step(100);
    expect(dispatch({ op: 8 })).toEqual({ ok: true });
    expect(S.over).toEqual({ reason: "retired", atTick: 100 });
  });
});

describe("sandbox has no pressure", () => {
  it("holds the arrival rate at the sandbox default instead of ramping", () => {
    resetSim({ seed: "sb-rps", mode: "sandbox" });
    expect(S.currentRPS).toBe(CONFIG.sandbox.defaultRPS);
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    dispatch({ op: 1, from: "internet", to: "svc_1" });
    step(TICKS_10_MIN);
    expect(S.currentRPS).toBe(CONFIG.sandbox.defaultRPS);
  });

  it("fires no random events and bills no upkeep", () => {
    play("sb-events", "sandbox", BOARD_A, TICKS_10_MIN);
    const kinds = S.events.map((e) => e.kind);
    expect(kinds).not.toContain("event-start");
    expect(S.intervention.activeEvent).toBeNull();
    expect(S.finances.expenses.upkeep).toBe(0);
  });

  it("does not wear services down", () => {
    play("sb-wear", "sandbox", BOARD_A, TICKS_10_MIN);
    expect(S.services.length).toBeGreaterThan(0);
    for (const service of S.services) expect(service.health).toBe(100);

    play("sb-wear", "survival", BOARD_A, 2400);
    expect(S.services.some((service) => service.health < 100)).toBe(true);
  });
});

describe("sandbox has no score", () => {
  it("scores zero however much was served", () => {
    play("sb-score", "sandbox", BOARD_A, 2400);
    expect(S.requestsProcessed).toBeGreaterThan(0);
    expect(S.score.total).toBeGreaterThan(0);
    expect(scoreOf()).toBe(0);

    play("sb-score", "survival", BOARD_A, 2400);
    expect(scoreOf()).toBeGreaterThan(0);
  });

  it("a sandbox replay scores zero, so a sandbox run can never rank", () => {
    const run = play("sb-replay", "sandbox", BOARD_A, 2400);
    const again = replay({ seed: "sb-replay", mode: "sandbox", log: run.log, ticks: run.ticks });
    expect(again.score).toBe(0);
    expect(again.hash).toBe(run.hash);
  });
});
