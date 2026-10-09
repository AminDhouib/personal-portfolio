import { failRequest } from "./actions";
import { TRAFFIC_TYPES, type ServiceType, type TrafficType } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import { Request } from "./request";
import { rand } from "./rng";
import { isRoutable } from "./routing";
import type { Service } from "./service";
import { S } from "./state";

/** Pick a traffic class from the current mix, or null when the mix is all zero (no traffic). */
export function getTrafficType(): TrafficType | null {
  const dist = S.trafficDistribution;
  const types = Object.keys(dist) as TrafficType[];
  const total = types.reduce((sum, type) => sum + (dist[type] ?? 0), 0);
  // All types at 0% means "no traffic", not "default to STATIC".
  if (total === 0) return null;

  const r = rand("traffic") * total;
  let cumulative = 0;
  for (const type of types) {
    cumulative += dist[type] ?? 0;
    if (r < cumulative) return TRAFFIC_TYPES[type];
  }
  return TRAFFIC_TYPES.STATIC;
}

/**
 * Pick the live entry node of a type, rotating across identical entries so two
 * firewalls share the load. Type "any" means any live entry node.
 */
export function pickEntryNode(entryNodes: Service[], type: ServiceType | "any"): Service | null {
  const ofType = entryNodes.filter(
    (s) => !s.isDisabled && (type === "any" ? true : s.type === type),
  );
  // Prefer routable entries so two firewalls fail over for each other. If every
  // entry of the type is out, fall back to the plain live set rather than
  // black-holing all traffic at the front door.
  const routable = ofType.filter(isRoutable);
  const candidates = routable.length > 0 ? routable : ofType;
  const first = candidates[0];
  if (!first) return null;
  if (candidates.length === 1) return first;

  const index = (S.entryRR[type] ?? 0) % candidates.length;
  S.entryRR[type] = index + 1;
  return candidates[index] ?? first;
}

/** Route a new request to its entry node, or fail it when the Internet is wired to nothing. */
export function routeRequestToEntry(req: Request, type: TrafficType): void {
  const entryNodes = S.internetNode.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => !!s);
  if (entryNodes.length === 0) {
    failRequest(req, FAIL_REASONS.NO_ROUTE);
    return;
  }

  let target: Service | null = null;

  // 1. STATIC prefers a CDN: the edge cache sits even in front of DNS.
  if (type === "STATIC") target = pickEntryNode(entryNodes, "cdn");
  // 2. GeoDNS is the front-most distributor: everything else enters through it.
  target ??= pickEntryNode(entryNodes, "dns");
  // 3. Firewall.
  target ??= pickEntryNode(entryNodes, "waf");
  // 4. API gateway.
  target ??= pickEntryNode(entryNodes, "apigw");
  // 5. Last resort: any live entry point.
  target ??= pickEntryNode(entryNodes, "any");

  if (target) req.flyTo(target);
  else failRequest(req, FAIL_REASONS.NO_ROUTE);
}

export function spawnRequest(): void {
  const type = getTrafficType();
  // No traffic mix configured: nothing to spawn.
  if (type === null) return;
  const req = new Request(type);
  S.requests.push(req);
  routeRequestToEntry(req, type);
}
