// Building: where services go and which wires are legal.

import { flashMoney, removeRequest } from "./actions";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "./config";
import { hasPowerHeadroom, recomputePower, substationRemovalStrandsGpus } from "./power";
import { isRoutable } from "./routing";
import { Service } from "./service";
import { emit, S } from "./state";
import type { Vec2 } from "./types";

type NodeType = ServiceType | "internet";

// The allowed wires, as (from, to) rule rows. Every edge forwards "downward":
// the only pair legal in both directions is ALB and SQS, and linkRefusal blocks
// having both at once, so no request can loop. A dead-letter queue is a failure
// sink wired FROM the nodes whose final failures it should catch. Monitoring and
// the Substation have no rows at all: they are unwireable.
const EDGE_RULES: ReadonlyArray<readonly [readonly NodeType[], readonly ServiceType[]]> = [
  // The classic stack.
  [["internet"], ["waf", "alb", "cdn", "apigw", "auth", "dns"]],
  [["waf"], ["alb", "sqs", "apigw", "auth"]],
  [["sqs"], ["alb", "compute", "serverless", "container"]],
  [
    ["alb"],
    ["sqs", "compute", "serverless", "dlq", "pubsub", "notify", "container", "stream", "infgw"],
  ],
  [["compute"], ["cache", "db", "s3", "nosql", "search", "replica", "dlq", "infgw", "gpu"]],
  [["cache"], ["db", "s3", "nosql", "search", "replica"]],
  [["cdn"], ["s3"]],
  [
    ["apigw"],
    ["alb", "sqs", "compute", "serverless", "dlq", "pubsub", "container", "stream", "infgw"],
  ],
  [["replica"], ["db", "nosql"]],
  [["serverless"], ["cache", "db", "nosql", "s3", "search", "replica", "dlq", "infgw", "gpu"]],

  // Pub/Sub fans out to independent subscribers.
  [["pubsub"], ["compute", "serverless", "notify", "s3", "warehouse"]],
  // Identity sits in line, fed from the edge, forwarding survivors.
  [["auth"], ["alb", "apigw", "compute", "serverless"]],
  // The scheduler is a traffic source: no incoming edges.
  [["scheduler"], ["sqs", "alb", "compute", "serverless", "notify", "warehouse"]],

  // Container mirrors Compute's fan-in and fan-out.
  [["container"], ["cache", "db", "s3", "nosql", "search", "replica", "infgw", "gpu"]],
  // Stream forwards each partition to its own processor or sink.
  [["stream"], ["compute", "serverless", "container", "s3", "notify", "warehouse"]],
  // GeoDNS fans out to independent regional front doors.
  [["dns"], ["waf", "alb", "apigw"]],

  // The Inference Gateway only forwards to GPUs; a GPU is a pure terminal sink.
  [["infgw"], ["gpu"]],
];

const EDGES: ReadonlyMap<NodeType, ReadonlySet<ServiceType>> = (() => {
  const map = new Map<NodeType, Set<ServiceType>>();
  for (const [froms, tos] of EDGE_RULES) {
    for (const from of froms) {
      const set = map.get(from) ?? new Set<ServiceType>();
      for (const to of tos) set.add(to);
      map.set(from, set);
    }
  }
  return map;
})();

/** The static edge allowlist: may a `from` node ever send to a `to` node? */
export function isValidEdge(from: string, to: string): boolean {
  return EDGES.get(from as NodeType)?.has(to as ServiceType) ?? false;
}

/** Every service type a `fromType` node may send to, in CONFIG order. */
export function validTargets(fromType: string): ServiceType[] {
  return SERVICE_TYPES.filter((t) => isValidEdge(fromType, t));
}

/** Snap a point to the tile grid. */
export function snapToGrid(pos: Vec2): Vec2 {
  const s = CONFIG.tileSize;
  // + 0 turns a -0 from rounding a tiny negative into a plain 0.
  return { x: Math.round(pos.x / s) * s + 0, z: Math.round(pos.z / s) * s + 0 };
}

