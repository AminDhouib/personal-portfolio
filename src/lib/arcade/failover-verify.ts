import {
  dailyReplayOptions,
  dayNumber,
  DAILY_MAX_TICKS,
} from "@/components/game/failover/daily/daily";
import { parseProof } from "@/components/game/failover/sim/proof";
import { ReplayError, replayAsync, type ReplayResult } from "@/components/game/failover/sim/replay";
import { resetSim } from "@/components/game/failover/sim/state";
import { TICK } from "@/components/game/failover/sim/config";
import { captureException } from "@/lib/log";
import { utcDayKey } from "./boards";
import type { ArcadeVerdict, ArcadeVerify } from "./games";
import { VERIFY_BUSY_REASON } from "./verify-reasons";

// Failover's Daily Incident, the real check. The page records the actions the player took; this
// plays them again from the day's seed through the same sim and accepts the score only if the
// replay ends on the claimed tick with exactly the claimed score. The sim is one module-level
// state, so replays take turns (a mutex with a short queue) and give the event loop a turn every
// 500 ticks. The player's actions are data; no code of theirs reaches the server.

/**
 * Rollout switch. While true, a replay that disagrees with a claim (or runs out of time, or
 * breaks) is reported to Sentry but the score is still accepted when it is under the plausibility
 * ceiling, so a drift between engines cannot reject honest players during the first release.
 * Malformed claims and proofs are always rejected. The change that ends the rollout is setting
 * this to false.
 */
export const SHADOW = true;

/** Replays that may wait behind the one running; a fifth caller is told to come back. */
export const MAX_WAITING = 3;

/** Ticks played between looks at the event loop. */
export const YIELD_EVERY_TICKS = 500;

/** The most a 900 s run can plausibly score: ten a second plus the points banked. */
export const MAX_PLAUSIBLE_SCORE = 10 * 900 + 200_000;

export const SHADOW_SCOPE = "arcade:failover-verify.shadow";

function reject(reason: string): ArcadeVerdict {
  return { ok: false, reason };
}

/** Under the ceilings no honest run can pass: a bound on a claim, not proof of it. */
export function isPlausible(score: number, detail: Record<string, number>): boolean {
  return (detail.seconds ?? Infinity) <= 900 && score >= 0 && score <= MAX_PLAUSIBLE_SCORE;
}

type Finding = { ok: true } | { ok: false; reason: string; soft: boolean };

const hard = (reason: string): Finding => ({ ok: false, reason, soft: false });
const soft = (reason: string): Finding => ({ ok: false, reason, soft: true });

const REPLAY_ERROR_REASON = "the proof cannot be played";

class OutOfTime extends Error {}

// ---- taking turns ------------------------------------------------------------------------

let running = false;
const waiting: Array<() => void> = [];

/** Resolves true when it is this caller's turn, false when the queue is full. */
async function takeTurn(): Promise<boolean> {
  if (!running) {
    running = true;
    return true;
  }
  if (waiting.length >= MAX_WAITING) return false;
  await new Promise<void>((resolve) => waiting.push(resolve));
  return true;
}

function endTurn(): void {
  const next = waiting.shift();
  if (next) next();
  else running = false;
}

const nextTurnOfTheEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

// ---- the check ---------------------------------------------------------------------------

/** What the replay found, set against what the run claimed. Pure. */
export function judge(
  result: ReplayResult,
  score: number,
  detail: Record<string, number>,
): Finding {
  if (result.endedAtTick !== detail.ticks) return soft("ticks do not match the replay");
  // Alive at the last tick is a finished run only when that tick is the 900 s cap.
  if (result.endReason === "time" && result.endedAtTick !== DAILY_MAX_TICKS) {
    return soft("the run was still going at that tick");
  }
  if (result.score !== score) return soft("score does not match the replay");
  return { ok: true };
}

async function check(input: Parameters<ArcadeVerify>[0]): Promise<Finding> {
  const { score, detail, proof, now, deadline } = input;
  if (proof === null) return hard("proof required");
  const today = utcDayKey(now);
  if (detail.day !== dayNumber(today)) return hard("not today's run");
  const ticks = detail.ticks ?? -1;
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > DAILY_MAX_TICKS) {
    return hard("ticks out of range");
  }
  if (detail.seconds !== Math.floor(ticks * TICK)) return hard("seconds do not match the ticks");

  const log = parseProof(proof);
  if (log === null) return hard("unreadable proof");
  if (log.length !== detail.actions) return hard("action count does not match the proof");

  if (!(await takeTurn())) return hard(VERIFY_BUSY_REASON);
  try {
    // Time spent waiting counts against the budget; do not start a replay nobody will hear of.
    if (Date.now() > deadline) return soft("ran out of time");
    const result = await replayAsync(
      { ...dailyReplayOptions(today), log, ticks },
      {
        yieldEvery: YIELD_EVERY_TICKS,
        yieldFn: async () => {
          await nextTurnOfTheEventLoop();
          if (Date.now() > deadline) throw new OutOfTime();
        },
      },
    );
    return judge(result, score, detail);
  } catch (error) {
    if (error instanceof OutOfTime) return soft("ran out of time");
    if (error instanceof ReplayError) return hard(REPLAY_ERROR_REASON);
    captureException(SHADOW_SCOPE, error);
    return soft("the replay failed");
  } finally {
    // Do not leave a finished run's state in memory between submissions.
    resetSim({ seed: "failover-idle" });
    endTurn();
  }
}

/** The verifier with the rollout switch as a parameter; tests build both settings. */
export function createFailoverVerifier({ shadow }: { shadow: boolean }): ArcadeVerify {
  return async (input) => {
    const finding = await check(input);
    if (finding.ok) return { ok: true };
    if (finding.soft && shadow && isPlausible(input.score, input.detail)) {
      captureException(SHADOW_SCOPE, new Error(`failover replay disagrees: ${finding.reason}`));
      return { ok: true };
    }
    return reject(finding.reason);
  };
}

export const verifyFailoverRun: ArcadeVerify = createFailoverVerifier({ shadow: SHADOW });
