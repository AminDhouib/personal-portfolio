// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { MAX_LOGGED_ACTIONS } from "../action-log";
import { captureSave, loadSave } from "../../persist/save";
import { MAX_SAVE_BUDGET, MAX_SAVE_TICKS } from "../../persist/save-schema";
import { replayAsync } from "../replay";
import { resetSim, S } from "../state";
import { stateHash } from "../hash";
import { BUDGET, CHUNK, SEED, TICKS, recordRun } from "./replay-cost-fixture";

afterEach(() => resetSim({ seed: "after-scale" }));

// Both tests record and replay a run of up to 36,000 ticks (the old bench allowed 120 s for the same
// work): 15 s each at twice the host's cores busy under coverage, so 60 s would be thin at more.
const SCALE_TEST_TIMEOUT_MS = 120_000;

// The correctness half of the replay cost spike: what a daily submit re-simulates must come out
// the same at full scale (15 minutes, 40 services, 700 actions, a save at the 36,000 tick cap).
// The wall-clock budgets for the same runs are in replay-cost.perf.test.ts, which runs alone:
// they cannot be asserted here, beside hundreds of other test files on a shared runner.

describe("replay at the daily scale", () => {
  it(
    "re-simulates a 15 minute, 40 service, 700 action run to the same end, in whole chunks",
    async () => {
      const log = recordRun();
      const endedLive = S.tick;
      expect(endedLive).toBeGreaterThanOrEqual(TICKS);
      expect(log.length).toBe(MAX_LOGGED_ACTIONS);

      let yields = 0;
      const result = await replayAsync(
        { seed: SEED, mode: "survival", budget: BUDGET, log, ticks: endedLive },
        {
          yieldEvery: CHUNK,
          yieldFn: () => {
            yields += 1;
            return Promise.resolve();
          },
        },
      );

      expect(result.endedAtTick).toBe(endedLive);
      // One yield between chunks, none after the last: the server's event loop is released every
      // CHUNK ticks, which is what the per-chunk budget in the perf test is about.
      expect(yields).toBe(Math.ceil(endedLive / CHUNK) - 1);
    },
    SCALE_TEST_TIMEOUT_MS,
  );

  it(
    "loads a save at the 36,000 tick, 700 action cap to the identical state",
    async () => {
      // Sandbox cannot be lost, so the run reaches the cap; its budget must fit a save.
      recordRun("sandbox", MAX_SAVE_TICKS, MAX_SAVE_BUDGET);
      expect(S.tick).toBe(MAX_SAVE_TICKS);
      expect(S.log.length).toBe(MAX_LOGGED_ACTIONS);
      const saved = captureSave(0);
      if (!saved.ok) throw new Error(`capture failed: ${saved.reason}`);
      const liveHash = stateHash();

      resetSim({ seed: "elsewhere" });
      const loaded = await loadSave(saved.save);

      expect(loaded.ok).toBe(true);
      expect(S.tick).toBe(MAX_SAVE_TICKS);
      expect(stateHash()).toBe(liveHash);
    },
    SCALE_TEST_TIMEOUT_MS,
  );
});
