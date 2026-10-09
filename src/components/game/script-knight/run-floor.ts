import { decodeLog, encodeLog } from "./engine/codec";
import { dailyFloor } from "./daily";
import type { LevelConfig } from "./engine/core/level-config";
import type { LevelRef, TowerLevelRef } from "./engine/level-ref";
import {
  configForRef,
  createRun,
  type RunFailure,
  type RunResult,
  type RunStatus,
  type TurnRecord,
} from "./engine/run";
import { describeEnd, describeOutcome, type OutcomeMessage } from "./messages";
import { buildFrames, type Frame } from "./playback";
import type { ToWorker } from "./sandbox/protocol";
import type { RunOutcome } from "./sandbox/run-client";

/** What the page needs from `runInSandbox`; a test passes a fake. */
export type Runner = (
  req: Omit<ToWorker, "type">,
  onTurn: (t: number, token: string, thoughts: string[]) => void,
) => { done: Promise<RunOutcome>; cancel: () => void };

/** The warrior's name inside the engine; the sandbox worker uses the same one. */
export const WARRIOR_NAME = "Knight";

/** A floor played to its end, or as far as the code got. */
export interface FloorRun {
  ref: LevelRef;
  config: LevelConfig;
  frames: Frame[];
  status: RunStatus;
  failure: RunFailure | null;
  result: RunResult;
  log: string;
  /** Lines the player's code passed to `think`, one list per turn played. */
  thoughts: string[][];
  /** How the sandbox ended, when it did not end normally. */
  outcome: OutcomeMessage | null;
  /** How the engine ended it, when the code ran to a verdict that was not a pass. */
  end: string | null;
  /** The sandbox said it could not even try (no Worker, a compile error): nothing to replay. */
  ranNothing: boolean;
}

function toLevelRef(ref: TowerLevelRef): LevelRef {
  return { kind: "tower", tower: ref.tower, level: ref.level, epic: ref.epic };
}

/**
 * Runs the player's code on one floor in the sandbox and steps a main-thread copy of the engine
 * with each action token as it arrives, so what the page replays is a re-simulation of the log
 * and not anything the worker claims.
 */
export function startFloorRun(
  ref: TowerLevelRef,
  code: string,
  runner: Runner,
): { done: Promise<FloorRun>; cancel: () => void } {
  return startRun(configForRef(ref, WARRIOR_NAME), toLevelRef(ref), code, runner);
}

/** The same for the day's generated floor (UTC day key, "YYYY-MM-DD"). */
export function startDailyRun(
  day: string,
  code: string,
  runner: Runner,
): { done: Promise<FloorRun>; cancel: () => void } {
  return startRun(dailyFloor(day).config, { kind: "daily", day }, code, runner);
}

function startRun(
  config: LevelConfig,
  ref: LevelRef,
  code: string,
  runner: Runner,
): { done: Promise<FloorRun>; cancel: () => void } {
  const run = createRun(config);
  const records: TurnRecord[] = [];
  const thoughts: string[][] = [];

  const handle = runner({ code, language: "javascript", level: ref }, (_t, token, turnThoughts) => {
    const action = decodeLog(`1:${token}`)?.[0];
    if (action === undefined) throw new Error("The sandbox sent an action the log cannot hold.");
    const stepped = run.step(action);
    // A failed step ends the run as a crash in the run client, which reports it once.
    if (!stepped.ok)
      throw new Error(`The engine refused the sandbox's action: ${stepped.reason.kind}`);
    records.push(stepped.record);
    thoughts.push(turnThoughts);
  });

  const done = handle.done.then((outcome): FloorRun => {
    const frames = buildFrames(config, run.initial, records);
    const ranToEnd = outcome.kind === "finished";
    return {
      ref,
      config,
      frames,
      status: run.status,
      failure: run.failure,
      result: run.result(),
      log: encodeLog(records.map((record) => record.action)),
      thoughts,
      outcome: describeOutcome(outcome),
      end: ranToEnd ? describeEnd(run.status, run.failure) : null,
      ranNothing: records.length === 0 && !ranToEnd,
    };
  });
  return { done, cancel: handle.cancel };
}
