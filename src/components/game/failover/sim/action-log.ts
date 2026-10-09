// The player's side of the sim: every build, wire, upgrade and retire goes
// through dispatch(), which applies it through the same topology and economy
// functions the rules live in and logs the attempt. A replay feeds the log back
// through dispatch(), so the live game and the server's re-simulation refuse and
// accept exactly the same things (money, placement and edge rules are all state).

import { canAutoscale, toggleAutoscaling } from "./autoscaling";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "./config";
import { setAutoRepair } from "./economy";
import { emit, S } from "./state";
import {
  createConnection,
  createService,
  deleteConnection,
  deleteObject,
  snapToGrid,
} from "./topology";

/** Ops 0..8 of the plan's action log. Ids are "internet" or a service id (`svc_N`). */
export type Action =
  | { op: 0; type: ServiceType; x: number; z: number }
  | { op: 1; from: string; to: string }
  | { op: 2; from: string; to: string }
  | { op: 3 | 4 | 5 | 6; id: string }
  | { op: 7; on: boolean }
  | { op: 8 };

/**
 * One log entry: `[tick, op, ...args]`, numbers only so a 700-action proof stays
 * inside the body cap. A service type is its index in SERVICE_TYPES, an id is its
 * counter (the Internet is 0), a boolean is 0 or 1, and a placement is logged at
 * the tile it snapped to.
 */
export type LoggedAction = readonly [tick: number, op: number, ...args: number[]];

type ActionResult = { ok: true } | { ok: false; reason: string };

/** More attempts than this and the run plays on but is not rankable. */
export const MAX_LOGGED_ACTIONS = 700;

const INTERNET_ID = 0;

const refuse = (reason: string): ActionResult => ({ ok: false, reason });

function idToNumber(id: string): number | null {
  if (id === "internet") return INTERNET_ID;
  const match = /^svc_([1-9]\d*)$/.exec(id);
  return match ? Number(match[1]) : null;
}

function numberToId(n: number): string {
  return n === INTERNET_ID ? "internet" : `svc_${n}`;
}

/** The log entry for an action issued at `tick`, or null if it cannot be written down (NaN, a made-up id). */
export function encodeAction(tick: number, a: Action): LoggedAction | null {
  switch (a.op) {
    case 0: {
      const index = SERVICE_TYPES.indexOf(a.type);
      if (index < 0 || !Number.isFinite(a.x) || !Number.isFinite(a.z)) return null;
      const pos = snapToGrid({ x: a.x, z: a.z });
      return [tick, 0, index, pos.x, pos.z];
    }
    case 1:
    case 2: {
      const from = idToNumber(a.from);
      const to = idToNumber(a.to);
      return from === null || to === null ? null : [tick, a.op, from, to];
    }
    case 3:
    case 4:
    case 5:
    case 6: {
      const id = idToNumber(a.id);
      return id === null || id === INTERNET_ID ? null : [tick, a.op, id];
    }
    case 7:
      return [tick, 7, a.on ? 1 : 0];
    case 8:
      return [tick, 8];
  }
}

type DecodeResult = { ok: true; action: Action } | { ok: false; code: "unknown-op" | "bad-args" };

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const isServiceId = (n: unknown): n is number => isInt(n) && n >= 1;
const isNodeId = (n: unknown): n is number => isInt(n) && n >= INTERNET_ID;

/**
 * Read a log entry back into an action, checking it is one the player could have
 * made. The server decodes a whole proof before it plays any of it.
 */
