// Playing a campaign level for real, from a test, and the reference board.
//
// Ported from Server Survival's tests/helpers/campaign-play.mjs and
// reference-board.mjs (MIT, pinned 7804e59; see NOTICE). The rule these helpers keep
// is that a claim about a level comes from the level as shipped: the level's own start
// (pre-built board, budget, traffic), player placement through createService (which
// charges the money), and the sim's own tick. Nothing here touches tuning.
//
// What changed from upstream, and why it is not a retune:
//  - The step is the fixed 0.05 s tick, not a 0.1 s test frame or a 1/60 s browser one.
//  - Every roll comes from the run's seeded streams, so a seed is a string and a
//    result is reproducible on any machine, not one mulberry32 line over Math.random.
//  - A level's burst pattern waits on the controller's game-time clock, not setTimeout.

import { CONFIG, TICK, type ServiceType, type TrafficMix } from "../config";
import { Service } from "../service";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { createConnection, createService } from "../topology";
import { campaignFrame, startCampaignLevel, type CampaignRun } from "./fixtures/campaign";

// ---------------------------------------------------------------- campaign play

/** Player placement through the real path, with the real money checks active. */
export function placeAt(type: ServiceType, x: number, z: number): Service {
  const service = createService(type, { x, z });
  if (!service) throw new Error(`placement of ${type} failed (money ${Math.round(S.money)}?)`);
  return service;
}

/** The first service of a type on the board. */
export function svc(type: ServiceType): Service {
  const found = S.services.find((s) => s.type === type);
  if (!found) throw new Error(`no ${type} on the board`);
  return found;
}

/** Wire two nodes; throws when the sim refuses, so a recipe cannot silently build nothing. */
export function wire(from: Service | "internet", to: Service): void {
  const result = createConnection(from === "internet" ? from : from.id, to.id);
  if (!result.ok) {
    const fromType = from === "internet" ? from : from.type;
    throw new Error(`${fromType} -> ${to.type} was refused (${result.reason})`);
  }
}

/** Wire two nodes unless they are already wired (a pre-built edge a recipe also wants). */
export function ensureWire(from: Service | "internet", to: Service): void {
  const existing = from === "internet" ? S.internetNode.connections : from.connections;
  if (!existing.includes(to.id)) wire(from, to);
}

export interface PlayResult {
  level: number;
  seed: string;
  outcome: "win" | "lose" | null;
  /** Game seconds the level ran. */
  elapsed: number;
  failures: number;
  reputation: number;
  money: number;
  /** Why a loss was a loss. */
  failureReason: CampaignRun["failureReason"];
  bonuses: Record<string, boolean>;
}

export function totalFailures(): number {
  return Object.values(S.failures).reduce((a, b) => a + b, 0);
}

/**
 * Starts a level, runs `build`, then plays to the level's own end (or `capSec` of game
 * time). Returns what the campaign scored, never a verdict: the caller decides.
 * `onFrame` runs after each tick with the game time, for a player who acts mid-run.
 */
export function play(
  levelId: number,
  seed: string,
  build: () => void,
  { capSec = 500, onFrame }: { capSec?: number; onFrame?: (elapsed: number) => void } = {},
): PlayResult {
  const run = startCampaignLevel(levelId, seed);
  build();
  const capTicks = Math.round(capSec / TICK);
  for (let i = 0; i < capTicks; i++) {
    if (!campaignFrame(run)) break;
    onFrame?.(S.elapsedGameTime);
  }
  return {
    level: levelId,
    seed,
    outcome: run.outcome,
    elapsed: S.elapsedGameTime,
    failures: totalFailures(),
    reputation: S.reputation,
    money: S.money,
    failureReason: run.failureReason,
    bonuses: { ...run.bonusResults },
  };
}

// -------------------------------------------------------------- reference board

