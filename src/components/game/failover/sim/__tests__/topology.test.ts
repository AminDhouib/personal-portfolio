// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "../config";
import { Request } from "../request";
import { resetSim, S } from "../state";
import {
  createConnection,
  createService,
  deleteConnection,
  deleteObject,
  isValidEdge,
  linkTargets,
  snapToGrid,
  validTargets,
} from "../topology";
import { connect, place, resetWorld } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-topology" }));

function tryEdge(fromType: ServiceType | "internet", toType: ServiceType): boolean {
  const from = fromType === "internet" ? null : place(fromType);
  const to = place(toType);
  createConnection(from ? from.id : "internet", to.id);
  return (from ?? S.internetNode).connections.includes(to.id);
}

describe("valid-edge table: allowed pairs", () => {
  const ALLOWED: Array<[ServiceType | "internet", ServiceType]> = [
    ["internet", "waf"],
    ["internet", "alb"],
    ["internet", "cdn"],
    ["internet", "apigw"],
    ["waf", "alb"],
    ["waf", "sqs"],
    ["waf", "apigw"],
    ["alb", "sqs"],
    ["sqs", "alb"],
    ["sqs", "compute"],
    ["alb", "compute"],
    ["compute", "cache"],
    ["compute", "db"],
    ["compute", "s3"],
    ["compute", "nosql"],
    ["compute", "search"],
    ["compute", "replica"],
    ["cache", "db"],
    ["cache", "s3"],
    ["cache", "nosql"],
    ["cache", "replica"],
    ["cdn", "s3"],
    ["apigw", "alb"],
    ["apigw", "sqs"],
    ["apigw", "compute"],
    ["replica", "db"],
    ["replica", "nosql"],
    ["alb", "serverless"],
    ["sqs", "serverless"],
    ["apigw", "serverless"],
    ["serverless", "db"],
    ["serverless", "cache"],
    ["serverless", "s3"],
    ["serverless", "replica"],
  ];
  it.each(ALLOWED)("%s -> %s is allowed", (a, b) => {
    expect(tryEdge(a, b)).toBe(true);
  });
});

describe("valid-edge table: rejected pairs", () => {
  const REJECTED: Array<[ServiceType | "internet", ServiceType]> = [
    ["db", "compute"],
    ["compute", "alb"],
    ["compute", "waf"],
    ["alb", "db"],
    ["waf", "db"],
    ["cache", "compute"],
    ["s3", "db"],
    ["cdn", "db"],
    ["replica", "s3"],
    ["serverless", "alb"],
    ["internet", "compute"],
    ["internet", "db"],
  ];
  it.each(REJECTED)("%s -> %s is rejected", (a, b) => {
    expect(tryEdge(a, b)).toBe(false);
  });

  it("self-connection is a no-op", () => {
    const alb = place("alb");
    expect(createConnection(alb.id, alb.id)).toEqual({ ok: false, reason: "self" });
    expect(alb.connections).toHaveLength(0);
  });

  it("a duplicate edge is not added twice", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    createConnection(alb.id, sqs.id);
    expect(createConnection(alb.id, sqs.id)).toEqual({ ok: false, reason: "exists" });
    expect(alb.connections.filter((c) => c === sqs.id)).toHaveLength(1);
    expect(S.connections).toHaveLength(1);
  });

  it("explains an invalid edge with both types", () => {
    const db = place("db");
    const compute = place("compute");
    expect(createConnection(db.id, compute.id)).toEqual({
      ok: false,
      reason: "invalid",
      fromType: "db",
      toType: "compute",
    });
  });

  it("refuses a wire to or from something that does not exist", () => {
    const alb = place("alb");
    expect(createConnection(alb.id, "svc_999")).toEqual({ ok: false, reason: "missing" });
    expect(createConnection("svc_999", alb.id)).toEqual({ ok: false, reason: "missing" });
  });
});

