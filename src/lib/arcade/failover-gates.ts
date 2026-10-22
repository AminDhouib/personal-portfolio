import { createHash } from "node:crypto";
import { decodeAction, type LoggedAction } from "@/components/game/failover/sim/action-log";
import { CONFIG, TICK } from "@/components/game/failover/sim/config";
import type { ReplayResult } from "@/components/game/failover/sim/replay";
import { checkRateLimit } from "@/lib/rate-limit";

// What stands in front of Failover's replay. A replay costs up to about 0.6 s of CPU on a shared
// mutex, so a claim that cannot be honest must be refused without one, a claim already answered
// must not be played again, and the number of replays a client (and the process) may start in a
// minute is capped. None of this decides anything the replay would decide differently for an honest
// run: each structural gate is a fact about the sim that a run recorded by the game cannot break
// (DESIGN.md, "Failover's replay gates").

// The reasons are the ones the replay itself would have given for the same claim, so a client sees
// the same answer whether the gate or the replay refused it.
/** What the replay answers for a proof its planner refuses (sim/replay.ts, plan()). */
export const REPLAY_ERROR_REASON = "the proof cannot be played";
/** What judge() answers when the run did not end on the claimed tick. */
export const TICKS_MISMATCH_REASON = "ticks do not match the replay";

// ---- structure ---------------------------------------------------------------------------

const TICKS_PER_SECOND = Math.round(1 / TICK);

/**
 * Reputation a daily run starts with (sim/state.ts, resetSim: `reputation: 100`). A request that
 * cannot be routed costs `FAIL_REPUTATION` and nothing earns it back. Pinned in the gates test.
 */
const START_REPUTATION = 100;
/** Reputation lost to one failed request (config.ts, survival.SCORE_POINTS.FAIL_REPUTATION). */
const FAIL_REPUTATION_COST = -CONFIG.survival.SCORE_POINTS.FAIL_REPUTATION;
/**
 * The slowest arrival rate a survival run ever has, in requests a second: it starts at 0.5
 * (state.ts, `currentRPS`) and only rises, because its target is at least baseRPS = 1, never falls
 * (tick.ts, calculateTargetRPS: a nondecreasing sum times nondecreasing milestones) and the burst
 * multiplier is 1 or 3 (events.ts).
 */
const SLOWEST_RPS = 0.5;
/** Ticks of slack for the spawn clock's float accumulation (two seconds). */
const SPAWN_SLACK_TICKS = 40;

/**
 * The longest a board with no way in can last. While nothing is linked from the Internet, every
 * arriving request fails at the front door (traffic.ts, routeRequestToEntry: no entry node, a
 * NO_ROUTE failure) and costs reputation, so the run ends at the hundredth arrival, at the latest
 * 100 / 0.5 = 200 s = 4000 ticks in, whatever the day's incident does (gates test: an empty board
 * dies under this bound on every profile). A claim of more ticks than this, with no link from the
 * Internet in the log, cannot be a run the game recorded.
 */
export const NO_ENTRY_LINK_MAX_TICKS =
  (START_REPUTATION / FAIL_REPUTATION_COST / SLOWEST_RPS) * TICKS_PER_SECOND + SPAWN_SLACK_TICKS;

/**
 * Whether a log ever wires the Internet to a service that exists. The game logs only what it
 * accepted, and a service id is the count of accepted placements (state.ts nextServiceId from 1,
 * service.ts, the only `new Service` is topology.ts createService, reached by a logged op 0), so
 * an accepted link from the Internet (op 1, from 0) names a service `1..placements` so far.
 */
function linksTheInternet(log: readonly LoggedAction[]): boolean {
  let placements = 0;
  for (const entry of log) {
    if (entry[1] === 0) placements++;
    else if (entry[1] === 1 && entry[2] === 0) {
      const to = entry[3];
      if (to !== undefined && to >= 1 && to <= placements) return true;
    }
  }
  return false;
}

