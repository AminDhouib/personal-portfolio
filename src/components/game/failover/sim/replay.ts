// Re-simulation: given a seed, a mode and a proof (the action log), play the run
// again through the same dispatch() and step() the live game used and report how
// it ended. The server accepts a score only if this reproduces it.

import { decodeAction, dispatch, MAX_LOGGED_ACTIONS, type Action } from "./action-log";
import { TICK } from "./config";
import { stateHash } from "./hash";
import { scoreOf } from "./score";
import { resetSim, S } from "./state";
import { step } from "./tick";
import type { GameMode, GameOverReason } from "./types";

export interface ReplayOptions {
  seed: string;
  mode: GameMode;
  /** Starting money; leave unset for the mode default (a daily always does). */
  budget?: number;
  /** The proof: `[tick, op, ...args]` entries, in tick order. */
  log: ReadonlyArray<readonly number[]>;
  /** How many ticks the run claims to have lasted at most (the cap, or where it ended). */
  ticks: number;
  /**
   * Changes the daily makes from outside the action log (an incident's traffic mix, its
   * timed events). `setup` runs once, right after the reset and before the first step.
   */
  setup?: () => void;
  /**
   * Calls made when the sim reaches a tick, in the order given for equal ticks, before the
   * actions of that tick. Ticks must not run backwards; one past `ticks` is never made.
   */
  scheduled?: ReadonlyArray<{ readonly tick: number; readonly run: () => void }>;
}

export interface ReplayResult {
  endedAtTick: number;
  /** Why the run ended, or "time" when it reached `ticks` still alive. */
  endReason: GameOverReason | "time";
  seconds: number;
  score: number;
  hash: number;
}

export interface AsyncReplayOptions {
  /** Ticks to play between yields. */
  yieldEvery: number;
  /** Called between chunks so the caller can let other work run. The sim has no timers of its own. */
  yieldFn: () => Promise<void>;
}

export type ReplayErrorCode = "tick-order" | "tick-range" | "unknown-op" | "bad-args" | "too-many";

/** A proof the sim refuses to play, with the first thing wrong with it. */
export class ReplayError extends Error {
  readonly code: ReplayErrorCode;
  /** Position of the offending entry in the log, or -1 for the options. */
  readonly index: number;

  constructor(code: ReplayErrorCode, index: number) {
    super(`replay rejected: ${code} at ${index}`);
    this.name = "ReplayError";
    this.code = code;
    this.index = index;
  }
}

/** Ticks per chunk of the synchronous replay. */
const CHUNK_TICKS = 500;

interface Call {
  tick: number;
  run: () => void;
}

interface Planned {
  tick: number;
  action: Action;
}

// Reject a bad proof whole, before anything plays: the sim is a singleton, and a
// half-played bad proof would leave it dirty for the next run.
function plan(opts: ReplayOptions): Planned[] {
  if (!Number.isSafeInteger(opts.ticks) || opts.ticks < 0) throw new ReplayError("tick-range", -1);

  if (opts.log.length > MAX_LOGGED_ACTIONS) throw new ReplayError("too-many", MAX_LOGGED_ACTIONS);

  const out: Planned[] = [];
  let previous = 0;
  opts.log.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length < 2) throw new ReplayError("bad-args", index);
    const tick: unknown = entry[0];
    if (typeof tick !== "number") throw new ReplayError("bad-args", index);
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > opts.ticks) {
      throw new ReplayError("tick-range", index);
    }
    if (tick < previous) throw new ReplayError("tick-order", index);
    previous = tick;

    const decoded = decodeAction(entry);
    if (!decoded.ok) throw new ReplayError(decoded.code, index);
    out.push({ tick, action: decoded.action });
  });
  return out;
}

/** A run being replayed, advanced a chunk at a time. */
interface Run {
  /** Play on to `target` (or the end of the run). Returns true once the run is over. */
  advance(target: number): boolean;
  result(): ReplayResult;
}

function begin(opts: ReplayOptions): Run {
  const actions = plan(opts);
  const calls: Call[] = (opts.scheduled ?? []).filter((call) => call.tick <= opts.ticks);
  calls.forEach((call, index) => {
    if (!Number.isSafeInteger(call.tick) || call.tick < 0)
      throw new ReplayError("tick-range", index);
    if (index > 0 && call.tick < (calls[index - 1]?.tick ?? 0)) {
      throw new ReplayError("tick-order", index);
    }
  });
  resetSim({
    seed: opts.seed,
    mode: opts.mode,
    ...(opts.budget === undefined ? {} : { budget: opts.budget }),
  });
  opts.setup?.();
  let next = 0;
  let nextCall = 0;

  return {
    advance(target) {
      for (;;) {
        // Scheduled calls come first, then everything issued at this tick, in log order.
        while (nextCall < calls.length && (calls[nextCall]?.tick ?? Infinity) <= S.tick) {
          calls[nextCall++]?.run();
        }
        while (next < actions.length && (actions[next]?.tick ?? Infinity) <= S.tick) {
          const planned = actions[next++];
          if (planned) dispatch(planned.action);
        }
        if (S.over || S.tick >= target) break;
        const due = Math.min(actions[next]?.tick ?? Infinity, calls[nextCall]?.tick ?? Infinity);
        step(Math.min(target, due) - S.tick);
      }
      return S.over !== null || S.tick >= opts.ticks;
    },
    result() {
      const endedAtTick = S.over ? S.over.atTick : S.tick;
      return {
        endedAtTick,
        endReason: S.over ? S.over.reason : "time",
        seconds: endedAtTick * TICK,
        score: scoreOf(),
        hash: stateHash(),
      };
    },
  };
}

/** Play a proof to the end, synchronously. */
export function replay(opts: ReplayOptions): ReplayResult {
  const run = begin(opts);
  let target = CHUNK_TICKS;
  while (!run.advance(Math.min(target, opts.ticks))) target += CHUNK_TICKS;
  return run.result();
}

/**
 * The same replay, in chunks of `yieldEvery` ticks with `yieldFn` awaited between
 * them. The result is identical to replay()'s: chunking only changes when other
 * work gets to run, never what the sim does.
 */
export async function replayAsync(
  opts: ReplayOptions,
  { yieldEvery, yieldFn }: AsyncReplayOptions,
): Promise<ReplayResult> {
  if (!Number.isSafeInteger(yieldEvery) || yieldEvery < 1) {
    throw new RangeError("yieldEvery must be a positive integer");
  }
  const run = begin(opts);
  let target = yieldEvery;
  while (!run.advance(Math.min(target, opts.ticks))) {
    await yieldFn();
    target += yieldEvery;
  }
  return run.result();
}
