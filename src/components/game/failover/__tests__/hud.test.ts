// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { readSimHud } from "../hud";
import { dispatch } from "../sim/action-log";
import { CONFIG } from "../sim/config";
import { S, resetSim } from "../sim/state";
import { step } from "../sim/tick";

// What the HUD reads off the sim: the inspector's numbers, upkeep, failures,
// the coach's checkpoints and the metrics gate. It reads only.

afterEach(() => {
  resetSim({ seed: "hud-reset" });
});

function place(action: Parameters<typeof dispatch>[0] & { op: 0 }) {
  expect(dispatch(action).ok).toBe(true);
}

describe("readSimHud", () => {
  it("starts a survival run with the budget, full reputation and no failures", () => {
    resetSim({ seed: "hud-1" });
    const hud = readSimHud(null);
    expect(hud).toMatchObject({
      mode: "survival",
      money: CONFIG.survival.startBudget,
      reputation: 100,
      over: null,
      score: 0,
      goodput: null,
      upkeepPerMin: 0,
      failures: 0,
      failuresByReason: [],
      power: null,
      monitoring: false,
      selected: null,
      metrics: [],
      milestones: { waf: false, wafLinked: false, compute: false, db: false },
    });
  });

  it("describes the selected node for the inspector", () => {
    resetSim({ seed: "hud-2", mode: "sandbox", budget: 100_000 });
    place({ op: 0, type: "compute", x: -16, z: 0 });
    const compute = CONFIG.services.compute;
    let hud = readSimHud("svc_1");
    expect(hud.selected).toMatchObject({
      id: "svc_1",
      type: "compute",
      name: compute.name,
      tier: 1,
      maxTier: compute.tiers?.length,
      health: 100,
      upgradeCost: compute.tiers?.[1]?.cost,
      repairCost: null,
      refund: Math.floor(compute.cost / 2),
      asg: false,
      instances: 1,
      disabled: false,
    });

    S.services[0]!.health = 50;
    expect(dispatch({ op: 5, id: "svc_1" }).ok).toBe(true);
    hud = readSimHud("svc_1");
    expect(hud.selected?.asg).toBe(true);
    expect(hud.selected?.repairCost).toBe(
      Math.ceil(compute.cost * CONFIG.survival.degradation.repairCostPercent),
    );

    for (let tier = 1; tier < (compute.tiers?.length ?? 1); tier++) {
      expect(dispatch({ op: 4, id: "svc_1" }).ok).toBe(true);
    }
    expect(readSimHud("svc_1").selected?.upgradeCost).toBeNull();
    expect(readSimHud("svc_9")).toMatchObject({ selected: null });
  });

  it("says a firewall cannot scale and has no tiers", () => {
    resetSim({ seed: "hud-3", mode: "sandbox", budget: 100_000 });
    place({ op: 0, type: "waf", x: -28, z: 0 });
    expect(readSimHud("svc_1").selected).toMatchObject({
      asg: null,
      maxTier: 1,
      upgradeCost: null,
    });
  });

  it("totals upkeep per minute at today's multiplier", () => {
    resetSim({ seed: "hud-4" });
    place({ op: 0, type: "waf", x: -28, z: 0 });
    place({ op: 0, type: "alb", x: -16, z: 0 });
    expect(readSimHud(null).upkeepPerMin).toBeCloseTo(
      CONFIG.services.waf.upkeep + CONFIG.services.alb.upkeep,
      6,
    );
  });

  it("ticks the coach's checkpoints off the board", () => {
    resetSim({ seed: "hud-5", mode: "sandbox", budget: 100_000 });
    place({ op: 0, type: "waf", x: -28, z: 0 });
    expect(readSimHud(null).milestones).toEqual({
      waf: true,
      wafLinked: false,
      compute: false,
      db: false,
    });
    expect(dispatch({ op: 1, from: "internet", to: "svc_1" }).ok).toBe(true);
    place({ op: 0, type: "compute", x: -16, z: 0 });
    place({ op: 0, type: "db", x: -4, z: 0 });
    expect(readSimHud(null).milestones).toEqual({
      waf: true,
      wafLinked: true,
      compute: true,
      db: true,
    });
  });

  it("counts failures by reason, most first", () => {
    resetSim({ seed: "hud-6" });
    S.failuresByReason = { fail_no_route: 3, fail_queue_full: 7, fail_breach: 0 };
    S.failures.READ = 10;
    const hud = readSimHud(null);
    expect(hud.failures).toBe(10);
    expect(hud.failuresByReason).toEqual([
      ["fail_queue_full", 7],
      ["fail_no_route", 3],
    ]);
  });

  it("opens the metrics rows only with a live Monitoring node", () => {
    resetSim({ seed: "hud-7", mode: "sandbox", budget: 100_000 });
    place({ op: 0, type: "compute", x: -16, z: 0 });
    step(20);
    expect(readSimHud(null).metrics).toEqual([]);
    place({ op: 0, type: "monitor", x: -16, z: 8 });
    step(20);
    const hud = readSimHud(null);
    expect(hud.monitoring).toBe(true);
    expect(hud.metrics.map((r) => r.id)).toEqual(["svc_1", "svc_2"]);
    expect(hud.metrics[0]).toMatchObject({ name: CONFIG.services.compute.name, err: 0 });
  });

  it("shows the power grid once a GPU or a substation is placed", () => {
    resetSim({ seed: "hud-8", mode: "sandbox", budget: 100_000 });
    expect(readSimHud(null).power).toBeNull();
    place({ op: 0, type: "power", x: 8, z: 8 });
    expect(readSimHud(null).power).toEqual({ ...S.power });
  });
});
