import type { ServiceType } from "../sim/config";
import type { ServiceSnapshot } from "../sim/snapshot";
import { ACCENT, DISABLED_COLOR, SERVICE_COLORS } from "./palette";

// How a service node looks, decided from its snapshot. Pure: the scene builds
// the wireframe from this, so the rules are tested without WebGL.

export type NodeShape = "box" | "cylinder" | "octahedron";

const DATA_STORES = new Set<ServiceType>([
  "db",
  "nosql",
  "replica",
  "warehouse",
  "cache",
  "s3",
  "search",
]);
const QUEUES = new Set<ServiceType>(["sqs", "pubsub", "stream", "dlq", "notify"]);

/** Data stores are drums, queues and topics are diamonds, everything else a box. */
export function nodeShape(type: ServiceType): NodeShape {
  if (DATA_STORES.has(type)) return "cylinder";
  if (QUEUES.has(type)) return "octahedron";
  return "box";
}

export interface NodeStyle {
  color: string;
  /** Height of the outline, which grows with the tier. */
  height: number;
  /** Nested outlines drawn: the wireframe's "thickness", one per tier, at most 3. */
  outlines: number;
  /** 0-1: a damaged node fades. */
  opacity: number;
}

const BASE_HEIGHT = 1.6;
const PER_TIER = 0.8;
/** Below this health the node turns red. */
const CRITICAL_HEALTH = 35;

export function nodeStyle(service: ServiceSnapshot, flash: string | null): NodeStyle {
  const tier = Math.max(1, service.tier);
  let color = SERVICE_COLORS[service.type];
  if (service.health < CRITICAL_HEALTH) color = ACCENT.red;
  if (service.disabled) color = DISABLED_COLOR;
  if (flash) color = flash;
  return {
    color,
    height: BASE_HEIGHT + PER_TIER * (tier - 1),
    outlines: Math.min(3, tier),
    opacity: service.disabled
      ? 0.35
      : 0.45 + (0.55 * Math.max(0, Math.min(100, service.health))) / 100,
  };
}

/** Which ids appeared and which went, between the drawn set and the snapshot. */
export function diffIds(
  drawn: ReadonlySet<string>,
  services: readonly { id: string }[],
): { added: string[]; removed: string[] } {
  const now = new Set(services.map((s) => s.id));
  return {
    added: [...now].filter((id) => !drawn.has(id)),
    removed: [...drawn].filter((id) => !now.has(id)),
  };
}
