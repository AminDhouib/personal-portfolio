import { fnv1a } from "../../password-game-2/engine/rng";
import { TICK } from "../sim/config";
import type { TrafficMix } from "../sim/config";
import { endRandomEvent, triggerRandomEvent } from "../sim/events";
import type { ReplayOptions } from "../sim/replay";
import { S } from "../sim/state";
import { type IncidentStep, type Profile, PROFILES } from "./profiles";

/**
 * The recipe version. The day's seed is this plus the UTC day key; bump it to change what a day
 * is (the profile table, the starting budget), which retires every score ranked under the old one.
 */
export const DAILY_SEED_PREFIX = "failover-daily-v1-";

/** A daily run lasts at most 900 s of game time. */
export const DAILY_MAX_SECONDS = 900;
export const DAILY_MAX_TICKS = DAILY_MAX_SECONDS / TICK;

/** 2026-10-09 to 20261009: the day as the arcade's detail carries it. */
export function dayNumber(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`not a day key: ${day}`);
  return Number(`${match[1]}${match[2]}${match[3]}`);
}

export function profileFor(day: string): Profile {
  const index = fnv1a(`${DAILY_SEED_PREFIX}${day}:profile`) % PROFILES.length;
  const profile = PROFILES[index];
  if (!profile) throw new RangeError("the profile table is empty");
  return profile;
}

/** Fix `shares`, scale the rest of `mix` to fill what is left. Mutates `mix`. */
function retilt(mix: TrafficMix, shares: TrafficMix): void {
  const fixed = Object.keys(shares) as Array<keyof TrafficMix>;
  let fixedTotal = 0;
  for (const key of fixed) fixedTotal += shares[key] ?? 0;
  const others = (Object.keys(mix) as Array<keyof TrafficMix>).filter(
    (key) => !fixed.includes(key),
  );
  let othersTotal = 0;
  for (const key of others) othersTotal += mix[key] ?? 0;
  if (othersTotal > 0) {
    const scale = (1 - fixedTotal) / othersTotal;
    for (const key of others) mix[key] = (mix[key] ?? 0) * scale;
  }
  for (const key of fixed) mix[key] = shares[key] ?? 0;
}

/** The mix an active spike or shift will restore, else the live one: where a tilt must land. */
export function baseMix(): TrafficMix {
  const iv = S.intervention;
  if (S.maliciousSpikeActive && S.normalTrafficDist) return S.normalTrafficDist;
  if (iv.trafficShiftActive && iv.originalTrafficDist) return iv.originalTrafficDist;
  return S.trafficDistribution;
}

function carryOut(step: IncidentStep): void {
  if (step.kind === "mix") retilt(baseMix(), step.shares);
  else {
    // The incident is the point of the day: a random event already running gives way to it.
    endRandomEvent();
    triggerRandomEvent(step.event, step.seconds * 1000);
  }
}

export interface DailyRun {
  day: string;
  /** The sim seed. */
  seed: string;
  profile: Profile;
  /** Make the incident's opening mix; run once, right after the reset. */
  setup: () => void;
  /** The incident's steps, by the tick they fall on. */
  scheduled: Array<{ tick: number; run: () => void }>;
}

/**
 * The day's incident, as calls on the sim. Pure: the same day gives the same run, and nothing
 * happens until `setup` and the scheduled calls are made. The live game and the server's replay
 * both make them (the replay through `dailyReplayOptions`), so they play the same day.
 */
export function dailyRun(day: string): DailyRun {
  const profile = profileFor(day);
  return {
    day,
    seed: `${DAILY_SEED_PREFIX}${day}`,
    profile,
    setup: () => retilt(S.trafficDistribution, profile.start),
    scheduled: profile.steps.map(({ atSec, step }) => ({
      tick: Math.round(atSec / TICK),
      run: () => carryOut(step),
    })),
  };
}

/** The part of a replay's options that makes it the day's run: the seed and the incident. */
export function dailyReplayOptions(
  day: string,
): Pick<ReplayOptions, "seed" | "mode" | "setup" | "scheduled"> {
  const run = dailyRun(day);
  return { seed: run.seed, mode: "survival", setup: run.setup, scheduled: run.scheduled };
}
