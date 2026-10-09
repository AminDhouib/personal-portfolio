// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import { SERVICE_HANDLERS } from "../handlers";
import { Request } from "../request";
import { resetSim, S } from "../state";
import { connect, inject, place, resetWorld, run } from "./helpers";

// Pin every roll the sim makes so a test can force a cache hit or a miss.
const pin = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("../rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rng")>();
  return {
    ...real,
    rand: (stream: Parameters<typeof real.rand>[0]) => pin.value ?? real.rand(stream),
  };
});

beforeEach(() => {
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-handlers" });
});

describe("cache hit and miss", () => {
  function cacheWorld() {
    const alb = place("alb");
    const compute = place("compute");
    const cache = place("cache");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, cache);
    connect(cache, db);
    return { alb, compute, cache, db };
  }

  it("a hit (roll below the rate) finishes at the cache with the cached bonus", () => {
    cacheWorld();
    const moneyBefore = S.money;
    const req = inject("READ");
    pin.value = 0.0; // always a hit
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(req.cached).toBe(true);
    const bonus = 1 + CONFIG.survival.SCORE_POINTS.CACHE_HIT_BONUS;
    expect(S.money).toBeCloseTo(moneyBefore + CONFIG.trafficTypes.READ.reward * bonus, 5);
  });

  it("tells the view which cache served it", () => {
    const { cache } = cacheWorld();
    const req = inject("READ");
    pin.value = 0.0;
    run(10);
    expect(S.events).toContainEqual({ kind: "cache-hit", id: req.id, serviceId: cache.id });
  });

  it("a miss forwards to the db and finishes there, uncached", () => {
    const { db } = cacheWorld();
    const req = inject("READ");
    pin.value = 0.99; // always a miss
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(req.cached).toBe(false);
    expect(S.score.database).toBe(CONFIG.trafficTypes.READ.score);
    expect(db.connections).toEqual([]); // terminal
  });

  it("a WRITE reaching the cache is never a hit: it goes straight to the db", () => {
    const { cache } = cacheWorld();
    const req = new Request("WRITE");
    S.requests.push(req);
    req.flyTo(cache);
    pin.value = 0.0; // would be a hit if it rolled
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(req.cached).toBe(false);
  });

  it("compute does not route a non-cacheable WRITE via the cache: with no direct db it fails", () => {
    cacheWorld(); // compute -> cache -> db, but no compute -> db
    inject("WRITE");
    run(10);

    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.WRITE).toBe(1);
  });

  it("a cache on a miss prefers search for SEARCH, a replica for READ, nosql for the rest", () => {
    const alb = place("alb");
    const compute = place("compute");
    const cache = place("cache");
    const search = place("search");
    const replica = place("replica");
    const nosql = place("nosql");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, cache);
    for (const target of [search, replica, nosql, db]) connect(cache, target);
    connect(replica, db);

    pin.value = 0.99; // every roll misses
    const probe = (type: "SEARCH" | "READ" | "WRITE"): string | undefined => {
      const req = new Request(type);
      S.requests.push(req);
      req.flyTo(cache);
      run(0.9); // long enough to leave the cache, not long enough to leave the target
      return req.target?.type;
    };
    expect(probe("SEARCH")).toBe("search");
    expect(probe("READ")).toBe("replica");
    // WRITE never reaches a cache through compute, but the cache's own miss
    // path (used when it is wired in front of storage) still prefers nosql.
    expect(probe("WRITE")).toBe("nosql");
  });

  it("a cache wired to storage delivers STATIC either way round (cdn or s3)", () => {
    const alb = place("alb");
    const compute = place("compute");
    const cache = place("cache");
    const s3 = place("s3");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, cache);
    connect(cache, s3);
    pin.value = 0.99;
    inject("STATIC");
    run(10);
    expect(S.requestsProcessed).toBe(1);
    expect(S.score.storage).toBe(CONFIG.trafficTypes.STATIC.score);
  });
});

