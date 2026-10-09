// The campaign controller, reduced to what a headless proof needs: start a level,
// drive it frame by frame, grade it. Ported from Server Survival's
// src/campaign/campaign.js (MIT, pinned 7804e59; see NOTICE). It is test-only here;
// the player-facing campaign is T8-7. No DOM, no storage, no stars, no debrief.
//
// A level is not a game mode of its own in this sim. It is a sandbox-style board
// (nothing degrades, no survival ramp, the run never ends on its own) with upkeep on,
// the level's traffic and the level's rules layered on top by this controller.
//
// Frame order follows upstream's animate(): the controller acts first (scripted
// bursts, forced outages, objective grading), then the sim steps. The controller runs
// in front of step() rather than inside it, so it sets the clock to the instant the
// coming tick will reach, the way animate() advances the clock before the controller.
// step() recomputes the clock from the tick count, so the early write is harmless.

import { TICK } from "../../config";
import { triggerRegionOutage } from "../../events";
import { recomputePower } from "../../power";
import { Service } from "../../service";
import { emit, resetSim, S } from "../../state";
import { step } from "../../tick";
import { createConnection } from "../../topology";
import { spawnRequest } from "../../traffic";
import { CAMPAIGN_LEVELS, type CampaignLevel } from "./levels";
import { CampaignObjectives } from "./objectives";

/** A frame is one tick of game time, in the whole milliseconds the burst stagger is counted in. */
const FRAME_MS = Math.round(TICK * 1000);
/** Upstream staggers a burst's spawns 20 ms apart so they arrive as a spike, not one lump. */
const BURST_STAGGER_MS = 20;
/** Objectives are graded twice a second of game time. */
const EVAL_EVERY_TICKS = Math.round(0.5 / TICK);

export type FailureReason = "reputation" | "money" | "timeout";

export interface CampaignRun {
  readonly level: CampaignLevel;
  readonly seed: string;
  ended: boolean;
  outcome: "win" | "lose" | null;
  failureReason: FailureReason | null;
  objectiveResults: Record<string, boolean>;
  bonusResults: Record<string, boolean>;
  /** Frames this run has driven; a run only grades the world it left at exactly this tick. */
  ticks: number;
  evalTicks: number;
  burstTicks: number;
  /** The controller's millisecond clock and the burst spawns still waiting on it. */
  clockMs: number;
  pendingSpawnsMs: number[];
  outageFired: boolean;
  regionOutageFired: boolean;
}

export function levelById(id: number): CampaignLevel {
  const level = CAMPAIGN_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`no campaign level ${id}`);
  return level;
}

/**
 * Begin a level on a fresh sim: the pre-built board (bought for free, like upstream's
 * prebuild), the level's traffic and budget, paused-equivalent until the first frame.
 */
