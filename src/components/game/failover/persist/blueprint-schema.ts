import { safeJsonParse } from "@/lib/safe-json";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "../sim/config";
import { isValidEdge } from "../sim/topology";

// The ?arch= wire format is Server Survival's v1 (src/ui/share.js), kept exactly so its
// links open here: type ids match, and so do the caps and the validation. The decoder
// is the single gate for an untrusted link: it never throws, drops what is bad and
// keeps what is good. The rebuild (blueprint.ts) then goes only through dispatch, so
// the placement rules, the edge allowlist and the reverse-edge guard apply a second time.

export const ARCH_VERSION = 1;
/** Hard caps: about 60 services covers every realistic build and stops a hostile payload allocating thousands. */
export const MAX_SERVICES = 60;
export const MAX_CONNECTIONS = 240;
/** The viability bound for a whole link. */
export const MAX_URL_LENGTH = 2000;
/** A raw param over this is rejected before it is decoded. */
export const MAX_PARAM_LENGTH = 4096;
export const MAX_BLUEPRINT_BUDGET = 1_000_000;
/**
 * One full grid width of slack around the origin: the drawn grid spans half of this on
 * each side, so a node parked just off the edge still shares and a 1e300 one does not.
 */
export const POSITION_BOUND = CONFIG.gridSize * CONFIG.tileSize;

/** The JSON a link carries: v version, b sandbox budget, t types (power first), p positions as x0,z0,x1,z1..., c service edges as index pairs, i internet edges as indices. */
export interface ArchWire {
  v: 1;
  b: number;
  t: readonly string[];
  p: readonly number[];
  c: readonly number[];
  i: readonly number[];
}

export interface ArchService {
  type: ServiceType;
  x: number;
  z: number;
}

/**
 * A decoded blueprint. `services` keeps the payload's own indices: a dropped entry is
 * null, so the edge indices stay aligned with what the payload claimed.
 */
export interface Arch {
  budget: number;
  services: Array<ArchService | null>;
  connections: Array<[number, number]>;
  internet: number[];
  /** How many entries were ignored as invalid. */
  dropped: number;
}

const SERVICE_TYPE_SET: ReadonlySet<string> = new Set(SERVICE_TYPES);

const isServiceType = (type: unknown): type is ServiceType =>
  typeof type === "string" && SERVICE_TYPE_SET.has(type);

const isIndex = (n: unknown, length: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n < length;

const onGrid = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= POSITION_BOUND;

export function encodeArchParam(wire: ArchWire): string {
  return btoa(JSON.stringify(wire)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(param: string): string {
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** A hostile link is expected input, not a fault: nothing to report. */
const ignoreParseError = (): void => undefined;

function parseWire(raw: string): Record<string, unknown> | null {
  let text: string;
  try {
    text = fromBase64Url(raw);
  } catch {
    // silent-ok: malformed base64 in a pasted link is ignored by design
    return null;
  }
  const data = safeJsonParse<unknown>(text, "failover:arch", null, ignoreParseError);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

/**
 * The architecture a ?arch= value describes, or null if it is not a v1 blueprint
 * within the caps. Never throws.
 */
export function decodeArchParam(raw: unknown): Arch | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PARAM_LENGTH) return null;
  const data = parseWire(raw);
  if (!data || data.v !== ARCH_VERSION) return null;

  const { t, p, c, i: inet } = data;
  if (!Array.isArray(t) || !Array.isArray(p) || !Array.isArray(c) || !Array.isArray(inet)) {
    return null;
  }
  if (t.length > MAX_SERVICES || p.length !== t.length * 2) return null;
  if (c.length > MAX_CONNECTIONS * 2 || c.length % 2 !== 0) return null;
  if (inet.length > MAX_SERVICES) return null;

  let dropped = 0;

  // Services: the type must be one we own (a set lookup, so "toString" and "__proto__" do
  // not sneak through) and the position finite and on or near the grid. Bad entries are
  // dropped, good ones survive.
  const services = t.map((type: unknown, idx): ArchService | null => {
    const x: unknown = p[idx * 2];
    const z: unknown = p[idx * 2 + 1];
    if (isServiceType(type) && onGrid(x) && onGrid(z)) return { type, x, z };
    dropped++;
    return null;
  });

  // Edges: both ends must be surviving services and the pair on the same allowlist
  // dispatch enforces. Pre-filtering only keeps a hostile edge off the refusal path;
  // the rebuild still has the final word, and the stateful reverse-edge guard.
  const connections: Array<[number, number]> = [];
  for (let k = 0; k < c.length; k += 2) {
    const from: unknown = c[k];
    const to: unknown = c[k + 1];
    const a = isIndex(from, services.length) ? services[from] : null;
    const b = isIndex(to, services.length) ? services[to] : null;
    if (a && b && from !== to && isValidEdge(a.type, b.type)) {
      connections.push([from as number, to as number]);
    } else {
      dropped++;
    }
  }

  const internet: number[] = [];
  for (const idx of inet as unknown[]) {
    const target = isIndex(idx, services.length) ? services[idx] : null;
    if (target && isValidEdge("internet", target.type)) internet.push(idx as number);
    else dropped++;
  }

  const b = data.b;
  const budget =
    typeof b === "number" && Number.isFinite(b)
      ? Math.min(MAX_BLUEPRINT_BUDGET, Math.max(0, Math.round(b)))
      : CONFIG.sandbox.defaultBudget;

  return { budget, services, connections, internet, dropped };
}
