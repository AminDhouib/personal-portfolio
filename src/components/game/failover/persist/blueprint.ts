import { dispatch } from "../sim/action-log";
import { CONFIG } from "../sim/config";
import { resetSim, S } from "../sim/state";
import {
  type Arch,
  type ArchWire,
  ARCH_VERSION,
  decodeArchParam,
  encodeArchParam,
  MAX_BLUEPRINT_BUDGET,
  MAX_CONNECTIONS,
  MAX_SERVICES,
  MAX_URL_LENGTH,
} from "./blueprint-schema";

/** What the share dialog shows when a build cannot fit in a link. */
export const TOO_LARGE_MESSAGE = "too large to share";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The live board as a v1 wire object: service types, positions, connections and the
 * sandbox budget, and nothing else (no score, standing or run state).
 *
 * Power sorts first because a rebuild places services in payload order and a GPU needs
 * its substation already on the board; every index in c and i is remapped through the
 * permutation, with the placement order as the tiebreak.
 */
export function captureBlueprint(): ArchWire {
  const ordered = S.services
    .map((service, idx) => ({ service, idx }))
    .sort(
      (a, b) =>
        (a.service.type === "power" ? 0 : 1) - (b.service.type === "power" ? 0 : 1) ||
        a.idx - b.idx,
    )
    .map((entry) => entry.service);
  const indexById = new Map(ordered.map((service, idx) => [service.id, idx]));

  const p: number[] = [];
  for (const service of ordered) p.push(round2(service.position.x), round2(service.position.z));

  const c: number[] = [];
  const inet: number[] = [];
  // S.connections carries the Internet edges too, so one pass covers both lists.
  for (const conn of S.connections) {
    const to = indexById.get(conn.to);
    if (to === undefined) continue;
    if (conn.from === "internet") {
      inet.push(to);
    } else {
      const from = indexById.get(conn.from);
      if (from !== undefined) c.push(from, to);
    }
  }
  return {
    v: ARCH_VERSION,
    b: Math.round(S.sandboxBudget) || 0,
    t: ordered.map((service) => service.type),
    p,
    c,
    i: inet,
  };
}

export type ShareUrlResult =
  { ok: true; url: string } | { ok: false; reason: typeof TOO_LARGE_MESSAGE };

/**
 * `base` (origin plus path) with the blueprint as ?arch=, or "too large to share" if the
 * link would pass 2000 characters or carry more than the decoder will take.
 */
export function shareUrl(base: string, wire: ArchWire): ShareUrlResult {
  const tooMany =
    wire.t.length > MAX_SERVICES ||
    wire.c.length > MAX_CONNECTIONS * 2 ||
    wire.i.length > MAX_SERVICES;
  const url = tooMany ? "" : `${base}?arch=${encodeArchParam(wire)}`;
  if (tooMany || url.length > MAX_URL_LENGTH) return { ok: false, reason: TOO_LARGE_MESSAGE };
  return { ok: true, url };
}

/** The share link for the live board. */
export function buildShareUrl(base: string): ShareUrlResult {
  return shareUrl(base, captureBlueprint());
}

export interface RebuildResult {
  /** The sandbox budget the new board started with. */
  budget: number;
  placed: number;
  /** Services dispatch refused (a taken tile, off the board, a GPU without power) or the decoder dropped. */
  skipped: number;
  linked: number;
  /** Edges dispatch refused (the reverse-edge guard, a skipped end). */
  unlinked: number;
}

/**
 * Start a fresh sandbox and build `arch` into it, only ever through dispatch. The build is
 * therefore in the action log, so a save of it replays to the same board. The budget is the
 * blueprint's, raised to the build's own cost so a cheap budget still places everything
 * (money then bottoms out at zero instead of the shared build being cut short).
 */
export function rebuildBlueprint(arch: Arch, seed: string): RebuildResult {
  let total = 0;
  for (const service of arch.services) if (service) total += CONFIG.services[service.type].cost;
  const budget = Math.min(MAX_BLUEPRINT_BUDGET, Math.ceil(Math.max(arch.budget, total)));
  resetSim({ seed, mode: "sandbox", budget });

  const ids = arch.services.map((service) => {
    if (!service) return null;
    const before = S.services.length;
    dispatch({ op: 0, type: service.type, x: service.x, z: service.z });
    return S.services.length > before ? (S.services[S.services.length - 1]?.id ?? null) : null;
  });

  let linked = 0;
  let unlinked = 0;
  const wire = (from: string | null, to: string | null): void => {
    if (!from || !to) return void unlinked++;
    if (dispatch({ op: 1, from, to }).ok) linked++;
    else unlinked++;
  };
  for (const idx of arch.internet) wire("internet", ids[idx] ?? null);
  for (const [from, to] of arch.connections) wire(ids[from] ?? null, ids[to] ?? null);

  const placed = ids.filter((id) => id !== null).length;
  return { budget, placed, skipped: arch.services.length - placed, linked, unlinked };
}

export type ImportResult = ({ ok: true } & RebuildResult) | { ok: false; reason: "invalid" };

/** Decode a ?arch= value and, only if it is a blueprint, replace the sim with it. A bad value touches nothing. */
export function importArchParam(raw: unknown, seed: string): ImportResult {
  const arch = decodeArchParam(raw);
  if (!arch) return { ok: false, reason: "invalid" };
  return { ok: true, ...rebuildBlueprint(arch, seed) };
}

/** Split ?arch= out of a location.search string; `rest` is the query to put back. */
export function extractArchParam(search: string): { raw: string | null; rest: string } {
  const params = new URLSearchParams(search);
  const raw = params.get("arch");
  params.delete("arch");
  return { raw, rest: params.toString() };
}