function nodeById(id: string): Service | typeof S.internetNode | undefined {
  return id === "internet" ? S.internetNode : S.services.find((s) => s.id === id);
}

type Node = NonNullable<ReturnType<typeof nodeById>>;

export type LinkRefusal = "self" | "exists" | "reverse" | "invalid";

/**
 * Why `from` may not link to `to`, or null if it may. createConnection enforces
 * it and the Link tool's target rings preview it, so what the board offers and
 * what a click accepts are one rule.
 */
function linkRefusal(from: Node, to: Node): LinkRefusal | null {
  if (from === to) return "self";
  if (from.connections.includes(to.id)) return "exists";
  // The reverse of an existing link is refused. ALB and SQS are the only pair
  // valid both ways, and having both at once would loop requests forever.
  if (to.connections.includes(from.id)) return "reverse";
  if (!isValidEdge(from.type, to.type)) return "invalid";
  return null;
}

/** The ids of every service on the board that `sourceId` could link to now. */
export function linkTargets(sourceId: string): Set<string> {
  const from = nodeById(sourceId);
  if (!from) return new Set();
  return new Set(S.services.filter((s) => linkRefusal(from, s) === null).map((s) => s.id));
}

/** Place a service. Returns it, or null when the money is short or the tile is taken. */
export function createService(type: ServiceType, pos: Vec2): Service | null {
  // Power gate: a GPU cannot go on the grid past the cap (boundary inclusive, see
  // power.ts). Checked before any money moves.
  if (type === "gpu" && !hasPowerHeadroom()) {
    emit({ kind: "warning", key: "power_gate_blocked", level: "danger" });
    return null;
  }
  const cost = CONFIG.services[type].cost;
  if (S.money < cost) {
    flashMoney();
    return null;
  }
  if (
    S.services.some((s) => {
      const dx = s.position.x - pos.x;
      const dz = s.position.z - pos.z;
      return dx * dx + dz * dz < 1;
    })
  )
    return null;

  S.money -= cost;
  const e = S.finances.expenses;
  e.services += cost;
  e.byService[type] = (e.byService[type] ?? 0) + cost;
  e.countByService[type] = (e.countByService[type] ?? 0) + 1;

  const service = new Service(type, pos);
  S.services.push(service);
  recomputePower();
  emit({ kind: "service-placed", id: service.id, type });
  return service;
}

export type ConnectResult =
  { ok: true } | { ok: false; reason: "missing" | LinkRefusal; fromType?: string; toType?: string };

/** Wire `fromId` to `toId` if the rules allow it. Only "invalid" is worth explaining to a player. */
export function createConnection(fromId: string, toId: string): ConnectResult {
  if (fromId === toId) return { ok: false, reason: "self" };
  const from = nodeById(fromId);
  const to = nodeById(toId);
  if (!from || !to) return { ok: false, reason: "missing" };

  const refusal = linkRefusal(from, to);
  if (refusal === "invalid") {
    return { ok: false, reason: "invalid", fromType: from.type, toType: to.type };
  }
  if (refusal) return { ok: false, reason: refusal };

  from.connections.push(toId);
  S.connections.push({ from: fromId, to: toId });
  emit({ kind: "link-added", from: fromId, to: toId });
  return { ok: true };
}

export function deleteConnection(fromId: string, toId: string): boolean {
  const from = nodeById(fromId);
  if (!from || !from.connections.includes(toId)) return false;

  from.connections = from.connections.filter((c) => c !== toId);
  S.connections = S.connections.filter((c) => !(c.from === fromId && c.to === toId));
  emit({ kind: "link-removed", from: fromId, to: toId });
  return true;
}

