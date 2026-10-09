// @vitest-environment node
// Sandbox archetypes, batch 2: Container Cluster, Stream, GeoDNS, Data Warehouse,
// the "complex" set. Every archetype gets (a) a distinguishable-behavior test
// proving it does something no existing service does, and (b) a termination test
// proving the cardinal invariant: in-flight drains to 0 after traffic stops, every
// request finishes, fails or is removed exactly once. Plus Stream ordering,
// partition independence and drain, DNS multi-stack distribution, Warehouse
// READ-rejection and WRITE-accept, connection-validity (anti-cycle) checks, and a
// combined leak battery over all four wired together with batch 1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, type ServiceType, type TrafficType } from "../config";
import { process as dnsProcess } from "../handlers/dns";
import { Request } from "../request";
import type { Service } from "../service";
import { resetSim, S } from "../state";
import {
  connect,
  expectDrained,
  inject,
  injectTo,
  place,
  resetWorld,
  run,
  totalFailures,
} from "./helpers";
import { pin } from "./rng-pin";

vi.mock("../rng", async (orig) =>
  (await import("./rng-pin")).withPin(await orig<typeof import("../rng")>()),
);

beforeEach(() => {
  pin.value = null;
  resetWorld();
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-archetypes2" });
});

// A failed request lingers a moment for the view before it is removed.
function flushRemovals(): void {
  run(1);
}

// One frame that updates every service EXCEPT the excluded ones, then all
// requests. Lets a test keep a "saturated consumer" permanently full (never ticked,
// so its queue never drains) while the rest of the world runs.
function stepExcept(dt: number, exclude: Service[]): void {
  for (const s of S.services) if (!exclude.includes(s)) s.update(dt);
  for (const r of S.requests.slice()) r.update(dt);
}

function heldInPartitions(stream: Service): number {
  return stream.partitions.reduce((n, p) => n + p.length, 0);
}

// ============================== CONTAINER CLUSTER ==============================
describe("Container Cluster", () => {
  it("DISTINGUISHABLE: dense fixed capacity at a FLAT fee: the anti-twin of Serverless's per-request price", () => {
    const c = CONFIG.services.container;
    // Denser than a Tier-1 Compute...
    expect(c.capacity).toBeGreaterThan(CONFIG.services.compute.capacity);
    // ...at a flat fee: NO per-request charge (Serverless has one).
    expect(c.perRequestCost).toBeUndefined();
    expect(CONFIG.services.serverless.perRequestCost).toBeGreaterThan(0);
    // A real cluster costs more up front and to run than a single Compute.
    expect(c.cost).toBeGreaterThan(CONFIG.services.compute.cost);
    expect(c.upkeep).toBeGreaterThan(CONFIG.services.compute.upkeep);
  });

  it("processes traffic exactly like Compute (same handler): routes a READ through to the DB", () => {
    const alb = place("alb");
    const container = place("container");
    const db = place("db");
    connect("internet", alb);
    connect(alb, container);
    connect(container, db);
    pin.value = 0.99;
    inject("READ");
    run(10);

    expect(S.requestsProcessed).toBe(1);
    expect(S.requests).toHaveLength(0); // TERMINATION
  });

  it("TERMINATION: a mixed burst drains to zero after traffic stops (no leak)", () => {
    const alb = place("alb");
    const container = place("container");
    const db = place("db");
    const s3 = place("s3");
    connect("internet", alb);
    connect(alb, container);
    connect(container, db);
    connect(container, s3);
    pin.value = 0.99;

    for (let t = 0; t < 40; t++) {
      if (t % 2 === 0) inject("READ");
      if (t % 3 === 0) inject("WRITE");
      if (t % 5 === 0) inject("STATIC");
      run(0.1);
    }
    run(40);
    flushRemovals();

    expect(S.requests).toHaveLength(0);
    expectDrained();
  });

  it("its higher base capacity absorbs a burst that saturates a Tier-1 Compute (fewer overflow drops)", () => {
    const build = (nodeType: ServiceType) => {
      resetWorld();
      const alb = place("alb");
      const node = place(nodeType);
      const db = place("db");
      connect("internet", alb);
      connect(alb, node);
      connect(node, db);
      pin.value = 0.99;
      for (let i = 0; i < 40; i++) inject("READ"); // instant burst
      run(30);
      const drops = totalFailures();
      pin.value = null;
      return { processed: S.requestsProcessed, drops };
    };
    const container = build("container");
    const compute = build("compute");
    expect(container.processed).toBeGreaterThan(compute.processed);
    expect(container.drops).toBeLessThan(compute.drops);
  });
});