describe("cache tiers change the hit rate", () => {
  const TIERS = CONFIG.services.cache.tiers ?? [];
  const READ = CONFIG.trafficTypes.READ.cacheHitRate; // 0.4

  // Rolls one READ through a cache pinned at `quality` and reports whether it
  // was served from the cache. The world is rebuilt per roll.
  function rollRead(quality: number, roll: number): boolean {
    resetWorld();
    const alb = place("alb");
    const compute = place("compute");
    const cache = place("cache");
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, cache);
    connect(cache, db);
    cache.config = { ...cache.config, cacheHitRate: quality };
    const req = inject("READ");
    pin.value = roll;
    run(10);
    return req.cached;
  }

  it("tier 1 is exactly the traffic class's own rate", () => {
    const tier1 = TIERS[0]?.cacheHitRate ?? 0;
    expect(tier1).toBe(CONFIG.services.cache.cacheHitRate);
    expect(rollRead(tier1, READ - 0.01)).toBe(true);
    expect(rollRead(tier1, READ + 0.01)).toBe(false);
  });

  it("tier 3 serves a READ the tier-1 cache would have sent to the db", () => {
    // 0.6 misses at tier 1 (0.4) and hits at tier 3 (0.4 * 0.65 / 0.35 = 0.74).
    expect(rollRead(TIERS[0]?.cacheHitRate ?? 0, 0.6)).toBe(false);
    expect(rollRead(TIERS[2]?.cacheHitRate ?? 0, 0.6)).toBe(true);
  });

  it("tier 2 sits strictly between them", () => {
    const tier2 = TIERS[1]?.cacheHitRate ?? 0;
    expect(rollRead(tier2, 0.5)).toBe(true); // 0.57 > 0.5
    expect(rollRead(tier2, 0.6)).toBe(false); // 0.57 < 0.6
  });

  it("caps below certainty, so a tier-3 cache never retires the origin", () => {
    const alb = place("alb");
    const compute = place("compute");
    const cache = place("cache");
    const s3 = place("s3");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, cache);
    connect(cache, s3);
    cache.config = { ...cache.config, cacheHitRate: TIERS[2]?.cacheHitRate ?? 0 };
    const req = new Request("STATIC");
    S.requests.push(req);
    req.flyTo(cache);
    pin.value = 0.96; // above the 0.95 cap
    run(10);
    expect(req.cached).toBe(false);
  });

  it("no tier makes non-cacheable traffic cacheable", () => {
    const cache = place("cache");
    const db = place("db");
    connect(cache, db);
    cache.config = { ...cache.config, cacheHitRate: TIERS[2]?.cacheHitRate ?? 0 };
    const req = new Request("WRITE"); // cacheHitRate 0 and not cacheable
    S.requests.push(req);
    req.flyTo(cache);
    pin.value = 0.0; // would hit if it rolled
    run(10);
    expect(req.cached).toBe(false);
    expect(S.requestsProcessed).toBe(1); // forwarded to the db, not lost
  });
});

describe("cdn", () => {
  function cdnWorld(withOrigin = true) {
    const cdn = place("cdn");
    connect("internet", cdn);
    const s3 = place("s3");
    if (withOrigin) connect(cdn, s3);
    return { cdn, s3 };
  }

  it("a STATIC hit finishes at the edge", () => {
    const { cdn } = cdnWorld();
    const req = inject("STATIC");
    pin.value = 0.0;
    run(5);
    expect(req.cached).toBe(true);
    expect(S.requestsProcessed).toBe(1);
    expect(S.events).toContainEqual({ kind: "cache-hit", id: req.id, serviceId: cdn.id });
  });

  it("a STATIC miss goes on to the origin", () => {
    cdnWorld();
    const req = inject("STATIC");
    pin.value = 0.99;
    run(5);
    expect(req.cached).toBe(false);
    expect(S.requestsProcessed).toBe(1);
    expect(S.score.storage).toBe(CONFIG.trafficTypes.STATIC.score);
  });

  it("only STATIC is cached; anything else is forwarded whatever the roll", () => {
    const { cdn } = cdnWorld();
    const req = new Request("UPLOAD");
    S.requests.push(req);
    req.flyTo(cdn);
    pin.value = 0.0;
    run(5);
    expect(req.cached).toBe(false);
    expect(S.requestsProcessed).toBe(1);
  });

  it("a miss with nothing behind the edge fails as NO_ORIGIN", () => {
    cdnWorld(false);
    inject("STATIC");
    pin.value = 0.99;
    run(5);
    expect(S.failures.STATIC).toBe(1);
    expect(S.failuresByReason[FAIL_REASONS.NO_ORIGIN]).toBe(1);
  });
});

