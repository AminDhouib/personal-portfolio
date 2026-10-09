import { dailyRun, DAILY_MAX_TICKS } from "@/components/game/failover/daily/daily";
import { dispatch, type LoggedAction } from "@/components/game/failover/sim/action-log";
import { encodeProof } from "@/components/game/failover/sim/proof";
import { scoreOf } from "@/components/game/failover/sim/score";
import { resetSim, S } from "@/components/game/failover/sim/state";
import { step } from "@/components/game/failover/sim/tick";
import {
  BOARD_S,
  MID_RUN_S,
  type ScriptEntry,
} from "@/components/game/failover/sim/__tests__/scripted";

// Honest Failover runs for the verifier and route tests: a day played live the way the page
// plays it, recorded as a proof.

export interface Recorded {
  proof: string;
  log: LoggedAction[];
  score: number;
  ticks: number;
  seconds: number;
  actions: number;
  endReason: string;
}

/**
 * Play a day the way the page does: reset, set up the incident, then make each scheduled call
 * and each scripted action as the clock reaches its tick, until the run ends or `until`.
 */
export function record(
  day: string,
  script: readonly ScriptEntry[],
  until: number = DAILY_MAX_TICKS,
): Recorded {
  const run = dailyRun(day);
  resetSim({ seed: run.seed, mode: "survival" });
  run.setup();
  let nextCall = 0;
  let nextAction = 0;
  for (;;) {
    while (
      nextCall < run.scheduled.length &&
      (run.scheduled[nextCall]?.tick ?? Infinity) <= S.tick
    ) {
      run.scheduled[nextCall++]?.run();
    }
    while (nextAction < script.length && (script[nextAction]?.[0] ?? Infinity) <= S.tick) {
      dispatch(script[nextAction++]?.[1] ?? { op: 8 });
    }
    if (S.over || S.tick >= until) break;
    step(1);
  }
  const log = structuredClone(S.log);
  const ticks = S.over ? S.over.atTick : S.tick;
  return {
    proof: encodeProof(log),
    log,
    score: scoreOf(),
    ticks,
    seconds: Math.floor(ticks / 20),
    actions: log.length,
    endReason: S.over ? S.over.reason : "time",
  };
}

export const BOARD: ScriptEntry[] = [...BOARD_S, ...MID_RUN_S];
/** The board, then the player gives up at 20 s: a short, fast, honest run. */
export const SHORT: ScriptEntry[] = [...BOARD_S, [400, { op: 8 }]];