/**
 * A reason to refuse this claim without playing it, or null. Pure. `log` is a parsed proof, `ticks`
 * is the claimed end. Two facts, neither of which a run the game recorded can break, and neither of
 * which changes a verdict the replay (or SHADOW's drift allowance) would have given:
 *
 *  1. Every entry decodes and none is later than the claimed end. The replay plans the whole log
 *     first and refuses it on exactly these (replay.ts plan(): tick-range, bad-args, unknown-op),
 *     so this is the same answer, reached before the queue instead of after it. The game writes
 *     its log through encodeAction, which decodeAction reads back, at ticks the run reached.
 *  2. A claim of more than NO_ENTRY_LINK_MAX_TICKS needs a link from the Internet in the log. The
 *     replay would end such a board far short of the claim, by more than the drift bound.
 *
 * Not bounded here, on purpose: the score (the sim has no arrival ceiling, config.ts
 * survival.maxRPS is Infinity, and the replay judges it, with SHADOW's drift allowance), and the
 * log length against the ticks (many actions may share one tick).
 */
export function structuralReason(log: readonly LoggedAction[], ticks: number): string | null {
  for (const entry of log) {
    if (entry[0] > ticks || !decodeAction(entry).ok) return REPLAY_ERROR_REASON;
  }
  if (ticks > NO_ENTRY_LINK_MAX_TICKS && !linksTheInternet(log)) return TICKS_MISMATCH_REASON;
  return null;
}

// ---- replays already played --------------------------------------------------------------

/** Replay results kept; a result is a handful of numbers, so this is a few tens of kilobytes. */
export const RECENT_REPLAYS_MAX = 256;

// Insertion order is use order: a read moves an entry to the end, the oldest is at the front.
const recent = new Map<string, ReplayResult>();

/**
 * What identifies a replay: the day (its seed and incident), the claimed end (the replay stops
 * there) and the proof. The score is not part of it: the replay does not read the claimed score,
 * the judge does, and the judge runs afresh on a remembered result. A digest, so the proof's text
 * is not kept.
 */
export function replayKey(day: string, ticks: number, proof: string): string {
  return createHash("sha256").update(`${day}\n${ticks}\n${proof}`).digest("hex");
}

export function recentReplay(key: string): ReplayResult | undefined {
  const found = recent.get(key);
  if (found) {
    recent.delete(key);
    recent.set(key, found);
  }
  return found;
}

export function rememberReplay(key: string, result: ReplayResult): void {
  recent.delete(key);
  recent.set(key, result);
  for (const oldest of recent.keys()) {
    if (recent.size <= RECENT_REPLAYS_MAX) break;
    recent.delete(oldest);
  }
}

// ---- how many replays may start ----------------------------------------------------------

/** The window both caps count in. */
export const REPLAY_WINDOW_MS = 60_000;
/**
 * Replays one client may start a window. A player posts a finished run, now and then; six is room
 * for a few retries after a busy answer. Under the route's own 10 a minute per address.
 */
export const REPLAY_PER_CLIENT_LIMIT = 6;
/**
 * Replays the process may start a window: 30 at the 0.6 s worst case is 18 s of CPU a minute, under
 * a third of one core, and far above what real players post.
 */
export const REPLAY_GLOBAL_LIMIT = 30;

export interface Admission {
  allowed: boolean;
  /** Seconds until the caller may try again; 0 when allowed. */
  retryAfterSeconds: number;
}

// The limiter keeps its buckets for the life of the process; a test starts a new set of keys.
let generation = 0;

/** Test-only: forget the remembered replays and start both caps from zero. */
export function clearReplayCache(): void {
  recent.clear();
  generation++;
}

/**
 * Admit one replay: the client's own cap first, then the process's. A client over its own cap does
 * not spend the process's. A caller with no address (a verifier run outside a request) is held to
 * the process cap alone.
 */
export function admitReplay(client: string | undefined): Admission {
  if (client !== undefined) {
    const own = checkRateLimit(`failover-replay:${generation}:client:${client}`, {
      limit: REPLAY_PER_CLIENT_LIMIT,
      windowMs: REPLAY_WINDOW_MS,
    });
    if (!own.allowed) return own;
  }
  return checkRateLimit(`failover-replay:${generation}:all`, {
    limit: REPLAY_GLOBAL_LIMIT,
    windowMs: REPLAY_WINDOW_MS,
    // Process-wide: client-key churn must not evict it and hand the cap back (T-6262).
    global: true,
  });
}
