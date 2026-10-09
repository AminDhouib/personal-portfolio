// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatch, encodeAction, MAX_LOGGED_ACTIONS, type Action } from "../action-log";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "../config";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { resetWorld } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-action-log" }));

const typeIndex = (t: ServiceType) => SERVICE_TYPES.indexOf(t);
const place = (type: ServiceType, x: number, z = 0) => dispatch({ op: 0, type, x, z });
/** The id the nth placed service gets (a counter, so a replay names things the same way). */
const id = (n: number) => `svc_${n}`;

describe("place (op 0)", () => {
  it("builds the service, charges the price and logs the attempt", () => {
    const before = S.money;
    expect(place("compute", 0)).toEqual({ ok: true });
    expect(S.services.map((s) => s.type)).toEqual(["compute"]);
    expect(S.money).toBe(before - CONFIG.services.compute.cost);
    expect(S.log).toEqual([[0, 0, typeIndex("compute"), 0, 0]]);
  });

  it("snaps to the tile grid, and logs where it really went", () => {
    expect(place("compute", 5.4, -1.2).ok).toBe(true);
    expect(S.services[0]?.position).toEqual({ x: 4, z: 0 });
    expect(S.log[0]).toEqual([0, 0, typeIndex("compute"), 4, 0]);
  });

  it("is refused when the money is short, and still logged", () => {
    resetWorld({ money: CONFIG.services.compute.cost - 1 });
    expect(place("compute", 0)).toEqual({ ok: false, reason: "money" });
    expect(S.services).toHaveLength(0);
    expect(S.log).toEqual([[0, 0, typeIndex("compute"), 0, 0]]);
  });

  it("is refused on an occupied tile", () => {
    place("alb", 0);
    expect(place("compute", 0)).toEqual({ ok: false, reason: "occupied" });
    expect(S.services).toHaveLength(1);
    expect(S.log).toHaveLength(2);
  });

  it("is refused outside the board", () => {
    const edge = (CONFIG.gridSize * CONFIG.tileSize) / 2;
    expect(place("alb", edge).ok).toBe(true);
    expect(place("alb", edge + CONFIG.tileSize)).toEqual({ ok: false, reason: "bounds" });
    expect(place("alb", 0, -(edge + CONFIG.tileSize))).toEqual({ ok: false, reason: "bounds" });
  });

  it("is refused for a non-finite position without a log entry (it cannot be encoded)", () => {
    expect(place("alb", Number.NaN)).toEqual({ ok: false, reason: "bad-args" });
    expect(S.log).toHaveLength(0);
  });
});

describe("link and unlink (ops 1, 2)", () => {
  beforeEach(() => {
    place("waf", 0);
    place("alb", 8);
    place("compute", 16);
  });

  it("links the Internet to a service and a service to the next", () => {
    expect(dispatch({ op: 1, from: "internet", to: id(1) })).toEqual({ ok: true });
    expect(dispatch({ op: 1, from: id(1), to: id(2) })).toEqual({ ok: true });
    expect(S.internetNode.connections).toEqual([id(1)]);
    expect(S.connections).toEqual([
      { from: "internet", to: id(1) },
      { from: id(1), to: id(2) },
    ]);
    // The Internet is id 0 in the log; services are their counter.
    expect(S.log.slice(3)).toEqual([
      [0, 1, 0, 1],
      [0, 1, 1, 2],
    ]);
  });

  it("refuses by edge rule, for each rule, and logs every attempt", () => {
    const attempts: Array<[Action, string]> = [
      [{ op: 1, from: id(1), to: id(1) }, "self"],
      [{ op: 1, from: id(3), to: id(1) }, "invalid"],
      [{ op: 1, from: id(1), to: "svc_99" }, "missing"],
      [{ op: 1, from: "svc_99", to: id(1) }, "missing"],
    ];
    for (const [action, reason] of attempts) {
      expect(dispatch(action)).toEqual({ ok: false, reason });
    }
    dispatch({ op: 1, from: id(1), to: id(2) });
    expect(dispatch({ op: 1, from: id(1), to: id(2) })).toEqual({ ok: false, reason: "exists" });
    expect(dispatch({ op: 1, from: id(2), to: id(1) })).toEqual({ ok: false, reason: "reverse" });
    expect(S.connections).toEqual([{ from: id(1), to: id(2) }]);
    expect(S.log).toHaveLength(3 + attempts.length + 3);
  });

  it("unlinks an existing link and refuses a missing one", () => {
    dispatch({ op: 1, from: id(1), to: id(2) });
    expect(dispatch({ op: 2, from: id(1), to: id(2) })).toEqual({ ok: true });
    expect(S.connections).toEqual([]);
    expect(dispatch({ op: 2, from: id(1), to: id(2) })).toEqual({ ok: false, reason: "missing" });
    expect(S.log.slice(-2)).toEqual([
      [0, 2, 1, 2],
      [0, 2, 1, 2],
    ]);
  });
});