export function decodeAction(entry: readonly unknown[]): DecodeResult {
  const op = entry[1];
  const args = entry.slice(2);
  const bad: DecodeResult = { ok: false, code: "bad-args" };
  switch (op) {
    case 0: {
      const [index, x, z] = args;
      const type = isInt(index) ? SERVICE_TYPES[index] : undefined;
      if (args.length !== 3 || !type || !isInt(x) || !isInt(z)) return bad;
      return { ok: true, action: { op: 0, type, x, z } };
    }
    case 1:
    case 2: {
      const [from, to] = args;
      if (args.length !== 2 || !isNodeId(from) || !isNodeId(to)) return bad;
      return { ok: true, action: { op, from: numberToId(from), to: numberToId(to) } };
    }
    case 3:
    case 4:
    case 5:
    case 6: {
      const [id] = args;
      if (args.length !== 1 || !isServiceId(id)) return bad;
      return { ok: true, action: { op, id: numberToId(id) } };
    }
    case 7: {
      const [on] = args;
      if (args.length !== 1 || (on !== 0 && on !== 1)) return bad;
      return { ok: true, action: { op: 7, on: on === 1 } };
    }
    case 8:
      return args.length === 0 ? { ok: true, action: { op: 8 } } : bad;
    default:
      return { ok: false, code: "unknown-op" };
  }
}

function findService(id: string) {
  return S.services.find((s) => s.id === id);
}

/** Half the board's width: the farthest a service may sit from the centre on either axis. */
const BOARD_LIMIT = (CONFIG.gridSize * CONFIG.tileSize) / 2;

function place(a: Extract<Action, { op: 0 }>): ActionResult {
  const pos = snapToGrid({ x: a.x, z: a.z });
  if (Math.abs(pos.x) > BOARD_LIMIT || Math.abs(pos.z) > BOARD_LIMIT) return refuse("bounds");
  if (createService(a.type, pos)) return { ok: true };
  // createService checks the money first, so a refusal with enough money is the tile.
  return refuse(S.money < CONFIG.services[a.type].cost ? "money" : "occupied");
}

function upgrade(id: string): ActionResult {
  const svc = findService(id);
  if (!svc) return refuse("missing");
  if (svc.upgrade()) return { ok: true };
  const tiers = CONFIG.services[svc.type].tiers;
  const next = tiers?.[svc.tier];
  if (!next) return refuse(tiers ? "max-tier" : "not-upgradable");
  return refuse(S.money < next.cost ? "money" : "not-upgradable");
}

// Compute and the container cluster run an auto-scaling group. Turning it off
// collapses the fleet to one instance and cancels any boot (see autoscaling.ts).
function toggleAsg(id: string): ActionResult {
  const svc = findService(id);
  if (!svc) return refuse("missing");
  if (!canAutoscale(svc)) return refuse("not-scalable");
  toggleAutoscaling(svc);
  return { ok: true };
}

function repair(id: string): ActionResult {
  const svc = findService(id);
  if (!svc) return refuse("missing");
  if (svc.health >= 100) return refuse("healthy");
  return svc.repair() ? { ok: true } : refuse("money");
}

function retire(): ActionResult {
  S.over = { reason: "retired", atTick: S.tick };
  emit({ kind: "game-over", reason: "retired" });
  return { ok: true };
}

function apply(a: Action): ActionResult {
  switch (a.op) {
    case 0:
      return place(a);
    case 1: {
      const result = createConnection(a.from, a.to);
      return result.ok ? { ok: true } : refuse(result.reason);
    }
    case 2:
      return deleteConnection(a.from, a.to) ? { ok: true } : refuse("missing");
    case 3:
      return deleteObject(a.id) ? { ok: true } : refuse("missing");
    case 4:
      return upgrade(a.id);
    case 5:
      return toggleAsg(a.id);
    case 6:
      return repair(a.id);
    case 7:
      setAutoRepair(a.on);
      return { ok: true };
    case 8:
      return retire();
  }
}

/**
 * Apply one player action at the current tick and log it, applied or not. A
 * finished run takes nothing more, and an action that cannot be written down
 * (NaN, a made-up id) is refused unlogged; neither can happen in a replay of an
 * honest log, and neither changes the sim.
 */
export function dispatch(a: Action): ActionResult {
  if (S.over) return refuse("over");
  const entry = encodeAction(S.tick, a);
  if (!entry) return refuse("bad-args");

  if (S.log.length < MAX_LOGGED_ACTIONS) S.log.push(entry);
  else S.logOverflow = true;
  return apply(a);
}
