// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../config";
import { resetSim, S } from "../state";
import { getTrafficType, pickEntryNode, spawnRequest } from "../traffic";
import { connect, inject, place, resetWorld } from "./helpers";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-traffic" }));

describe("getTrafficType", () => {
  it("follows the mix: a single-class mix always draws that class", () => {
    S.trafficDistribution = { WRITE: 1 };
    for (let i = 0; i < 50; i++) expect(getTrafficType()).toBe("WRITE");
  });

  it("an all-zero mix is no traffic, not STATIC", () => {
    S.trafficDistribution = { STATIC: 0, READ: 0 };
    expect(getTrafficType()).toBe(null);
  });

  it("draws every class in proportion over many rolls", () => {
    S.trafficDistribution = { STATIC: 0.5, READ: 0.5 };
    const seen = { STATIC: 0, READ: 0 };
    for (let i = 0; i < 4000; i++) {
      const t = getTrafficType();
      if (t === "STATIC" || t === "READ") seen[t]++;
    }
    expect(seen.STATIC + seen.READ).toBe(4000);
    expect(Math.abs(seen.STATIC - 2000)).toBeLessThan(200);
  });

  it("is reproducible from the seed", () => {
    resetSim({ seed: "mix-a", mode: "survival" });
    const a = Array.from({ length: 30 }, () => getTrafficType());
    resetSim({ seed: "mix-a", mode: "survival" });
    const b = Array.from({ length: 30 }, () => getTrafficType());
    expect(b).toEqual(a);
    expect(S.trafficDistribution).toEqual(CONFIG.survival.trafficDistribution);
  });
});

describe("entry routing", () => {
  it("rotates across identical entries", () => {
    const a = place("waf");
    const b = place("waf");
    const picks = [0, 1, 2, 3].map(() => pickEntryNode([a, b], "waf")?.id);
    expect(picks).toEqual([a.id, b.id, a.id, b.id]);
  });

  it("skips a disabled entry", () => {
    const a = place("waf");
    const b = place("waf");
    a.isDisabled = true;
    for (let i = 0; i < 4; i++) expect(pickEntryNode([a, b], "waf")).toBe(b);
  });

  it("returns null when nothing of the type is live", () => {
    const a = place("waf");
    a.isDisabled = true;
    expect(pickEntryNode([a], "waf")).toBe(null);
    expect(pickEntryNode([], "any")).toBe(null);
  });

  it("STATIC prefers a CDN over a firewall; other classes go to the firewall", () => {
    const waf = place("waf");
    const cdn = place("cdn");
    connect("internet", waf);
    connect("internet", cdn);
    expect(inject("STATIC").target).toBe(cdn);
    expect(inject("READ").target).toBe(waf);
  });

  it("falls back to any live entry point", () => {
    const alb = place("alb");
    connect("internet", alb);
    expect(inject("READ").target).toBe(alb);
  });

  it("with nothing wired the request fails as it is born", () => {
    const req = inject("READ");
    expect(req.failed).toBe(true);
  });
});

describe("spawnRequest", () => {
  it("adds one request of a class from the mix", () => {
    S.trafficDistribution = { SEARCH: 1 };
    spawnRequest();
    expect(S.requests).toHaveLength(1);
    expect(S.requests[0]?.type).toBe("SEARCH");
  });
});