describe("demolish (op 3)", () => {
  it("removes the service, its links, and refunds half the price", () => {
    place("alb", 0);
    place("compute", 8);
    dispatch({ op: 1, from: id(1), to: id(2) });
    const before = S.money;
    expect(dispatch({ op: 3, id: id(2) })).toEqual({ ok: true });
    expect(S.services.map((s) => s.id)).toEqual([id(1)]);
    expect(S.connections).toEqual([]);
    expect(S.money).toBe(before + Math.floor(CONFIG.services.compute.cost / 2));
    expect(S.log.at(-1)).toEqual([0, 3, 2]);
  });

  it("is refused for a service that is not there, and logged", () => {
    expect(dispatch({ op: 3, id: "svc_7" })).toEqual({ ok: false, reason: "missing" });
    expect(S.log).toEqual([[0, 3, 7]]);
  });
});

describe("upgrade (op 4)", () => {
  it("buys the next tier", () => {
    place("compute", 0);
    const before = S.money;
    expect(dispatch({ op: 4, id: id(1) })).toEqual({ ok: true });
    expect(S.services[0]?.tier).toBe(2);
    expect(S.money).toBe(before - (CONFIG.services.compute.tiers?.[1]?.cost ?? NaN));
    expect(S.log.at(-1)).toEqual([0, 4, 1]);
  });

  it("is refused when the money is short, at the top tier, for a type with no tiers, or unknown", () => {
    place("compute", 0);
    place("waf", 8);
    S.money = 1;
    expect(dispatch({ op: 4, id: id(1) })).toEqual({ ok: false, reason: "money" });
    S.money = 100000;
    expect(dispatch({ op: 4, id: id(1) }).ok).toBe(true);
    expect(dispatch({ op: 4, id: id(1) }).ok).toBe(true);
    expect(dispatch({ op: 4, id: id(1) })).toEqual({ ok: false, reason: "max-tier" });
    expect(dispatch({ op: 4, id: id(2) })).toEqual({ ok: false, reason: "not-upgradable" });
    expect(dispatch({ op: 4, id: "svc_9" })).toEqual({ ok: false, reason: "missing" });
    expect(S.log).toHaveLength(2 + 1 + 2 + 3);
  });
});

describe("toggleAsg (op 5)", () => {
  it("switches a compute node's auto-scaling on and off", () => {
    place("compute", 0);
    expect(dispatch({ op: 5, id: id(1) })).toEqual({ ok: true });
    expect(S.services[0]?.asgEnabled).toBe(true);
    expect(dispatch({ op: 5, id: id(1) })).toEqual({ ok: true });
    expect(S.services[0]?.asgEnabled).toBe(false);
    expect(S.log.at(-1)).toEqual([0, 5, 1]);
  });

  it("turning it off collapses the fleet to one instance", () => {
    place("compute", 0);
    dispatch({ op: 5, id: id(1) });
    const svc = S.services[0];
    if (!svc) throw new Error("no service");
    svc.instances = 3;
    svc.warming = [1.5];
    dispatch({ op: 5, id: id(1) });
    expect(svc.instances).toBe(1);
    expect(svc.warming).toEqual([]);
  });

  it("is refused for a type that cannot scale, and for an unknown id", () => {
    place("db", 0);
    expect(dispatch({ op: 5, id: id(1) })).toEqual({ ok: false, reason: "not-scalable" });
    expect(S.services[0]?.asgEnabled).toBe(false);
    expect(dispatch({ op: 5, id: "svc_9" })).toEqual({ ok: false, reason: "missing" });
    expect(S.log).toHaveLength(3);
  });
});

describe("repair (op 6)", () => {
  it("restores a damaged service for the repair fee", () => {
    place("db", 0);
    const svc = S.services[0];
    if (!svc) throw new Error("no service");
    svc.health = 40;
    const before = S.money;
    expect(dispatch({ op: 6, id: id(1) })).toEqual({ ok: true });
    expect(svc.health).toBe(100);
    expect(S.money).toBe(
      before - Math.ceil(CONFIG.services.db.cost * CONFIG.survival.degradation.repairCostPercent),
    );
    expect(S.log.at(-1)).toEqual([0, 6, 1]);
  });

  it("is refused when healthy, when the money is short, and for an unknown id", () => {
    place("db", 0);
    expect(dispatch({ op: 6, id: id(1) })).toEqual({ ok: false, reason: "healthy" });
    const svc = S.services[0];
    if (!svc) throw new Error("no service");
    svc.health = 40;
    S.money = 0;
    expect(dispatch({ op: 6, id: id(1) })).toEqual({ ok: false, reason: "money" });
    expect(svc.health).toBe(40);
    expect(dispatch({ op: 6, id: "svc_9" })).toEqual({ ok: false, reason: "missing" });
    expect(S.log).toHaveLength(4);
  });
});