export function startCampaignLevel(levelId: number, seed: string): CampaignRun {
  const level = levelById(levelId);
  resetSim({ seed, mode: "sandbox", budget: level.budget });
  S.upkeepEnabled = true;
  S.scriptedEvents = level.enableSurvivalShifts === true;

  const placed: Service[] = [];
  for (const { type, x, z } of level.preBuilt.services) {
    const service = new Service(type, { x, z });
    S.services.push(service);
    placed.push(service);
    const counts = S.finances.expenses.countByService;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  for (const [from, to] of level.preBuilt.connections) {
    const target = placed[to];
    const source = from === "internet" ? "internet" : placed[from]?.id;
    if (!target || !source) throw new Error(`L${levelId}: bad pre-built connection ${from}>${to}`);
    createConnection(source, target.id);
  }
  // The prebuild bypasses createService, so the power grid must be re-derived here.
  recomputePower();

  S.trafficDistribution = { ...level.trafficDistribution };
  S.currentRPS = level.rps;
  S.money = level.budget;

  return {
    level,
    seed,
    ended: false,
    outcome: null,
    failureReason: null,
    objectiveResults: {},
    bonusResults: {},
    ticks: 0,
    evalTicks: 0,
    burstTicks: 0,
    clockMs: 0,
    pendingSpawnsMs: [],
    outageFired: false,
    regionOutageFired: false,
  };
}

/** True while the sim is still the world this run started and has driven, and nobody else stepped it. */
export function isCurrent(run: CampaignRun): boolean {
  return S.seed === run.seed && S.tick === run.ticks;
}

function evaluateObjectives(run: CampaignRun): void {
  for (const o of run.level.objectives.primary) run.objectiveResults[o.id] = o.check(S);
  for (const o of run.level.objectives.bonus) run.bonusResults[o.id] = o.check(S);
}

function end(run: CampaignRun, outcome: "win" | "lose", reason: FailureReason | null = null): void {
  run.ended = true;
  run.outcome = outcome;
  run.failureReason = reason;
}

function checkEndConditions(run: CampaignRun): void {
  const level = run.level;
  // A win needs the level to have actually been played: level 10's primaries are true
  // on an untouched board, and without this gate it was won at t=0.5 with nothing built.
  const played = CampaignObjectives.totalCompleted(S) > 0;
  const allPrimary = level.objectives.primary.every((o) => run.objectiveResults[o.id]);
  const fail = level.failConditions;

  // Failing takes priority over winning.
  if (typeof fail.repBelow === "number" && S.reputation < fail.repBelow) {
    return end(run, "lose", "reputation");
  }
  if (typeof fail.moneyBelow === "number" && S.money < fail.moneyBelow) {
    return end(run, "lose", "money");
  }
  if (typeof fail.timeoutSec === "number" && S.elapsedGameTime >= fail.timeoutSec) {
    if (!allPrimary || !played) return end(run, "lose", "timeout");
  }
  if (allPrimary && played) end(run, "win");
}

/** Everything upstream's CampaignController.tick does, for the tick about to be stepped. */
function tickController(run: CampaignRun): void {
  const level = run.level;
  S.elapsedGameTime = (S.tick + 1) * TICK;

  // 1) Forced burst pattern: a burst's spawns are staggered 20 ms apart. Upstream hung
  // them on setTimeout; here they wait on the controller's own game-time clock.
  const burst = level.burstPattern;
  if (burst?.enabled) {
    run.burstTicks++;
    if (run.burstTicks >= Math.round(burst.intervalSec / TICK)) {
      run.burstTicks = 0;
      for (let i = 0; i < burst.burstSize; i++) {
        run.pendingSpawnsMs.push(run.clockMs + i * BURST_STAGGER_MS);
      }
    }
  }

  // 2) Forced outage: the first Firewall is knocked offline.
  if (level.forceOutageAtSec && !run.outageFired && S.elapsedGameTime >= level.forceOutageAtSec) {
    run.outageFired = true;
    const target = S.services.find((s) => s.type === "waf");
    if (target) {
      // A forced outage is still a node failure, same counter as the random one.
      S.resilience.outages++;
      target.isDisabled = true;
      emit({ kind: "warning", key: "service_outage", level: "danger" });
    }
  }

  // 2b) Forced region outage: the whole stack behind the DNS's first front door.
  const regionAt = level.forceRegionOutageAtSec;
  if (regionAt && !run.regionOutageFired && S.elapsedGameTime >= regionAt) {
    run.regionOutageFired = true;
    triggerRegionOutage(level.regionOutageDurationSec ?? 25);
  }

  // 3) Grade at 2 Hz.
  run.evalTicks++;
  if (run.evalTicks >= EVAL_EVERY_TICKS) {
    run.evalTicks = 0;
    evaluateObjectives(run);
    checkEndConditions(run);
  }

  // The timers advance after the controller acts, so a burst's first spawn (delay 0)
  // fires in the frame that scheduled it, ahead of the services' update.
  if (run.ended) return;
  run.clockMs += FRAME_MS;
  const due = run.pendingSpawnsMs.filter((t) => t <= run.clockMs);
  run.pendingSpawnsMs = run.pendingSpawnsMs.filter((t) => t > run.clockMs);
  for (let i = 0; i < due.length; i++) spawnRequest();
}

/**
 * One frame of a level. Does nothing and returns false when the run is over, or when
 * the sim is no longer the world this run started (a reset since, or someone else
 * stepping it): a controller must never grade, spawn into or step a board it does not
 * own, which is what leaving a level mid-run used to allow upstream.
 */
export function campaignFrame(run: CampaignRun): boolean {
  if (run.ended || !isCurrent(run)) return false;
  tickController(run);
  if (run.ended) return false;
  step(1);
  run.ticks++;
  return true;
}
