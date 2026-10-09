// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatch } from "../../sim/action-log";
import { CONFIG, type ServiceType } from "../../sim/config";
import { resetSim, S } from "../../sim/state";
import { step } from "../../sim/tick";
import { stateHash } from "../../sim/hash";
import { resetWorld } from "../../sim/__tests__/helpers";
import { captureSave, loadSave } from "../save";
import {
  buildShareUrl,
  captureBlueprint,
  extractArchParam,
  importArchParam,
  rebuildBlueprint,
  shareUrl,
  TOO_LARGE_MESSAGE,
} from "../blueprint";
import {
  ARCH_VERSION,
  decodeArchParam,
  encodeArchParam,
  MAX_CONNECTIONS,
  MAX_PARAM_LENGTH,
  MAX_SERVICES,
  MAX_URL_LENGTH,
} from "../blueprint-schema";

// The ?arch= wire format is Server Survival's v1, kept byte for byte so its links open
// here. The cases below are its share.test.mjs, carried over: the decoder is the
// single gate for hostile payloads, and the rebuild goes only through dispatch so the
// placement rules, the edge allowlist and the reverse-edge guard apply a second time.

const BASE = "https://example.test/games/failover";

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-blueprint" }));

function placeAt(type: ServiceType, x: number, z: number): string {
  const before = S.services.length;
  expect(dispatch({ op: 0, type, x, z })).toEqual({ ok: true });
  expect(S.services.length).toBe(before + 1);
  const placed = S.services[S.services.length - 1];
  if (!placed) throw new Error("nothing placed");
  return placed.id;
}

function link(from: string, to: string): void {
  dispatch({ op: 1, from, to });
}

/** The param string exactly as a link would carry it. */
function currentParam(): string {
  const out = buildShareUrl(BASE);
  if (!out.ok) throw new Error("build is too large to share");
  return out.url.split("?arch=")[1] ?? "";
}

const b64url = (text: string): string => Buffer.from(text).toString("base64url");
const payload = (obj: unknown): string => b64url(JSON.stringify(obj));

/** internet -> waf -> alb -> compute -> db */
function buildPipeline(): void {
  const waf = placeAt("waf", -16, 0);
  const alb = placeAt("alb", -8, 0);
  const compute = placeAt("compute", 0, 4);
  const db = placeAt("db", 8, -4);
  link("internet", waf);
  link(waf, alb);
  link(alb, compute);
  link(compute, db);
}

describe("the v1 wire format", () => {
  it("is the compact JSON {v,b,t,p,c,i} as unpadded base64url", () => {
    S.sandboxBudget = 3456;
    buildPipeline();
    const json = `{"v":1,"b":3456,"t":["waf","alb","compute","db"],"p":[-16,0,-8,0,0,4,8,-4],"c":[0,1,1,2,2,3],"i":[0]}`;
    expect(currentParam()).toBe(b64url(json));
    expect(currentParam()).not.toMatch(/[+/=]/);
    expect(captureBlueprint()).toEqual(JSON.parse(json));
  });

  it("carries the upstream caps", () => {
    expect([ARCH_VERSION, MAX_SERVICES, MAX_CONNECTIONS, MAX_URL_LENGTH, MAX_PARAM_LENGTH]).toEqual(
      [1, 60, 240, 2000, 4096],
    );
  });

  it("sorts power first and remaps every index to match", () => {
    const alb = placeAt("alb", 0, 0);
    const power = placeAt("power", 8, 0);
    const compute = placeAt("compute", 16, 0);
    link("internet", alb);
    link(alb, compute);
    expect(power).toBe("svc_2");
    const wire = captureBlueprint();
    expect(wire.t).toEqual(["power", "alb", "compute"]);
    expect(wire.p).toEqual([8, 0, 0, 0, 16, 0]);
    expect(wire.c).toEqual([1, 2]);
    expect(wire.i).toEqual([1]);
  });

  it("encodes a hand-built wire object the same way", () => {
    const wire = { v: 1, b: 10, t: ["waf"], p: [0, 0], c: [], i: [0] } as const;
    expect(encodeArchParam(wire)).toBe(b64url(JSON.stringify(wire)));
  });
});