describe("autoRepair (op 7)", () => {
  it("sets the crew on and off", () => {
    expect(dispatch({ op: 7, on: true })).toEqual({ ok: true });
    expect(S.autoRepairEnabled).toBe(true);
    expect(dispatch({ op: 7, on: false })).toEqual({ ok: true });
    expect(S.autoRepairEnabled).toBe(false);
    expect(S.log).toEqual([
      [0, 7, 1],
      [0, 7, 0],
    ]);
  });
});

describe("retire (op 8)", () => {
  it("ends the run, and the run stays ended", () => {
    step(40);
    expect(dispatch({ op: 8 })).toEqual({ ok: true });
    expect(S.over).toEqual({ reason: "retired", atTick: 40 });
    expect(S.events.at(-1)).toEqual({ kind: "game-over", reason: "retired" });
    step(100);
    expect(S.tick).toBe(40);
    expect(S.log).toEqual([[40, 8]]);
  });

  it("works in survival too, and a finished run refuses everything without logging", () => {
    resetWorld({ mode: "survival" });
    dispatch({ op: 8 });
    expect(place("alb", 0)).toEqual({ ok: false, reason: "over" });
    expect(dispatch({ op: 8 })).toEqual({ ok: false, reason: "over" });
    expect(S.services).toHaveLength(0);
    expect(S.log).toHaveLength(1);
  });
});

describe("the log", () => {
  it("stamps each entry with the tick it was issued at", () => {
    place("alb", 0);
    step(7);
    place("compute", 8);
    expect(S.log.map((e) => e[0])).toEqual([0, 7]);
  });

  it("logs a refusal exactly like another run would: same state, same result, same entry", () => {
    const script = (): Array<{ ok: boolean; reason?: string }> => [
      place("apigw", 0),
      place("apigw", 0),
      dispatch({ op: 1, from: "internet", to: id(1) }),
      dispatch({ op: 1, from: "internet", to: id(1) }),
      dispatch({ op: 4, id: id(1) }),
      dispatch({ op: 3, id: "svc_5" }),
    ];
    resetWorld({ money: CONFIG.services.apigw.cost + 5 });
    const first = script();
    const firstLog = structuredClone(S.log);
    resetWorld({ money: CONFIG.services.apigw.cost + 5 });
    const second = script();
    expect(second).toEqual(first);
    expect(S.log).toEqual(firstLog);
    // Money is checked before the tile, as createService does, so this one is "money".
    expect(first.map((r) => r.reason)).toEqual([
      undefined,
      "money",
      undefined,
      "exists",
      "money",
      "missing",
    ]);
    expect(firstLog).toHaveLength(6);
  });

  it("encodes each op in the compact shape", () => {
    expect(encodeAction(3, { op: 0, type: "waf", x: 4, z: -8 })).toEqual([
      3,
      0,
      typeIndex("waf"),
      4,
      -8,
    ]);
    expect(encodeAction(0, { op: 1, from: "internet", to: "svc_12" })).toEqual([0, 1, 0, 12]);
    expect(encodeAction(0, { op: 7, on: true })).toEqual([0, 7, 1]);
    expect(encodeAction(9, { op: 8 })).toEqual([9, 8]);
  });

  it("flags overflow past the cap, keeps the cap's worth, and the run stays playable", () => {
    for (let i = 0; i < MAX_LOGGED_ACTIONS; i++) dispatch({ op: 7, on: i % 2 === 0 });
    expect(S.log).toHaveLength(MAX_LOGGED_ACTIONS);
    expect(S.logOverflow).toBe(false);

    expect(dispatch({ op: 7, on: true })).toEqual({ ok: true });
    expect(S.logOverflow).toBe(true);
    expect(S.log).toHaveLength(MAX_LOGGED_ACTIONS);
    // Playable: actions still apply, the clock still runs.
    expect(place("alb", 0).ok).toBe(true);
    step(20);
    expect(S.tick).toBe(20);
  });

  it("is cleared by a reset", () => {
    place("alb", 0);
    S.logOverflow = true;
    resetWorld();
    expect(S.log).toEqual([]);
    expect(S.logOverflow).toBe(false);
  });
});