describe("the edge graph cannot loop", () => {
  it("is acyclic once the one legal two-way pair (alb, sqs) is set aside", () => {
    // 2-cycles are blocked at link time by the reverse-edge guard; longer loops
    // must be impossible by construction. A DFS over the type graph, ignoring
    // the sqs -> alb edge, must find no back edge.
    const state = new Map<string, 0 | 1 | 2>();
    const targets = (t: string): string[] =>
      validTargets(t).filter((to) => !(t === "sqs" && to === "alb"));
    const visit = (t: string): void => {
      expect(state.get(t), `cycle through ${t}`).not.toBe(1);
      if (state.get(t) === 2) return;
      state.set(t, 1);
      for (const to of targets(t)) visit(to);
      state.set(t, 2);
    };
    visit("internet");
    for (const t of SERVICE_TYPES) visit(t);
  });

  it("alb and sqs are the only pair valid in both directions", () => {
    const both: string[] = [];
    for (const a of SERVICE_TYPES) {
      for (const b of SERVICE_TYPES) {
        if (a < b && isValidEdge(a, b) && isValidEdge(b, a)) both.push(`${a}/${b}`);
      }
    }
    expect(both).toEqual(["alb/sqs"]);
  });

  it("monitoring and the substation are unwireable", () => {
    for (const t of ["monitor", "power"] as const) {
      expect(validTargets(t)).toEqual([]);
      expect(SERVICE_TYPES.filter((from) => isValidEdge(from, t))).toEqual([]);
      expect(isValidEdge("internet", t)).toBe(false);
    }
  });

  it("only the scheduler (a source) and the two unwireable nodes have no way in", () => {
    const hasInbound = new Set<string>();
    for (const from of ["internet", ...SERVICE_TYPES]) {
      for (const to of validTargets(from)) hasInbound.add(to);
    }
    const noInbound = SERVICE_TYPES.filter((t) => !hasInbound.has(t)).sort();
    expect(noInbound).toEqual(["monitor", "power", "scheduler"]);
  });
});

describe("reverse-edge block", () => {
  it("sqs -> alb is rejected when alb -> sqs already exists (request loop guard)", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    createConnection(alb.id, sqs.id);
    expect(createConnection(sqs.id, alb.id)).toEqual({ ok: false, reason: "reverse" });
    expect(alb.connections).toContain(sqs.id);
    expect(sqs.connections).not.toContain(alb.id);
  });

  it("alb -> sqs is rejected when sqs -> alb already exists", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    createConnection(sqs.id, alb.id);
    expect(createConnection(alb.id, sqs.id)).toEqual({ ok: false, reason: "reverse" });
    expect(sqs.connections).toContain(alb.id);
    expect(alb.connections).not.toContain(sqs.id);
  });
});

describe("linkTargets", () => {
  it("lists exactly the services a link could reach, by the same rule a click uses", () => {
    const alb = place("alb");
    const compute = place("compute");
    const db = place("db");
    const sqs = place("sqs");
    expect(linkTargets(alb.id)).toEqual(new Set([compute.id, sqs.id]));
    connect(alb, compute);
    expect(linkTargets(alb.id)).toEqual(new Set([sqs.id]));
    expect(linkTargets(compute.id)).toEqual(new Set([db.id]));
  });

  it("offers an Internet source its entry points", () => {
    const waf = place("waf");
    place("compute");
    expect(linkTargets("internet")).toEqual(new Set([waf.id]));
  });

  it("is empty for a source that does not exist", () => {
    expect(linkTargets("svc_999").size).toBe(0);
  });
});