describe("encode and decode round trip", () => {
  it("preserves service types and positions", () => {
    buildPipeline();
    const arch = decodeArchParam(currentParam());
    expect(arch).not.toBeNull();
    expect(arch?.services.map((s) => s?.type)).toEqual(["waf", "alb", "compute", "db"]);
    expect(arch?.services.map((s) => [s?.x, s?.z])).toEqual([
      [-16, 0],
      [-8, 0],
      [0, 4],
      [8, -4],
    ]);
    expect(arch?.dropped).toBe(0);
  });

  it("preserves connections and the internet edges as indices", () => {
    buildPipeline();
    const arch = decodeArchParam(currentParam());
    expect(arch?.internet).toEqual([0]);
    expect(arch?.connections).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it("preserves the sandbox budget", () => {
    S.sandboxBudget = 3456;
    buildPipeline();
    expect(decodeArchParam(currentParam())?.budget).toBe(3456);
  });

  it("rebuilds the identical topology through dispatch", () => {
    S.sandboxBudget = 3456;
    buildPipeline();
    const arch = decodeArchParam(currentParam());
    const totalCost =
      CONFIG.services.waf.cost +
      CONFIG.services.alb.cost +
      CONFIG.services.compute.cost +
      CONFIG.services.db.cost;
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "shared-1");

    expect(S.gameMode).toBe("sandbox");
    expect(S.services.map((s) => s.type)).toEqual(["waf", "alb", "compute", "db"]);
    expect(S.services.map((s) => [s.position.x, s.position.z])).toEqual([
      [-16, 0],
      [-8, 0],
      [0, 4],
      [8, -4],
    ]);
    expect(S.internetNode.connections).toEqual([S.services[0]?.id]);
    expect(S.connections).toHaveLength(4);
    expect(S.sandboxBudget).toBe(3456);
    expect(S.money).toBe(3456 - totalCost);
  });

  it("rebuilds a board that plays the same as the one it came from", () => {
    S.sandboxBudget = 100_000;
    buildPipeline();
    const arch = decodeArchParam(currentParam());
    if (!arch) throw new Error("decode failed");

    resetSim({ seed: "twin", mode: "sandbox", budget: 100_000 });
    buildPipeline();
    step(400);
    const original = stateHash();

    rebuildBlueprint(arch, "twin");
    step(400);
    expect(stateHash()).toBe(original);
  });

  it("keeps the URL under 2000 chars for a 50-service build", () => {
    const types: ServiceType[] = [
      "waf",
      "alb",
      "alb",
      ...Array<ServiceType>(17).fill("compute"),
      ...Array<ServiceType>(10).fill("cache"),
      ...Array<ServiceType>(10).fill("db"),
      ...Array<ServiceType>(10).fill("s3"),
    ];
    const ids = types.map((type, i) =>
      placeAt(type, (i % 15) * 4 - 28, Math.floor(i / 15) * 4 - 20),
    );
    const at = (i: number): string => ids[i] ?? "";
    link("internet", at(0));
    link(at(0), at(1));
    link(at(0), at(2));
    for (let i = 3; i < 20; i++) {
      link(at(i % 2 === 0 ? 1 : 2), at(i)); // alb -> compute
      link(at(i), at(i + 17)); // compute -> cache/db/s3-ish
    }
    expect(S.connections.length).toBeGreaterThan(30);

    const out = buildShareUrl(BASE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.url.length).toBeLessThan(2000);

    const arch = decodeArchParam(out.url.split("?arch=")[1]);
    expect(arch?.services).toHaveLength(50);
    expect((arch?.connections.length ?? 0) + (arch?.internet.length ?? 0)).toBe(
      S.connections.length,
    );
  });
});

describe("too large to share", () => {
  const bigWire = () => {
    const wire = {
      v: 1 as const,
      b: 2000,
      t: Array.from({ length: MAX_SERVICES }, () => "compute"),
      p: Array.from({ length: MAX_SERVICES * 2 }, (_, k) => 4 * k - 100),
      c: [] as number[],
      i: [] as number[],
    };
    for (let k = 0; k < MAX_CONNECTIONS; k++) wire.c.push(k % 60, (k * 7 + 1) % 60);
    return wire;
  };

  it("reports it instead of building a link over 2000 characters", () => {
    expect(shareUrl(BASE, bigWire())).toEqual({ ok: false, reason: TOO_LARGE_MESSAGE });
    expect(TOO_LARGE_MESSAGE).toBe("too large to share");
  });

  it("allows a link of exactly 2000 characters and refuses 2001", () => {
    const wire = { v: 1 as const, b: 5, t: ["waf"], p: [0, 0], c: [], i: [0] };
    const suffix = `?arch=${encodeArchParam(wire)}`;
    const fits = shareUrl("x".repeat(MAX_URL_LENGTH - suffix.length), wire);
    expect(fits.ok).toBe(true);
    expect(fits.ok && fits.url.length).toBe(MAX_URL_LENGTH);
    expect(shareUrl("x".repeat(MAX_URL_LENGTH - suffix.length + 1), wire)).toEqual({
      ok: false,
      reason: TOO_LARGE_MESSAGE,
    });
  });

  it("builds from the live board by default", () => {
    buildPipeline();
    const out = buildShareUrl(BASE);
    expect(out.ok && out.url.startsWith(`${BASE}?arch=`)).toBe(true);
  });
});

describe("hostile and malformed input", () => {
  it("drops an unknown service type but keeps the valid ones", () => {
    const arch = decodeArchParam(
      payload({
        v: 1,
        b: 1000,
        t: ["waf", "totally-not-a-service", "alb"],
        p: [0, 0, 8, 0, 16, 0],
        c: [],
        i: [0],
      }),
    );
    expect(arch?.services[0]?.type).toBe("waf");
    expect(arch?.services[1]).toBeNull();
    expect(arch?.services[2]?.type).toBe("alb");
    expect(arch?.dropped).toBe(1);
  });

  it("drops an Object.prototype key posing as a service type", () => {
    for (const type of ["toString", "__proto__", "constructor", "hasOwnProperty", "valueOf"]) {
      const arch = decodeArchParam(payload({ v: 1, b: 1000, t: [type], p: [0, 0], c: [], i: [] }));
      expect(arch?.services, type).toEqual([null]);
    }
  });

  it("drops non-finite and non-numeric positions", () => {
    // 1e999 survives JSON.parse as Infinity; a string coordinate is a type lie.
    const raw = b64url('{"v":1,"b":100,"t":["waf","alb"],"p":[1e999,0,"8",0],"c":[],"i":[]}');
    expect(decodeArchParam(raw)?.services).toEqual([null, null]);
  });

  it("drops positions outside the grid, including 1e300", () => {
    const bound = CONFIG.gridSize * CONFIG.tileSize;
    const arch = decodeArchParam(
      payload({
        v: 1,
        b: 100,
        t: ["waf", "alb", "s3"],
        p: [bound + 1, 0, -8, 0, 1e300, -1e300],
        c: [],
        i: [],
      }),
    );
    expect(arch?.services[0]).toBeNull();
    expect(arch?.services[1]).not.toBeNull();
    expect(arch?.services[2]).toBeNull();
  });

  it("rejects an oversized raw param outright", () => {
    expect(decodeArchParam("A".repeat(5000))).toBeNull();
  });

  it("rejects malformed base64 without throwing", () => {
    expect(decodeArchParam("%%%not-base64%%%")).toBeNull();
    expect(decodeArchParam("a")).toBeNull();
    expect(decodeArchParam("")).toBeNull();
  });

  it("rejects valid base64 of non-JSON without throwing", () => {
    expect(decodeArchParam(b64url("hello world"))).toBeNull();
  });

  it("rejects non-string input without throwing", () => {
    for (const raw of [undefined, null, 0, 42, {}, [], ["x"], true, Symbol("x")]) {
      expect(decodeArchParam(raw)).toBeNull();
    }
  });

  it("rejects JSON that is not a v1 architecture object", () => {
    expect(decodeArchParam(b64url("42"))).toBeNull();
    expect(decodeArchParam(b64url("null"))).toBeNull();
    expect(decodeArchParam(payload({ v: 2, b: 1, t: [], p: [], c: [], i: [] }))).toBeNull();
    expect(decodeArchParam(payload({ v: "1", b: 1, t: [], p: [], c: [], i: [] }))).toBeNull();
    expect(decodeArchParam(payload({ v: 1, b: 1, t: "waf", p: [], c: [], i: [] }))).toBeNull();
    expect(decodeArchParam(payload({ v: 1, b: 1, t: [], p: {}, c: [], i: [] }))).toBeNull();
    expect(decodeArchParam(payload({ v: 1, b: 1, t: [], p: [], c: [], i: "0" }))).toBeNull();
  });

  it("enforces the service-count cap", () => {
    const over = MAX_SERVICES + 1;
    expect(
      decodeArchParam(
        payload({
          v: 1,
          b: 100,
          t: Array(over).fill("waf"),
          p: Array(over * 2).fill(0),
          c: [],
          i: [],
        }),
      ),
    ).toBeNull();
  });

  it("ignores a 5000-service payload", () => {
    const t = Array.from({ length: 5000 }, () => "waf");
    const p = Array.from({ length: 10_000 }, () => 0);
    expect(decodeArchParam(payload({ v: 1, b: 100, t, p, c: [], i: [] }))).toBeNull();
    expect(importArchParam(payload({ v: 1, b: 100, t, p, c: [], i: [] }), "x")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("enforces the connection-count cap and pair alignment", () => {
    const base = { v: 1, b: 100, t: ["waf", "alb"], p: [0, 0, 8, 0], i: [] };
    expect(decodeArchParam(payload({ ...base, c: Array(482).fill(0) }))).toBeNull();
    expect(decodeArchParam(payload({ ...base, c: [0, 1, 0] }))).toBeNull(); // odd length
  });

  it("enforces the internet-edge cap", () => {
    const base = { v: 1, b: 100, t: ["waf"], p: [0, 0], c: [] };
    expect(decodeArchParam(payload({ ...base, i: Array(61).fill(0) }))).toBeNull();
  });

  it("clamps or defaults a bogus budget instead of trusting it", () => {
    const base = { v: 1, t: [], p: [], c: [], i: [] };
    expect(decodeArchParam(payload({ ...base }))?.budget).toBe(CONFIG.sandbox.defaultBudget);
    expect(decodeArchParam(payload({ ...base, b: "9999" }))?.budget).toBe(
      CONFIG.sandbox.defaultBudget,
    );
    expect(decodeArchParam(payload({ ...base, b: null }))?.budget).toBe(
      CONFIG.sandbox.defaultBudget,
    );
    expect(decodeArchParam(payload({ ...base, b: -50 }))?.budget).toBe(0);
    expect(decodeArchParam(payload({ ...base, b: 1e12 }))?.budget).toBe(1_000_000);
    expect(decodeArchParam(payload({ ...base, b: 1e300 }))?.budget).toBe(1_000_000);
    expect(decodeArchParam(payload({ ...base, b: 12.6 }))?.budget).toBe(13);
  });

  it("drops connection indices that are out of range or self-referential", () => {
    const arch = decodeArchParam(
      payload({
        v: 1,
        b: 100,
        t: ["waf", "alb"],
        p: [0, 0, 8, 0],
        c: [0, 7, -1, 1, 0, 0, 1.5, 1, 0, 1],
        i: [9],
      }),
    );
    expect(arch?.connections).toEqual([[0, 1]]); // only the legal waf -> alb pair
    expect(arch?.internet).toEqual([]);
  });

  it("does not pollute Object.prototype from a __proto__ payload", () => {
    const raw = b64url(`{"__proto__":{"polluted":true},"v":1,"b":1,"t":[],"p":[],"c":[],"i":[]}`);
    decodeArchParam(raw);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("rebuild security (allowlist and guards)", () => {
  it("silently refuses an injected illegal edge like db -> waf", () => {
    const arch = decodeArchParam(
      payload({ v: 1, b: 1000, t: ["db", "waf"], p: [0, 0, 8, 0], c: [0, 1], i: [] }),
    );
    expect(arch?.connections).toEqual([]); // filtered against the same allowlist
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "s");
    expect(S.services).toHaveLength(2); // the services themselves are fine
    expect(S.connections).toHaveLength(0);
  });

  it("refuses an illegal internet edge (internet -> db)", () => {
    const arch = decodeArchParam(payload({ v: 1, b: 1000, t: ["db"], p: [0, 0], c: [], i: [0] }));
    expect(arch?.internet).toEqual([]);
    if (!arch) throw new Error("decode failed");
    rebuildBlueprint(arch, "s");
    expect(S.internetNode.connections).toEqual([]);
  });

  it("keeps the reverse-edge guard: an injected ALB/SQS pair cannot form a cycle", () => {
    const arch = decodeArchParam(
      payload({ v: 1, b: 1000, t: ["alb", "sqs"], p: [0, 0, 8, 0], c: [0, 1, 1, 0], i: [0] }),
    );
    expect(arch?.connections).toHaveLength(2); // decode cannot know: the state guard's job
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "s");
    const [alb, sqs] = S.services;
    expect(alb?.connections).toEqual([sqs?.id]);
    expect(sqs?.connections).toEqual([]); // reverse edge refused, so no loop
    expect(S.connections).toHaveLength(2); // internet -> alb, alb -> sqs
  });

  it("charges the shared build against the shared budget, floored at zero", () => {
    const cost = CONFIG.services.waf.cost + CONFIG.services.alb.cost;
    const arch = decodeArchParam(
      payload({ v: 1, b: 500, t: ["waf", "alb"], p: [0, 0, 8, 0], c: [0, 1], i: [0] }),
    );
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "s");
    expect(S.services).toHaveLength(2);
    expect(S.sandboxBudget).toBe(500);
    expect(S.money).toBe(500 - cost);

    // A budget smaller than the build still places everything: money bottoms out
    // instead of silently truncating the shared architecture.
    const small = decodeArchParam(
      payload({ v: 1, b: 10, t: ["waf", "alb"], p: [0, 0, 8, 0], c: [0, 1], i: [0] }),
    );
    if (!small) throw new Error("decode failed");
    rebuildBlueprint(small, "s");
    expect(S.services).toHaveLength(2);
    expect(S.money).toBe(0);
    // The link's own budget survives, so re-sharing emits it unchanged (as upstream does).
    expect(S.sandboxBudget).toBe(10);
    expect(captureBlueprint().b).toBe(10);
    expect(S.startBudget).toBe(cost);
  });

  it("counts a repeated Internet edge as unlinked", () => {
    const arch = decodeArchParam(
      payload({ v: 1, b: 1000, t: ["waf"], p: [0, 0], c: [], i: [0, 0, 0] }),
    );
    expect(arch?.internet).toEqual([0, 0, 0]);
    if (!arch) throw new Error("decode failed");
    expect(rebuildBlueprint(arch, "s")).toMatchObject({ linked: 1, unlinked: 2 });
    expect(S.internetNode.connections).toHaveLength(1);
  });

  it("survives two services claiming the same tile (placement refuses the second)", () => {
    const arch = decodeArchParam(
      payload({
        v: 1,
        b: 1000,
        t: ["waf", "waf", "alb"],
        p: [0, 0, 0, 0, 8, 0],
        c: [0, 2, 1, 2],
        i: [0, 1],
      }),
    );
    if (!arch) throw new Error("decode failed");

    const result = rebuildBlueprint(arch, "s");
    expect(S.services.map((s) => s.type)).toEqual(["waf", "alb"]);
    expect(S.internetNode.connections).toHaveLength(1);
    // The dropped duplicate's edges vanish with it: only waf[0] -> alb remains.
    expect(S.connections).toHaveLength(2);
    expect(result).toMatchObject({ placed: 2, skipped: 1 });
  });

  it("applies the board rules a second time: a service past the board edge is refused", () => {
    // Inside the decoder's slack (one grid width) but off the board.
    const arch = decodeArchParam(
      payload({ v: 1, b: 1000, t: ["waf", "alb"], p: [100, 0, 8, 0], c: [0, 1], i: [0, 1] }),
    );
    expect(arch?.services[0]).not.toBeNull();
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "s");
    expect(S.services.map((s) => s.type)).toEqual(["alb"]);
    // The offboard waf took its edges with it; the alb keeps its own Internet edge.
    expect(S.connections).toEqual([{ from: "internet", to: "svc_1" }]);
  });

  it("builds a fresh sandbox: the old board, log and mode are gone", () => {
    resetSim({ seed: "old", mode: "survival" });
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    const arch = decodeArchParam(payload({ v: 1, b: 700, t: ["alb"], p: [8, 0], c: [], i: [] }));
    if (!arch) throw new Error("decode failed");

    rebuildBlueprint(arch, "fresh");
    expect(S.gameMode).toBe("sandbox");
    expect(S.seed).toBe("fresh");
    expect(S.tick).toBe(0);
    expect(S.services.map((s) => s.type)).toEqual(["alb"]);
    // The build is in the log, so a save of it replays to the same board.
    expect(S.log).toHaveLength(1);
    expect(S.logOverflow).toBe(false);
  });
});

describe("importArchParam", () => {
  it("decodes and rebuilds a good param", () => {
    buildPipeline();
    const param = currentParam();
    const out = importArchParam(param, "imp");
    expect(out.ok).toBe(true);
    expect(S.services).toHaveLength(4);
    expect(S.seed).toBe("imp");
  });

  it("leaves the running sim alone for a bad param", () => {
    resetSim({ seed: "live", mode: "survival" });
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    const before = stateHash();
    for (const raw of ["%%%", "", payload({ v: 9 }), null, undefined]) {
      expect(importArchParam(raw, "imp")).toEqual({ ok: false, reason: "invalid" });
    }
    expect(S.seed).toBe("live");
    expect(stateHash()).toBe(before);
  });
});

describe("extractArchParam", () => {
  it("takes arch out of a query string and keeps the rest", () => {
    expect(extractArchParam("?arch=abc&utm=1")).toEqual({ raw: "abc", rest: "utm=1" });
    expect(extractArchParam("?a=1&arch=abc")).toEqual({ raw: "abc", rest: "a=1" });
    expect(extractArchParam("?arch=abc")).toEqual({ raw: "abc", rest: "" });
  });

  it("reports nothing when there is no arch", () => {
    expect(extractArchParam("")).toEqual({ raw: null, rest: "" });
    expect(extractArchParam("?utm=1")).toEqual({ raw: null, rest: "utm=1" });
  });
});

describe("a shared build saves and loads", () => {
  it("replays an imported blueprint to the same board, budget and all", async () => {
    // 10 is below the build's cost, so the rebuild raises the budget; the save must carry that.
    const raw = payload({ v: 1, b: 10, t: ["waf", "alb"], p: [0, 0, 8, 0], c: [0, 1], i: [0] });
    expect(importArchParam(raw, "imported").ok).toBe(true);
    step(200);
    const live = stateHash();
    const saved = captureSave(1_760_000_000_000);
    if (!saved.ok) throw new Error(`capture failed: ${saved.reason}`);

    resetSim({ seed: "elsewhere" });
    expect((await loadSave(saved.save)).ok).toBe(true);
    expect(S.services.map((s) => s.type)).toEqual(["waf", "alb"]);
    expect(stateHash()).toBe(live);
  });
});