describe("compute routing preferences", () => {
  function computeWorld() {
    const alb = place("alb");
    const compute = place("compute");
    connect("internet", alb);
    connect(alb, compute);
    return compute;
  }

  it("SEARCH prefers a connected search engine over the sql db", () => {
    const compute = computeWorld();
    const db = place("db");
    const search = place("search");
    connect(compute, db);
    connect(compute, search);

    const req = inject("SEARCH");
    run(3); // SEARCH is the heaviest class: 2.5x the compute time

    expect(req.target?.type).toBe("search");
  });

  it("SEARCH against nosql-only storage fails (nosql cannot search)", () => {
    const compute = computeWorld();
    connect(compute, place("nosql"));

    inject("SEARCH");
    run(10);

    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.SEARCH).toBe(1);
  });

  it("READ prefers a replica, then nosql, then sql", () => {
    const compute = computeWorld();
    const db = place("db");
    const nosql = place("nosql");
    const replica = place("replica");
    connect(compute, db);
    connect(compute, nosql);
    connect(compute, replica);
    connect(replica, db);

    const req = inject("READ");
    run(2);
    expect(req.target?.type).toBe("replica");
  });

  it("a WRITE prefers nosql over sql, and never a replica", () => {
    const compute = computeWorld();
    const db = place("db");
    const nosql = place("nosql");
    const replica = place("replica");
    connect(compute, db);
    connect(compute, nosql);
    connect(compute, replica);
    connect(replica, db);

    const req = inject("WRITE");
    run(2.3);
    expect(req.target?.type).toBe("nosql");
  });

  it("STATIC is delivered by a compute wired to s3 though its destination is cdn", () => {
    const compute = computeWorld();
    connect(compute, place("s3"));

    inject("STATIC");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.score.storage).toBe(CONFIG.trafficTypes.STATIC.score);
  });

  it("a loaded cache loses a READ to a replica", () => {
    const compute = computeWorld();
    const cache = place("cache");
    const replica = place("replica");
    const db = place("db");
    connect(compute, cache);
    connect(compute, replica);
    connect(cache, db);
    connect(replica, db);
    // Load the cache past 60%: jobs in hand over twice its capacity.
    const filler = new Request("READ");
    cache.processing = Array.from({ length: Math.ceil(cache.config.capacity * 1.3) }, () => ({
      req: filler,
      timer: -1e12,
    }));
    expect(cache.totalLoad).toBeGreaterThan(0.6);

    const req = inject("READ");
    run(2);
    expect(req.target?.type).toBe("replica");
  });

  it("a cache wired only to the db does not swallow STATIC bound for storage", () => {
    const compute = computeWorld();
    const cache = place("cache");
    const db = place("db");
    const s3 = place("s3");
    connect(compute, cache);
    connect(cache, db);
    connect(compute, s3);

    pin.value = 0.99;
    inject("STATIC");
    run(10);
    expect(S.requestsProcessed).toBe(1);
    expect(S.score.storage).toBe(CONFIG.trafficTypes.STATIC.score);
  });
});

describe("terminal stores refuse the wrong traffic", () => {
  it("a db fails storage traffic as WRONG_STORE", () => {
    const db = place("db");
    const req = new Request("UPLOAD");
    S.requests.push(req);
    req.flyTo(db);
    run(2);
    expect(S.failuresByReason[FAIL_REASONS.WRONG_STORE]).toBe(1);
    expect(S.failures.UPLOAD).toBe(1);
  });

  it("s3 fails database traffic as WRONG_STORE", () => {
    const s3 = place("s3");
    const req = new Request("READ");
    S.requests.push(req);
    req.flyTo(s3);
    run(2);
    expect(S.failuresByReason[FAIL_REASONS.WRONG_STORE]).toBe(1);
  });
});

describe("generic forwarding", () => {
  it("an alb round-robins across its routable targets", () => {
    const alb = place("alb");
    const a = place("compute");
    const b = place("compute");
    connect("internet", alb);
    connect(alb, a);
    connect(alb, b);

    const first = inject("READ");
    const second = inject("READ");
    const third = inject("READ");
    run(1.5);
    expect([first.target, second.target, third.target]).toEqual([a, b, a]);
  });

  it("skips a disabled target for a live one", () => {
    const alb = place("alb");
    const a = place("compute");
    const b = place("compute");
    connect("internet", alb);
    connect(alb, a);
    connect(alb, b);
    a.isDisabled = true;

    const req = inject("READ");
    run(1.5);
    expect(req.target).toBe(b);
  });

  it("never forwards to a dead-letter queue", () => {
    const alb = place("alb");
    const dlq = place("dlq");
    connect("internet", alb);
    connect(alb, dlq);
    inject("READ");
    run(1.5);
    expect(S.failuresByReason[FAIL_REASONS.NO_ROUTE]).toBe(1);
    expect(dlq.queue).toHaveLength(0);
  });

  it("a service type with no handler of its own falls back to forwarding", () => {
    expect(SERVICE_HANDLERS.auth).toBeUndefined();
    const auth = place("auth");
    const compute = place("compute");
    connect("internet", auth);
    connect(auth, compute);
    const req = inject("READ");
    run(3);
    expect(req.target).toBe(compute);
  });
});

describe("container and serverless route like compute", () => {
  it("a container weights its processing time by the traffic class, like compute", () => {
    expect(SERVICE_HANDLERS.container).toBe(SERVICE_HANDLERS.compute);
    expect(SERVICE_HANDLERS.serverless).toBe(SERVICE_HANDLERS.compute);
  });

  it("an UPLOAD takes longer than a STATIC on the same compute", () => {
    const timeToFinish = (type: "STATIC" | "UPLOAD"): number => {
      resetWorld();
      const alb = place("alb");
      const compute = place("compute");
      const s3 = place("s3");
      connect("internet", alb);
      connect(alb, compute);
      connect(compute, s3);
      const req = inject(type);
      let seconds = 0;
      while (!S.requestsProcessed && seconds < 20) {
        run(0.05);
        seconds += 0.05;
      }
      expect(req.failed).toBe(false);
      return seconds;
    };
    expect(timeToFinish("UPLOAD")).toBeGreaterThan(timeToFinish("STATIC"));
  });
});