/**
 * The traffic mix. Fixed here rather than taken from CONFIG so a balance tweak to
 * survival's starting mix cannot silently move every baseline in the knee work.
 * MALICIOUS is included because the WAF is on the board and the reputation arithmetic
 * depends on it.
 */
export const REFERENCE_MIX: TrafficMix = {
  STATIC: 0.25,
  READ: 0.4,
  WRITE: 0.1,
  UPLOAD: 0.05,
  SEARCH: 0.1,
  MALICIOUS: 0.1,
  INFERENCE: 0,
};

export interface ReferenceBoard {
  waf: Service;
  alb: Service;
  compute: Service;
  cache: Service;
  db: Service;
  s3: Service;
  search: Service;
  cdn: Service;
  bottleneck: Service;
}

/**
 * The board a competent player HAS by minute five: every traffic type has a home,
 * nothing is upgraded, no ASG. Compute is the intended bottleneck, the node the knee
 * is about. Returns the nodes by role so a caller names its bottleneck explicitly.
 */
export function buildReferenceBoard(): ReferenceBoard {
  // Each service sits on its own tile, far from the others.
  let index = 0;
  const place = (type: ServiceType): Service => placeAt(type, index++ * 8, 0);

  const waf = place("waf");
  const alb = place("alb");
  const compute = place("compute");
  const cache = place("cache");
  const db = place("db");
  const s3 = place("s3");
  const search = place("search");
  const cdn = place("cdn");

  wire("internet", waf);
  wire(waf, alb);
  wire(alb, compute);
  wire(compute, cache);
  wire(cache, db);
  wire(compute, db);
  wire(compute, s3);
  wire(compute, search);
  wire("internet", cdn);
  wire(cdn, s3);

  return { waf, alb, compute, cache, db, s3, search, cdn, bottleneck: compute };
}

export interface SweepOptions {
  rps: number;
  seed?: string;
  seconds?: number;
  band?: readonly [number, number];
  repFloor?: number;
  upkeep?: boolean;
}

export interface SweepResult {
  rps: number;
  seed: string;
  failures: number;
  processed: number;
  minReputation: number;
  endReputation: number;
  bandResidencySec: number;
  episodes: number;
  meanDwellSec: number;
  rawBandResidencySec: number;
  rawEpisodes: number;
  rawMeanDwellSec: number;
  timeToRepSec: number | null;
  peakUtil: number;
}

// Survival's own timers (the malicious spike, traffic shifts, random events) are what
// upstream's sweep frame never ran: it held a board at a fixed RPS and measured only
// the board. This sim runs them whenever the mode is survival, so they are switched
// off for the length of a sweep and put back after.
const SURVIVAL_TIMERS = ["maliciousSpike", "trafficShift", "randomEvents"] as const;

function withQuietSurvival<T>(run: () => T): T {
  const saved = SURVIVAL_TIMERS.map((key) => CONFIG.survival[key].enabled);
  for (const key of SURVIVAL_TIMERS) Object.assign(CONFIG.survival[key], { enabled: false });
  try {
    return run();
  } finally {
    SURVIVAL_TIMERS.forEach((key, i) => {
      Object.assign(CONFIG.survival[key], { enabled: saved[i] });
    });
  }
}

/**
 * Hold the board at a fixed RPS and report what the player would experience.
 *
 * Survival mode, as upstream's default: services degrade and late answers are priced.
 * Two things survival does that a held-RPS measurement must not are undone every tick:
 * the arrival-rate ramp (the rate is pinned back) and the end of the run at zero
 * reputation (upstream's sweep kept playing a collapsed board to see how far it fell).
 */