/** Demolish a service for half its price back. Returns false when there is no such service. */
export function deleteObject(id: string): boolean {
  const svc = S.services.find((s) => s.id === id);
  if (!svc) return false;

  // Anti-cheese: refuse to remove a Substation whose loss would leave the powered
  // GPUs past the reduced cap, or buy-place-refund runs an 18 kW fleet on an 8 kW
  // grid forever. Removing a GPU stays free: shedding load is always legal.
  if (svc.type === "power" && substationRemovalStrandsGpus()) {
    emit({ kind: "warning", key: "power_delete_blocked", level: "danger" });
    return false;
  }

  for (const s of S.services) s.connections = s.connections.filter((c) => c !== id);
  S.internetNode.connections = S.internetNode.connections.filter((c) => c !== id);
  S.connections = S.connections.filter((c) => c.from !== id && c.to !== id);

  // Every request tied to this service (queued, processing, or in flight
  // towards it) would be stranded on a service that never updates again.
  // Remove them cleanly, with no reputation penalty: the player is
  // restructuring, not dropping production traffic.
  const orphaned = new Set([
    ...svc.queue,
    ...svc.processing.map((job) => job.req),
    // A stream holds records in its partitions, and a dead-letter queue holds its
    // parked requests: neither is in queue or processing, and a parked request's
    // target is the node it failed at, not the DLQ. Re-home them too or demolishing
    // the node would strand them. DEVIATION from upstream, which strands them in
    // the request list forever: that is an upstream bug, so the port re-homes them
    // (power.test.ts pins it, NOTICE records it).
    ...svc.partitions.flat(),
    ...svc.parked,
    // A GPU's live batch and an Inference Gateway's deadline entries are off-pipeline
    // backlog too: neither is in queue or processing.
    ...svc.batch,
    ...svc.pending.map((entry) => entry.req),
    ...S.requests.filter((r) => r.target === svc),
  ]);
  for (const req of orphaned) removeRequest(req);

  S.services = S.services.filter((s) => s.id !== id);
  recomputePower();

  // The refund books itself like every other money movement: as a REDUCTION of
  // what the hardware cost, not as income.
  const refund = Math.floor(svc.config.cost / 2);
  S.money += refund;
  const e = S.finances.expenses;
  e.services = Math.max(0, e.services - refund);
  e.byService[svc.type] = Math.max(0, (e.byService[svc.type] ?? 0) - refund);
  e.countByService[svc.type] = Math.max(0, (e.countByService[svc.type] ?? 0) - 1);

  emit({ kind: "service-removed", id });
  return true;
}

/**
 * Single-point-of-failure detection. A service is a SPOF when it is the ONLY
 * routable service of its type that traffic can reach from the Internet.
 *
 * Reachability is a plain forward walk from the Internet node over the connection
 * graph, so services parked off the active path are ignored, as are nodes that
 * never take traffic (Monitoring is unreachable by construction: it has no valid
 * edges). "Only one of its type" is what makes the N+1 lesson land: with a second
 * instance of that type wired to the same upstream, routing (every candidate
 * filter skips a disabled or breaker-open node) fails over on its own.
 *
 * Not modelled: partial redundancy, where a second instance exists but hangs off a
 * different upstream. That is a "your redundancy is not wired up" lesson and needs
 * its own hint text rather than a false negative here.
 */
export function findSPOFs(): Service[] {
  const byId = new Map(S.services.map((s) => [s.id, s]));
  const reachable = new Set<string>();
  const frontier = [...S.internetNode.connections];

  for (let id = frontier.pop(); id !== undefined; id = frontier.pop()) {
    if (reachable.has(id)) continue;
    const svc = byId.get(id);
    if (!svc) continue;
    reachable.add(id);
    for (const next of svc.connections) frontier.push(next);
  }

  const countByType: Partial<Record<ServiceType, number>> = {};
  for (const s of S.services) {
    if (isRoutable(s)) countByType[s.type] = (countByType[s.type] ?? 0) + 1;
  }

  return [...reachable]
    .map((id) => byId.get(id))
    .filter((s): s is Service => !!s && isRoutable(s) && countByType[s.type] === 1);
}
