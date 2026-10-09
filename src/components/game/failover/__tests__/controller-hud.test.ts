import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../sim/config";
import { dispatch } from "../sim/action-log";
import { S, emit, resetSim } from "../sim/state";
import { makeController } from "./ui-harness";

// What the controller adds to the HUD from the sim's events: failure badges
// pinned over nodes, the latest warning, the run's end (once), and the
// inspector's actions.

afterEach(() => {
  resetSim({ seed: "controller-hud-reset" });
});

describe("badges", () => {
  it("pins a failure's reason over its node, one per node, and lets it fade", () => {
    const h = makeController();
    h.controller.resize(800, 600);
    h.place("compute", -16, 0);
    h.controller.start();
    h.frame(16);
    emit({
      kind: "request-failed",
      id: 1,
      reason: "fail_queue_full",
      serviceId: "svc_1",
      breach: false,
    });
    emit({
      kind: "request-failed",
      id: 2,
      reason: "fail_queue_full",
      serviceId: "svc_1",
      breach: false,
    });
    h.frame(300);
    let badges = h.controller.getHud().badges;
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "fail_queue_full" });
    // The view is centred near the node, so the badge lands inside it.
    expect(badges[0]!.x).toBeGreaterThan(0);
    expect(badges[0]!.x).toBeLessThan(800);
    const first = badges[0]!.id;

    emit({ kind: "service-badge", serviceId: "svc_1", key: "soft_slow" });
    h.frame(300);
    badges = h.controller.getHud().badges;
    expect(badges.map((b) => b.key)).toEqual(["soft_slow"]);
    expect(badges[0]!.id).not.toBe(first);

    h.frame(2000);
    h.frame(300);
    expect(h.controller.getHud().badges).toEqual([]);
    h.controller.dispose();
  });

  it("drops a badge whose node is gone, and a failure with no node or reason", () => {
    const h = makeController();
    h.place("compute", -16, 0);
    h.controller.start();
    h.frame(16);
    emit({
      kind: "request-failed",
      id: 1,
      reason: "fail_no_route",
      serviceId: "svc_1",
      breach: false,
    });
    emit({ kind: "request-failed", id: 2, reason: null, serviceId: "svc_1", breach: false });
    emit({
      kind: "request-failed",
      id: 3,
      reason: "fail_no_route",
      serviceId: null,
      breach: false,
    });
    expect(dispatch({ op: 3, id: "svc_1" }).ok).toBe(true);
    h.frame(300);
    expect(h.controller.getHud().badges).toEqual([]);
    h.controller.dispose();
  });
});

describe("alerts", () => {
  it("shows the latest warning for a few seconds", () => {
    const h = makeController();
    h.controller.start();
    h.frame(16);
    emit({ kind: "warning", key: "ddos_incoming", level: "danger" });
    h.frame(300);
    expect(h.controller.getHud().alert).toEqual({
      key: "ddos_incoming",
      level: "danger",
      params: {},
    });
    h.frame(5000);
    h.frame(300);
    expect(h.controller.getHud().alert).toBeNull();
    h.controller.dispose();
  });
});

describe("the end of a run", () => {
  it("is reported once, with the time survived and the score", () => {
    const onRunEnd = vi.fn();
    const h = makeController({ mode: "survival", onRunEnd });
    h.controller.start();
    h.frame(16);
    for (let i = 0; i < 40; i++) h.frame(50);
    expect(dispatch({ op: 8 }).ok).toBe(true);
    h.frame(50);
    expect(onRunEnd).toHaveBeenCalledTimes(1);
    expect(onRunEnd).toHaveBeenCalledWith({
      mode: "survival",
      seconds: S.elapsedGameTime,
      score: 20,
    });
    h.frame(50);
    expect(onRunEnd).toHaveBeenCalledTimes(1);
    expect(h.controller.getHud().report).not.toBeNull();
    h.controller.dispose();
  });
});

describe("the inspector's actions", () => {
  it("upgrades, repairs, toggles auto-scaling and demolishes the selected node", () => {
    const h = makeController();
    h.place("compute", -16, 0);
    h.controller.setTool({ kind: "select" });
    h.aim({ x: -16, z: 0 }, "svc_1");
    h.controller.tap(0, 0, "mouse");
    expect(h.controller.getHud().selected?.id).toBe("svc_1");

    h.controller.upgradeSelected();
    expect(S.services[0]!.tier).toBe(2);
    S.services[0]!.health = 40;
    const before = S.money;
    h.controller.repairSelected();
    expect(S.services[0]!.health).toBe(100);
    expect(S.money).toBe(
      before -
        Math.ceil(CONFIG.services.compute.cost * CONFIG.survival.degradation.repairCostPercent),
    );
    h.controller.toggleAsgSelected();
    expect(h.controller.getHud().selected?.asg).toBe(true);

    h.controller.demolishSelected();
    expect(S.services).toHaveLength(0);
    expect(h.controller.getHud().selected).toBeNull();
    h.controller.dispose();
  });

  it("closes without touching the board", () => {
    const h = makeController();
    h.place("waf", -28, 0);
    h.controller.setTool({ kind: "select" });
    h.aim({ x: -28, z: 0 }, "svc_1");
    h.controller.tap(0, 0, "mouse");
    h.controller.deselect();
    expect(h.controller.getHud().selected).toBeNull();
    expect(S.services).toHaveLength(1);
    h.controller.dispose();
  });
});
