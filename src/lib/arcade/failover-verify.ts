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
 * Rollout switch. While true, a replay that lands close to the claim but not on it is reported to
 * Sentry and the score is still accepted, so a cross-engine drift between Chromium and Node cannot
 * reject honest players during the first release. "Close" is the DRIFT_* bound below; anything
 * further off, a malformed claim or proof, and a replay that runs out of time are always refused.
 * The change that ends the rollout is setting this to false.
 *
 * Turning it off happens at launch (T8-6), only after the golden browser test passes in CI and
 * Sentry shows no mismatches under SHADOW_SCOPE, and only with the owner's sign-off.
 */
export const SHADOW = true;

// Cross-engine drift bounds: how far a replay may land from the claim and still be taken as drift.
/** Ticks (1 s) the replay's end may differ from the claimed end. */
export const DRIFT_MAX_TICKS = 20;
/** The score allowance is the larger of this many points... */
export const DRIFT_MIN_SCORE = 50;
/** ...and this fraction of the replay's own score. */
export const DRIFT_SCORE_FRACTION = 0.02;

/**
 * Replays that may wait behind the one running; the next caller is told to come back. One running
 * plus two waiting is about 1.8 s at the worst case (0.6 s each), inside the 2000 ms budget.
 */
export const MAX_WAITING = 2;

/** Ticks played between looks at the event loop. */
export const YIELD_EVERY_TICKS = 500;

/** The most a 900 s run can plausibly score: ten a second plus the points banked. */
export const MAX_PLAUSIBLE_SCORE = 10 * 900 + 200_000;

/** The Sentry scope of every SHADOW report; the rollout is judged on this staying empty. */
export const SHADOW_SCOPE = "arcade:failover-verify.shadow";

/** One SHADOW report per reason per minute per process, so a flood of drift cannot flood Sentry. */
const REPORT_EVERY_MS = 60_000;

function reject(reason: string): ArcadeVerdict {
  return { ok: false, reason };
}

/** Under the ceilings no honest run can pass: a bound on a claim, not proof of it. */
export function isPlausible(score: number, detail: Record<string, number>): boolean {
  return (detail.seconds ?? Infinity) <= 900 && score >= 0 && score <= MAX_PLAUSIBLE_SCORE;
}

/** `drift` marks a mismatch close enough to the claim to be taken as cross-engine drift. */
type Finding = { ok: true } | { ok: false; reason: string; drift: boolean };

const refuse = (reason: string): Finding => ({ ok: false, reason, drift: false });

const REPLAY_ERROR_REASON = "the proof cannot be played";

class OutOfTime extends Error {}

// ---- reporting ---------------------------------------------------------------------------

const lastReported = new Map<string, number>();

function reportDrift(reason: string): void {
  const now = Date.now();
  const last = lastReported.get(reason);
  if (last !== undefined && now - last < REPORT_EVERY_MS) return;
  lastReported.set(reason, now);
  captureException(SHADOW_SCOPE, new Error(`failover replay disagrees: ${reason}`));
}

/** Forget what was reported; tests start each case from a quiet process. */
export function resetDriftReports(): void {
  lastReported.clear();
}

// ---- taking turns ------------------------------------------------------------------------

let running = false;
const waiting: Array<{ grant: () => void }> = [];

/** Resolves true when it is this caller's turn, false when the queue is full or time ran out. */
function takeTurn(deadline: number): Promise<boolean> {
  if (!running) {
    running = true;
    return Promise.resolve(true);
  }
  if (waiting.length >= MAX_WAITING) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const waiter = {
      grant: () => {
        clearTimeout(timer);
        resolve(true);
      },
    };
    // A waiter nobody will hear from must not hold a slot.
    const timer = setTimeout(
      () => {
        const at = waiting.indexOf(waiter);
        if (at !== -1) waiting.splice(at, 1);
        resolve(false);
      },
      Math.max(0, deadline - Date.now()),
    );
    waiting.push(waiter);
  });
}

function endTurn(): void {
  const next = waiting.shift();
  if (next) next.grant();
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
  const ticks = detail.ticks ?? -1;
  const drift =
    Math.abs(result.endedAtTick - ticks) <= DRIFT_MAX_TICKS &&
    Math.abs(result.score - score) <=
      Math.max(DRIFT_MIN_SCORE, DRIFT_SCORE_FRACTION * result.score);
  const disagree = (reason: string): Finding => ({ ok: false, reason, drift });
  if (result.endedAtTick !== ticks) return disagree("ticks do not match the replay");
  // Alive at the last tick is a finished run only when that tick is the 900 s cap.
  if (result.endReason === "time" && result.endedAtTick !== DAILY_MAX_TICKS) {
    return disagree("the run was still going at that tick");
  }
  if (result.score !== score) return disagree("score does not match the replay");
  return { ok: true };
}

async function check(input: Parameters<ArcadeVerify>[0]): Promise<Finding> {
  const { score, detail, proof, now, deadline } = input;
  if (proof === null) return refuse("proof required");
  const today = utcDayKey(now);
  if (detail.day !== dayNumber(today)) return refuse("not today's run");
  const ticks = detail.ticks ?? -1;
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > DAILY_MAX_TICKS) {
    return refuse("ticks out of range");
  }
  if (detail.seconds !== Math.floor(ticks * TICK)) return refuse("seconds do not match the ticks");

  const log = parseProof(proof);
  if (log === null) return refuse("unreadable proof");
  if (log.length !== detail.actions) return refuse("action count does not match the proof");

  // Busy covers a full queue, a deadline that passed in the line and a replay that ran long: the
  // client may retry, and none of them is ever taken as a pass.
  if (!(await takeTurn(deadline))) return refuse(VERIFY_BUSY_REASON);
  try {
    // Time spent waiting counts against the budget; do not start a replay nobody will hear of.
    if (Date.now() > deadline) return refuse(VERIFY_BUSY_REASON);
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
    if (error instanceof OutOfTime) return refuse(VERIFY_BUSY_REASON);
    if (error instanceof ReplayError) return refuse(REPLAY_ERROR_REASON);
    captureException(SHADOW_SCOPE, error);
    return refuse("the replay failed");
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
    if (finding.drift && shadow && isPlausible(input.score, input.detail)) {
      reportDrift(finding.reason);
      return { ok: true };
    }
    return reject(finding.reason);
  };
}

export const verifyFailoverRun: ArcadeVerify = createFailoverVerifier({ shadow: SHADOW });