describe("createService economics", () => {
  it("deducts the service cost and books it in the finances", () => {
    resetWorld({ money: 100 });
    const waf = place("waf"); // 40
    expect(waf.type).toBe("waf");
    expect(S.money).toBe(60);
    expect(S.finances.expenses.services).toBe(40);
    expect(S.finances.expenses.byService.waf).toBe(40);
    expect(S.finances.expenses.countByService.waf).toBe(1);
  });

  it("refuses placement when the money is short, and says so", () => {
    resetWorld({ money: CONFIG.services.db.cost - 1 });
    expect(createService("db", { x: 0, z: 40 })).toBeNull();
    expect(S.services).toHaveLength(0);
    expect(S.money).toBe(CONFIG.services.db.cost - 1);
    expect(S.events.some((e) => e.kind === "money-short")).toBe(true);
  });

  it("refuses placement on an occupied tile", () => {
    createService("waf", { x: 0, z: 48 });
    expect(createService("alb", { x: 0, z: 48 })).toBeNull();
    expect(S.services).toHaveLength(1);
    expect(S.services[0]?.type).toBe("waf");
  });

  it("names services with counters, so a replay refers to the same ids", () => {
    expect(place("waf").id).toBe("svc_1");
    expect(place("alb").id).toBe("svc_2");
  });

  it("announces a placement to the view", () => {
    const waf = place("waf");
    expect(S.events).toContainEqual({ kind: "service-placed", id: waf.id, type: "waf" });
  });
});

describe("deleteConnection and deleteObject", () => {
  it("deleteConnection removes the edge and returns true", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    connect(alb, sqs);
    expect(deleteConnection(alb.id, sqs.id)).toBe(true);
    expect(alb.connections).not.toContain(sqs.id);
    expect(S.connections).toHaveLength(0);
  });

  it("deleteConnection returns false for an edge that is not there", () => {
    const alb = place("alb");
    const sqs = place("sqs");
    expect(deleteConnection(alb.id, sqs.id)).toBe(false);
  });

  it("deleteObject refunds half the cost and unwires both sides", () => {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    const moneyBefore = S.money;

    expect(deleteObject(alb.id)).toBe(true);

    expect(S.money).toBe(moneyBefore + Math.floor(CONFIG.services.alb.cost / 2));
    expect(S.services.map((s) => s.id)).toEqual([compute.id]);
    expect(S.internetNode.connections).not.toContain(alb.id);
    expect(S.connections).toHaveLength(0);
  });

  it("the refund is booked as a reduction of what the hardware cost", () => {
    const db = place("db");
    deleteObject(db.id);
    const refund = Math.floor(CONFIG.services.db.cost / 2);
    expect(S.finances.expenses.services).toBe(CONFIG.services.db.cost - refund);
    expect(S.finances.expenses.byService.db).toBe(CONFIG.services.db.cost - refund);
    expect(S.finances.expenses.countByService.db).toBe(0);
  });

  it("returns false for a service that is not there", () => {
    expect(deleteObject("svc_999")).toBe(false);
  });

  it("removes queued, processing and in-flight requests without a reputation penalty", () => {
    const compute = place("compute");
    const queued = new Request("READ");
    const processing = new Request("READ");
    const inFlight = new Request("READ");
    S.requests.push(queued, processing, inFlight);
    compute.queue.push(queued);
    compute.processing.push({ req: processing, timer: 0 });
    inFlight.flyTo(compute);
    const repBefore = S.reputation;

    deleteObject(compute.id);

    expect(S.requests).toHaveLength(0);
    expect(S.reputation).toBe(repBefore);
    expect(S.failures.READ).toBe(0);
  });
});

describe("snapToGrid", () => {
  it("snaps x and z to the tile grid", () => {
    expect(snapToGrid({ x: 5, z: 7 })).toEqual({ x: 4, z: 8 });
  });

  it("rounds negative coordinates to the nearest tile", () => {
    expect(snapToGrid({ x: -5, z: -3 })).toEqual({ x: -4, z: -4 });
  });

  it("never returns negative zero", () => {
    const snapped = snapToGrid({ x: -0.4, z: -1 });
    expect(Object.is(snapped.x, 0)).toBe(true);
    expect(Object.is(snapped.z, 0)).toBe(true);
  });
});
