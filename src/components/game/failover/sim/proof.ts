// The proof is the action log written as one short string, because the arcade
// route caps a proof at 12,000 characters and a log is up to 700 actions. Entries
// are flat comma-separated numbers: the tick as a delta from the previous action
// (so the digits are bounded by the run length, not 700 x 5), the op, then the
// op's arguments, with a placement written as grid cells rather than world units.
// 700 of the longest actions come to about 10,000 characters.

import type { LoggedAction } from "./action-log";
import { CONFIG } from "./config";

/** Arguments after the op, per op: place(type, cx, cz), link and unlink(from, to), the single-id ops, auto-repair(on), retire. */
const ARITY: Readonly<Record<number, number>> = {
  0: 3,
  1: 2,
  2: 2,
  3: 1,
  4: 1,
  5: 1,
  6: 1,
  7: 1,
  8: 0,
};

const HALF = CONFIG.gridSize / 2;
const TILE = CONFIG.tileSize;

const NUMBER = /^(?:0|[1-9]\d*)$/;

/** Write a log as a proof string. Throws RangeError for a log that is not a valid recording. */
export function encodeProof(log: ReadonlyArray<readonly number[]>): string {
  const out: number[] = [];
  let previous = 0;
  for (const entry of log) {
    const [tick, op, ...args] = entry;
    if (tick === undefined || op === undefined || tick < previous) {
      throw new RangeError("proof ticks must not run backwards");
    }
    out.push(tick - previous, op);
    previous = tick;
    if (op === 0) {
      const [type, x, z] = args;
      if (type === undefined || x === undefined || z === undefined) {
        throw new RangeError("a placement needs a type and a position");
      }
      out.push(type, cellOf(x), cellOf(z));
    } else {
      out.push(...args);
    }
  }
  return out.join(",");
}

function cellOf(world: number): number {
  const cell = world / TILE + HALF;
  if (!Number.isInteger(cell) || cell < 0 || cell > 2 * HALF) {
    throw new RangeError("a placement must sit on a grid tile");
  }
  return cell;
}

/** Read a proof string back into a log, or null if it is not one. Strict: no spaces, signs, fractions or exponents. */
export function parseProof(proof: string): LoggedAction[] | null {
  if (proof === "") return [];
  const tokens = proof.split(",");
  const log: LoggedAction[] = [];
  let tick = 0;
  let i = 0;
  while (i < tokens.length) {
    const delta = number(tokens[i]);
    const op = number(tokens[i + 1]);
    if (delta === null || op === null) return null;
    const arity = ARITY[op];
    if (arity === undefined) return null;
    const args: number[] = [];
    for (let k = 0; k < arity; k++) {
      const arg = number(tokens[i + 2 + k]);
      if (arg === null) return null;
      args.push(arg);
    }
    tick += delta;
    if (!Number.isSafeInteger(tick)) return null;
    if (op === 0) {
      const [type, cx, cz] = args;
      if (type === undefined || cx === undefined || cz === undefined) return null;
      if (cx > 2 * HALF || cz > 2 * HALF) return null;
      log.push([tick, 0, type, (cx - HALF) * TILE, (cz - HALF) * TILE]);
    } else {
      log.push([tick, op, ...args]);
    }
    i += 2 + arity;
  }
  return log;
}

function number(token: string | undefined): number | null {
  if (token === undefined || !NUMBER.test(token)) return null;
  const n = Number(token);
  return Number.isSafeInteger(n) ? n : null;
}
