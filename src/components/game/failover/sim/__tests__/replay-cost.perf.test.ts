// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { stateHash } from "../hash";
import type { LoggedAction } from "../action-log";
import { captureSave, loadSave } from "../../persist/save";
import { MAX_SAVE_BUDGET, MAX_SAVE_TICKS } from "../../persist/save-schema";
import { replayAsync } from "../replay";
import { resetSim, S } from "../state";
import { BUDGET, CHUNK, CHUNK_SMALL, SEED, recordRun } from "./replay-cost-fixture";

afterEach(() => resetSim({ seed: "after-bench" }));

// The go/no-go spike for server-side verification: what one daily submit costs
// to re-simulate. The numbers print on every run; the assertions carry a wide
// margin (4x the targets) so a noisy box cannot flake them, while still failing on
// a real regression. The targets on the dev machine are 1.5 s per submit and
// 40 ms per chunk (the longest the server blocks its event loop).
//
// WALL-CLOCK BUDGETS LIVE HERE, AND THIS FILE RUNS ALONE (T-6247). It is the "perf" vitest
// project (vitest.config.ts): `pnpm test:perf`, one worker, no coverage, after the unit suite. In
// the unit run it sat beside hundreds of other test files on every core, so a budget measured
// in milliseconds failed whenever the host was busy (242 ms against a 160 ms chunk budget, with
// nothing changed). What those runs must still prove, that the replay reproduces the live run
// and that a save loads to the same state, is asserted without any clock in replay-scale.test.ts.

const TARGET_TOTAL_MS = 1500;
const TARGET_CHUNK_MS = 40;
const MARGIN = 4;
// A chunk's cost is a maximum over ~180 chunks, so one GC pause or a scheduler hiccup can push a
// single run past the budget (it once read 160.4 ms against 160 ms) without the code having
// changed. The assertion is on the median of the per-run maxima: with 3 runs, two outlier runs are
// needed to fail it, while a real regression slows every run and still trips it. The budget itself
// stays at 4x the dev-machine target.
const CHUNK_RUNS = 3;
// Records one run and replays it five times (cold, warm, CHUNK_RUNS small-chunk): about 17 s on
// the dev box with nothing else running.
const TEST_TIMEOUT_MS = 120_000;
const SAVE_TEST_TIMEOUT_MS = 120_000; // unchanged: the save-load test does not repeat replays

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
      const smallRuns: Measured[] = [];
      for (let i = 0; i < CHUNK_RUNS; i++)
        smallRuns.push(await measure(log, endedLive, CHUNK_SMALL));
      const small = smallRuns[0] ?? warm;
      const maxChunkSorted = smallRuns.map((m) => m.maxChunkMs).sort((x, y) => x - y);
      const medianMaxChunkMs = maxChunkSorted[Math.floor(CHUNK_RUNS / 2)] ?? 0;
      console.info(
        `replay cost: ${endedLive} ticks (${endedLive * 0.05} s), ${log.length} actions, ` +
          `ends '${cold.endReason}'\n` +
          `  cold ${CHUNK}-tick chunks: ${fmt(cold)}\n` +
          `  warm ${CHUNK}-tick chunks: ${fmt(warm)}\n` +
          `  warm ${CHUNK_SMALL}-tick chunks: ${fmt(small)}\n` +
          `  max chunk over ${CHUNK_RUNS} runs: ${maxChunkSorted.map((v) => v.toFixed(1)).join(", ")} ms`,
      );

      expect(cold.endedAt).toBe(endedLive);
      expect(cold.wallMs).toBeLessThan(TARGET_TOTAL_MS * MARGIN);
      expect(medianMaxChunkMs).toBeLessThan(TARGET_CHUNK_MS * MARGIN);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "loads a save at the 36,000 tick, 700 action cap within budget",
    async () => {
      // Sandbox cannot be lost, so the run reaches the cap; its budget must fit a save.
      recordRun("sandbox", MAX_SAVE_TICKS, MAX_SAVE_BUDGET);
      expect(S.tick).toBe(MAX_SAVE_TICKS);
      expect(S.log.length).toBe(MAX_LOGGED_ACTIONS);
      const saved = captureSave(0);
      if (!saved.ok) throw new Error(`capture failed: ${saved.reason}`);
      const liveHash = stateHash();

      resetSim({ seed: "elsewhere" });
      const start = performance.now();
      const loaded = await loadSave(saved.save);
      const wallMs = performance.now() - start;
      console.info(`save load at the cap: ${MAX_SAVE_TICKS} ticks, ${wallMs.toFixed(0)} ms wall`);

      expect(loaded.ok).toBe(true);
      expect(S.tick).toBe(MAX_SAVE_TICKS);
      expect(stateHash()).toBe(liveHash);
      // Twice the 15 minute replay budget for twice the ticks, with the same 4x margin.
      expect(wallMs).toBeLessThan(2 * TARGET_TOTAL_MS * MARGIN);
    },
    SAVE_TEST_TIMEOUT_MS,
  );
});