export function sweepAt({
  rps,
  seed = "reference-sweep",
  seconds = 60,
  band = [0.9, 1.2],
  repFloor = 50,
  upkeep = false,
}: SweepOptions): SweepResult {
  return withQuietSurvival(() => {
    resetSim({ seed, mode: "survival", budget: 1e9 });
    const board = buildReferenceBoard();
    S.upkeepEnabled = upkeep;
    S.currentRPS = rps;
    S.trafficDistribution = { ...REFERENCE_MIX };
    if (S.services.length === 0) throw new Error("reference board did not build");

    const b = board.bottleneck;
    let minReputation = S.reputation;
    // Both axes are tracked, always: the raw instantaneous signal and the smoothed
    // one. Reporting only one would make a change look like it moved the world when
    // it moved the ruler.
    let bandTicks = 0;
    let episodes = 0;
    let inBand = false;
    let rawBandTicks = 0;
    let rawEpisodes = 0;
    let rawInBand = false;
    let firstFailAt: number | null = null;
    let repCrossAt: number | null = null;
    let peakUtil = 0;

    const totalTicks = Math.round(seconds / TICK);
    for (let i = 0; i < totalTicks; i++) {
      step(1);
      S.currentRPS = rps;
      S.over = null;

      const util = b.smoothedLoad * 2;
      if (util > peakUtil) peakUtil = util;
      const isIn = util > band[0] && util < band[1];
      if (isIn) {
        bandTicks++;
        if (!inBand) episodes++;
      }
      inBand = isIn;

      const rawUtil = b.totalLoad * 2;
      const rawIsIn = rawUtil > band[0] && rawUtil < band[1];
      if (rawIsIn) {
        rawBandTicks++;
        if (!rawInBand) rawEpisodes++;
      }
      rawInBand = rawIsIn;

      if (S.reputation < minReputation) minReputation = S.reputation;
      if (firstFailAt === null && totalFailures() > 0) firstFailAt = S.elapsedGameTime;
      if (repCrossAt === null && firstFailAt !== null && S.reputation <= repFloor) {
        repCrossAt = S.elapsedGameTime;
      }
    }

    const sec = (ticks: number): number => +(ticks * TICK).toFixed(2);
    return {
      rps,
      seed,
      failures: totalFailures(),
      processed: S.requestsProcessed,
      minReputation: +minReputation.toFixed(1),
      endReputation: +S.reputation.toFixed(1),
      bandResidencySec: sec(bandTicks),
      episodes,
      meanDwellSec: episodes ? +((bandTicks * TICK) / episodes).toFixed(3) : 0,
      rawBandResidencySec: sec(rawBandTicks),
      rawEpisodes,
      rawMeanDwellSec: rawEpisodes ? +((rawBandTicks * TICK) / rawEpisodes).toFixed(3) : 0,
      timeToRepSec:
        repCrossAt !== null && firstFailAt !== null ? +(repCrossAt - firstFailAt).toFixed(1) : null,
      peakUtil: +peakUtil.toFixed(3),
    };
  });
}

/** Median across seeds: robust to one unlucky run, unlike a mean. */
export function medianOf(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  const hi = v[mid] ?? 0;
  return v.length % 2 ? hi : ((v[mid - 1] ?? 0) + hi) / 2;
}

export const SEEDS = [
  "sweep-5eed",
  "sweep-1234",
  "sweep-abcd",
  "sweep-0f0f",
  "sweep-7777",
  "sweep-beef",
  "sweep-c0de",
  "sweep-2468",
];

/** Run one RPS across every seed and reduce to the medians that matter. */
export function sweepSeeds(opts: Omit<SweepOptions, "seed">) {
  const runs = SEEDS.map((seed) => sweepAt({ ...opts, seed }));
  return {
    rps: opts.rps,
    runs,
    medFailures: medianOf(runs.map((r) => r.failures)),
    medMinRep: medianOf(runs.map((r) => r.minReputation)),
    medBandSec: medianOf(runs.map((r) => r.bandResidencySec)),
    medDwell: medianOf(runs.map((r) => r.meanDwellSec)),
    seedsWithFailures: runs.filter((r) => r.failures > 0).length,
    seedsSurviving: runs.filter((r) => r.minReputation >= 80).length,
  };
}