// ================================== STREAM ==================================
describe("Stream", () => {
  // Push records straight into a stream's arrival queue with a stable sequence,
  // bypassing flight so the ingress order is deterministic for the test.
  const seqOf = new Map<Request, number>();
  function pushSeq(stream: Service, n: number, type: TrafficType = "WRITE"): Request[] {
    seqOf.clear();
    const reqs: Request[] = [];
    for (let i = 0; i < n; i++) {
      const r = new Request(type);
      seqOf.set(r, i);
      S.requests.push(r);
      stream.queue.push(r);
      reqs.push(r);
    }
    return reqs;
  }

  // Fill a node's queue to its cap so canAccept() is false (saturated but still
  // routable: the "blocked consumer" of a partition).
  function saturate(node: Service): void {
    const cap = node.config.maxQueueSize ?? 20;
    while (node.queue.length < cap) node.queue.push(new Request("WRITE"));
  }

  it("DISTINGUISHABLE: within a partition, records stay in strict FIFO order (only Stream models this)", () => {
    const stream = place("stream");
    const sink = place("s3");
    connect(stream, sink);
    saturate(sink); // nothing can forward: records pile up in partitions

    pushSeq(stream, 9);
    // Tick ONLY the stream (never the saturated sink) so it stays blocked.
    for (let i = 0; i < 10; i++) stream.update(0.2);

    // Every record landed in a partition, and each partition is ascending by
    // arrival sequence: strict per-partition order, nothing overtook.
    expect(heldInPartitions(stream)).toBe(9);
    for (const part of stream.partitions) {
      const seqs = part.map((r) => seqOf.get(r) ?? -1);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
    expect(S.requestsProcessed).toBe(0); // truly blocked
  });

  it("head-of-line blocking: a stuck head holds the records behind it (they do NOT skip ahead)", () => {
    const stream = place("stream");
    const sink = place("s3"); // a valid Stream consumer, kept saturated
    connect(stream, sink);
    saturate(sink);

    const reqs = pushSeq(stream, 6);
    for (let i = 0; i < 10; i++) stream.update(0.2);

    // Nothing forwarded; every record is still parked behind its blocked head.
    expect(heldInPartitions(stream)).toBe(6);
    expect(reqs.every((r) => S.requests.includes(r))).toBe(true);
  });

  it("partition independence: one blocked partition does NOT stall the others", () => {
    const stream = place("stream"); // 3 partitions
    const blocked = place("s3"); // consumer[0] -> partitions 0 and 2 (kept full)
    const free = place("notify"); // consumer[1] -> partition 1 (drains)
    connect(stream, blocked);
    connect(stream, free);
    saturate(blocked);

    pushSeq(stream, 6); // p0=[0,3], p1=[1,4], p2=[2,5]
    // Run the world but NEVER tick the blocked consumer (stays full); the free
    // consumer and the flying records DO advance.
    for (let i = 0; i < 60; i++) stepExcept(0.2, [blocked]);

    // The free partition drained completely...
    expect(stream.partitions[1]).toHaveLength(0);
    // ...while both blocked partitions still hold their records.
    expect(stream.partitions[0]?.length).toBeGreaterThan(0);
    expect(stream.partitions[2]?.length).toBeGreaterThan(0);
    expect(S.requestsProcessed).toBe(2); // exactly p1's two records got through
  });

  it("DRAIN: a blocked partition proceeds the moment its consumer frees: everything terminates", () => {
    const stream = place("stream");
    const sink = place("notify");
    connect(stream, sink);
    saturate(sink);

    pushSeq(stream, 9);
    for (let i = 0; i < 20; i++) stepExcept(0.2, [sink]); // blocked phase
    expect(heldInPartitions(stream)).toBeGreaterThan(0);

    // Free the consumer (drop the dummy fill) and let the world run.
    sink.queue = [];
    for (let i = 0; i < 200; i++) run(0.2);

    expect(heldInPartitions(stream)).toBe(0);
    expect(S.requests).toHaveLength(0); // TERMINATION: full drain
    expect(S.requestsProcessed).toBe(9);
  });

  it("a record with NO routable consumer fails (terminates): no leak", () => {
    const stream = place("stream"); // no downstream wired
    pushSeq(stream, 3);
    run(10);
    flushRemovals();

    expect(S.requestsProcessed).toBe(0);
    expect(totalFailures()).toBe(3);
    expect(S.requests).toHaveLength(0);
  });

  it("TERMINATION: an ingress burst through a real pipeline drains to zero", () => {
    const alb = place("alb");
    const stream = place("stream");
    const compute = place("compute");
    const db = place("db");
    connect("internet", alb);
    connect(alb, stream);
    connect(stream, compute);
    connect(compute, db);
    pin.value = 0.99;

    for (let t = 0; t < 40; t++) {
      inject("WRITE");
      run(0.1);
    }
    run(50);
    flushRemovals();

    expect(S.requests).toHaveLength(0);
    expectDrained();
  });
});

// ================================== GEODNS ==================================
describe("GeoDNS", () => {
  it("DISTINGUISHABLE: round-robins across its own independent downstream STACKS (not workers in one stack)", () => {
    const dns = place("dns");
    const waf1 = place("waf");
    const waf2 = place("waf");
    connect("internet", dns);
    connect(dns, waf1);
    connect(dns, waf2);

    // Drive four records through the DNS handler directly; targets must alternate
    // across the two front doors: an even split.
    const targets: (Service | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const r = new Request("READ");
      S.requests.push(r);
      dnsProcess(dns, { req: r, timer: 0 });
      targets.push(r.target);
      r.destroy();
    }
    expect(targets.filter((t) => t === waf1)).toHaveLength(2);
    expect(targets.filter((t) => t === waf2)).toHaveLength(2);
  });

  it("is chosen as the ENTRY from the Internet, ahead of a bare WAF/API-GW fallback", () => {
    const dns = place("dns");
    const waf = place("waf");
    connect("internet", dns);
    connect("internet", waf); // both are Internet-facing entries
    const req = inject("READ");
    // The front-most distributor wins the entry decision.
    expect(req.target?.type).toBe("dns");
  });

  it("TERMINATION: a two-region topology (dns -> 2 independent WAF->ALB->Compute->DB stacks) drains to zero", () => {
    const dns = place("dns");
    const wafA = place("waf");
    const albA = place("alb");
    const computeA = place("compute");
    const dbA = place("db");
    const wafB = place("waf");
    const albB = place("alb");
    const computeB = place("compute");
    const dbB = place("db");
    connect("internet", dns);
    connect(dns, wafA);
    connect(wafA, albA);
    connect(albA, computeA);
    connect(computeA, dbA);
    connect(dns, wafB);
    connect(wafB, albB);
    connect(albB, computeB);
    connect(computeB, dbB);
    pin.value = 0.99;

    for (let t = 0; t < 40; t++) {
      inject("READ");
      run(0.1);
    }
    run(30);
    flushRemovals();

    expect(S.requestsProcessed).toBeGreaterThan(0);
    expect(S.requests).toHaveLength(0);
  });

  it("with no downstream front-door, a record on DNS fails (terminates): no leak", () => {
    const dns = place("dns");
    connect("internet", dns); // dns wired to nothing downstream
    pin.value = 0.99;
    inject("READ");
    run(10);
    flushRemovals();

    expect(S.requestsProcessed).toBe(0);
    expect(S.requests).toHaveLength(0);
  });
});

// ============================== DATA WAREHOUSE ==============================
describe("Data Warehouse", () => {
  it("DISTINGUISHABLE: completes a WRITE but REJECTS a READ: the inverse of a database (OLAP not OLTP)", () => {
    // WRITE completes.
    const wh1 = place("warehouse");
    injectTo(wh1, "WRITE");
    run(20);
    expect(S.requestsProcessed).toBe(1);
    expect(S.requests).toHaveLength(0);

    // READ fails at the very same node type: a DB would have served it.
    resetWorld();
    const wh2 = place("warehouse");
    injectTo(wh2, "READ");
    run(20);
    flushRemovals();
    expect(S.requestsProcessed).toBe(0);
    expect(S.failures.READ).toBe(1);
    expect(S.requests).toHaveLength(0);
  });

  it("accepts WRITE + UPLOAD, rejects READ + SEARCH + STATIC", () => {
    const accept: TrafficType[] = ["WRITE", "UPLOAD"];
    const reject: TrafficType[] = ["READ", "SEARCH", "STATIC"];
    for (const type of accept) {
      resetWorld();
      const wh = place("warehouse");
      injectTo(wh, type);
      run(20);
      expect(S.requestsProcessed, `${type} should complete`).toBe(1);
    }
    for (const type of reject) {
      resetWorld();
      const wh = place("warehouse");
      injectTo(wh, type);
      run(20);
      flushRemovals();
      expect(S.requestsProcessed, `${type} should be rejected`).toBe(0);
      expect(S.requests, `${type} should still terminate`).toHaveLength(0);
    }
  });

  it("DISTINGUISHABLE: cheap-at-volume + slow: very low upkeep-per-capacity and a very high processing time", () => {
    const wh = CONFIG.services.warehouse;
    // Slower than a realtime SQL DB (OLAP latency).
    expect(wh.processingTime).toBeGreaterThan(CONFIG.services.db.processingTime);
    // Cheaper per unit capacity than the DB (cheap at volume).
    const whPerCap = wh.upkeep / wh.capacity;
    const dbPerCap = CONFIG.services.db.upkeep / CONFIG.services.db.capacity;
    expect(whPerCap).toBeLessThan(dbPerCap);
  });

  it("analytics fan-out: a Pub/Sub WRITE copy lands in the Warehouse and completes (both branches terminate)", () => {
    const pubsub = place("pubsub");
    const compute = place("compute");
    const db = place("db");
    const warehouse = place("warehouse");
    connect(pubsub, compute); // realtime branch
    connect(pubsub, warehouse); // analytics copy
    connect(compute, db);
    pin.value = 0.99;

    injectTo(pubsub, "WRITE"); // one event, two deliveries
    run(20);

    expect(S.requestsProcessed).toBe(2); // realtime + analytics copy
    expect(S.requests).toHaveLength(0);
  });

  it("scheduled ETL: a Scheduler batch load fills the Warehouse and every job terminates", () => {
    const scheduler = place("scheduler");
    const warehouse = place("warehouse");
    connect(scheduler, warehouse);
    pin.value = 0.99;

    run(20); // more than one cron interval: at least one WRITE batch
    expect(S.requestsProcessed).toBeGreaterThan(0);
    // The scheduler keeps emitting, so only the first batch is guaranteed finished;
    // stop the source and everything it sent must drain.
    scheduler.connections = [];
    run(30);
    expect(S.requests).toHaveLength(0);
  });
});

// ===================== CONNECTION VALIDITY (anti-cycle) =====================
describe("archetype connection rules (no cycles)", () => {
  const accepts = (fromType: ServiceType | "internet", toType: ServiceType): boolean => {
    const to = place(toType);
    const from = fromType === "internet" ? "internet" : place(fromType);
    connect(from, to);
    const conns = from === "internet" ? S.internetNode.connections : from.connections;
    return conns.includes(to.id);
  };
  const rejects = (fromType: ServiceType | "internet", toType: ServiceType): boolean =>
    !accepts(fromType, toType);

  it("Container is Compute's sibling: fed by LB/Queue/API-GW, forwarding to the data tier", () => {
    expect(accepts("alb", "container")).toBe(true);
    expect(accepts("sqs", "container")).toBe(true);
    expect(accepts("container", "db")).toBe(true);
    expect(accepts("container", "cache")).toBe(true);
  });

  it("GeoDNS is a pure entry: a valid Internet target that only fronts WAF/ALB/API-GW", () => {
    expect(accepts("internet", "dns")).toBe(true);
    expect(accepts("dns", "waf")).toBe(true);
    expect(accepts("dns", "alb")).toBe(true);
    // NOT a load balancer for workers: it fronts stacks, not compute.
    expect(rejects("dns", "compute")).toBe(true);
    // Nothing routes INTO DNS except the Internet (no loop back up).
    expect(rejects("waf", "dns")).toBe(true);
    expect(rejects("alb", "dns")).toBe(true);
  });

  it("Stream is fed from the front tier and forwards to processors/sinks (no loop back up)", () => {
    expect(accepts("alb", "stream")).toBe(true);
    expect(accepts("stream", "compute")).toBe(true);
    expect(accepts("stream", "warehouse")).toBe(true);
    expect(rejects("stream", "alb")).toBe(true); // never routes back up
  });

  it("Data Warehouse is a pure terminal sink: fed by fan-out/schedule/stream, no outgoing edges", () => {
    expect(accepts("pubsub", "warehouse")).toBe(true);
    expect(accepts("scheduler", "warehouse")).toBe(true);
    expect(rejects("warehouse", "db")).toBe(true);
    expect(rejects("warehouse", "compute")).toBe(true);
  });
});

// =============================== LEAK BATTERY ===============================
describe("combined leak battery (the cardinal invariant)", () => {
  it("all four batch-2 archetypes wired with batch-1: mixed traffic + cron all drain to 0", () => {
    // internet -> dns -> wafA/albA... AND wafB/albB... two regions
    const dns = place("dns");
    // Region A: waf -> alb -> { container, stream } -> data
    const wafA = place("waf");
    const albA = place("alb");
    const container = place("container");
    const stream = place("stream");
    const dbA = place("db");
    const s3A = place("s3");
    // Region B: waf -> alb -> compute
    const wafB = place("waf");
    const albB = place("alb");
    const computeB = place("compute");
    const dbB = place("db");
    // analytics + async
    const pubsub = place("pubsub");
    const warehouse = place("warehouse");
    const scheduler = place("scheduler");
    const notify = place("notify");

    connect("internet", dns);
    connect(dns, wafA);
    connect(wafA, albA);
    connect(albA, container);
    connect(albA, stream);
    connect(albA, pubsub);
    connect(container, dbA);
    connect(stream, computeB);
    connect(stream, s3A);
    connect(pubsub, warehouse);
    connect(pubsub, notify);
    connect(dns, wafB);
    connect(wafB, albB);
    connect(albB, computeB);
    connect(computeB, dbB);
    connect(scheduler, warehouse);

    for (let t = 0; t < 120; t++) {
      if (t % 3 === 0) inject("READ");
      if (t % 4 === 0) inject("WRITE");
      if (t % 5 === 0) inject("STATIC");
      if (t % 6 === 0) inject("UPLOAD");
      run(0.1);
    }
    // Stop external traffic and the cron source; let everything (streams,
    // in-flight) drain.
    scheduler.connections = [];
    run(80);
    flushRemovals();

    expect(S.requests).toHaveLength(0); // NOTHING leaked
    expectDrained();
  });
});
