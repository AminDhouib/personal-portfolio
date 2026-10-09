// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { dispatch, MAX_LOGGED_ACTIONS, type Action, type LoggedAction } from "../action-log";
import type { ServiceType } from "../config";
import { replayAsync } from "../replay";
import { resetSim, S } from "../state";
import { step } from "../tick";

afterEach(() => resetSim({ seed: "after-bench" }));

// The go/no-go spike for server-side verification: what one daily submit costs
// to re-simulate. The numbers print on every run; the assertions carry a wide
// margin (4x the targets) so CI noise cannot flake them, while still failing on
// a real regression. The targets on the dev machine are 1.5 s per submit and
// 40 ms per chunk (the longest the server blocks its event loop).

const SEED = "failover-bench";
const TICKS = 18000; // 900 s of game time
const CHUNK = 500;
const CHUNK_SMALL = 100;
const BUDGET = 5_000_000;

const TARGET_TOTAL_MS = 1500;
const TARGET_CHUNK_MS = 40;
const MARGIN = 4;
// Records one run and replays it three times; coverage instrumentation triples that.
const TEST_TIMEOUT_MS = 60_000;

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
function recordRun(): LoggedAction[] {
  resetSim({ seed: SEED, mode: "survival", budget: BUDGET });
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
  while (tick < TICKS && !S.over) {
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
      if ((tick / 24) % 2 === 0) {
        dispatch({ op: 7, on: true });
        dispatch({ op: 7, on: false });
      }
    }
  }
  return copyLog();
}

interface Measured {
  endedAt: number;
  wallMs: number;
  cpuMs: number;
  maxChunkMs: number;
  medianChunkMs: number;
  endReason: string;
}

async function measure(log: LoggedAction[], ticks: number, chunk: number): Promise<Measured> {
  const chunkMs: number[] = [];
  let last = performance.now();
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  const result = await replayAsync(
    { seed: SEED, mode: "survival", budget: BUDGET, log, ticks },
    {
      yieldEvery: chunk,
      yieldFn: () => {
        const now = performance.now();
        chunkMs.push(now - last);
        last = now;
        return Promise.resolve();
      },
    },
  );
  const wallMs = performance.now() - wallStart;
  const cpu = process.cpuUsage(cpuStart);
  chunkMs.push(performance.now() - last);
  const sorted = [...chunkMs].sort((x, y) => x - y);
  return {
    endedAt: result.endedAtTick,
    wallMs,
    cpuMs: (cpu.user + cpu.system) / 1000,
    maxChunkMs: sorted[sorted.length - 1] ?? 0,
    medianChunkMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
    endReason: result.endReason,
  };
}

const fmt = (m: Measured): string =>
  `wall ${m.wallMs.toFixed(0)} ms, cpu ${m.cpuMs.toFixed(0)} ms, ` +
  `chunk median ${m.medianChunkMs.toFixed(1)} / max ${m.maxChunkMs.toFixed(1)} ms`;

describe("replay cost (go / no-go spike)", () => {
  it(
    "re-simulates a 15 minute, 40 service, 700 action run within budget",
    async () => {
      const log = recordRun();
      const endedLive = S.tick;
      expect(endedLive).toBeGreaterThanOrEqual(TICKS);
      expect(log.length).toBe(MAX_LOGGED_ACTIONS);

      // The first pass is cold (a fresh server process); later passes are warm.
      const cold = await measure(log, endedLive, CHUNK);
      const warm = await measure(log, endedLive, CHUNK);
      const small = await measure(log, endedLive, CHUNK_SMALL);
      console.info(
        `replay cost: ${endedLive} ticks (${endedLive * 0.05} s), ${log.length} actions, ` +
          `ends '${cold.endReason}'\n` +
          `  cold ${CHUNK}-tick chunks: ${fmt(cold)}\n` +
          `  warm ${CHUNK}-tick chunks: ${fmt(warm)}\n` +
          `  warm ${CHUNK_SMALL}-tick chunks: ${fmt(small)}`,
      );

      expect(cold.endedAt).toBe(endedLive);
      expect(cold.wallMs).toBeLessThan(TARGET_TOTAL_MS * MARGIN);
      expect(small.maxChunkMs).toBeLessThan(TARGET_CHUNK_MS * MARGIN);
    },
    TEST_TIMEOUT_MS,
  );
});
