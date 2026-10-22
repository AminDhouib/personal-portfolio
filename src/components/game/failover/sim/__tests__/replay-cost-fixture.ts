import { dispatch, MAX_LOGGED_ACTIONS, type Action, type LoggedAction } from "../action-log";
import type { ServiceType } from "../config";
import { resetSim, S } from "../state";
import { step } from "../tick";

// The run replay-scale.test.ts (correctness) and replay-cost.perf.test.ts (timing budgets) both
// replay: a 15 minute, 40 service, 700 action survival run, recorded live first.

export const SEED = "failover-bench";
export const TICKS = 18000; // 900 s of game time
export const CHUNK = 500;
export const CHUNK_SMALL = 100;
export const BUDGET = 5_000_000;

interface Placed {
  type: ServiceType;
  x: number;
  z: number;
}

/** 40 services: a front door, a CDN path, an AI path, a cache, and 24 compute nodes. */
function board(): { places: Placed[]; links: Array<[number, number]> } {
  const places: Placed[] = [];
  const links: Array<[number, number]> = []; // 1-based service numbers; 0 is the Internet
  const add = (type: ServiceType): number => {
    const n = places.length;
    places.push({ type, x: (n % 8) * 8 - 28, z: Math.floor(n / 8) * 8 - 16 });
    return n + 1;
  };
  const waf = add("waf");
  const alb = add("alb");
  links.push([0, waf], [waf, alb]);
  const dbs = [add("db"), add("db"), add("db")];
  const s3s = [add("s3"), add("s3")];
  const cdn = add("cdn");
  links.push([0, cdn], [cdn, s3s[0] ?? 0]);
  const infgw = add("infgw");
  links.push([alb, infgw]);
  add("power");
  add("power");
  for (let g = 0; g < 3; g++) links.push([infgw, add("gpu")]);
  const cache = add("cache");
  const search = add("search");
  for (const d of dbs) links.push([cache, d]);
  for (let i = 0; i < 24; i++) {
    const c = add("compute");
    links.push([alb, c], [c, cache]);
    links.push([c, dbs[i % dbs.length] ?? dbs[0] ?? 0]);
    links.push([c, search]);
    links.push([c, s3s[i % s3s.length] ?? s3s[0] ?? 0]);
  }
  return { places, links };
}

const idOf = (n: number): string => (n === 0 ? "internet" : `svc_${n}`);

function copyLog(): LoggedAction[] {
  return S.log.map((entry) => [...entry] as unknown as LoggedAction);
}

/** Play the run live: build the board, then issue actions up to the cap across the 15 minutes. */
export function recordRun(
  mode: "survival" | "sandbox" = "survival",
  runTicks = TICKS,
  budget = BUDGET,
): LoggedAction[] {
  resetSim({ seed: SEED, mode, budget });
  const { places, links } = board();
  for (const p of places) dispatch({ op: 0, type: p.type, x: p.x, z: p.z });
  for (const [from, to] of links) dispatch({ op: 1, from: idOf(from), to: idOf(to) });

  // Tier the fleet up front, as a player with money to spare would.
  for (let pass = 0; pass < 2; pass++) {
    places.forEach((p, i) => {
      if (p.type === "compute" || p.type === "db" || p.type === "cache") {
        dispatch({ op: 4, id: idOf(i + 1) });
      }
    });
  }

  const computes = places.flatMap((p, i) => (p.type === "compute" ? [i + 1] : []));
  let tick = 0;
  while (tick < runTicks && !S.over) {
    step(24);
    tick += 24;
    if (S.log.length < MAX_LOGGED_ACTIONS) {
      const id = idOf(computes[(tick / 24) % computes.length] ?? 1);
      const actions: Action[] = [
        { op: 4, id },
        { op: 6, id },
      ];
      const action = actions[(tick / 24) % actions.length];
      if (action) dispatch(action);
      // Refusals are not logged, so a pair of auto-repair flips (always accepted, net
      // no change) is what carries the log to the cap across the run.
      if ((tick / 24) % 2 === 0 && S.log.length + 2 <= MAX_LOGGED_ACTIONS) {
        dispatch({ op: 7, on: true });
        dispatch({ op: 7, on: false });
      }
    }
  }
  // Land exactly on the cap, however many of the attempts above were accepted.
  while (S.log.length < MAX_LOGGED_ACTIONS && !S.over)
    dispatch({ op: 7, on: S.log.length % 2 === 0 });
  return copyLog();
}
