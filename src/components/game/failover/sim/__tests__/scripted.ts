// Scripted runs for the replay, leak and golden tests: boards built the way a
// player builds them (through dispatch), with real survival traffic flowing.

import { dispatch, type Action, type LoggedAction } from "../action-log";
import { stateHash } from "../hash";
import { scoreOf } from "../score";
import { resetSim, S } from "../state";
import { step } from "../tick";
import type { GameMode } from "../types";

export type ScriptEntry = readonly [tick: number, action: Action];

const at = (tick: number, ...actions: Action[]): ScriptEntry[] => actions.map((a) => [tick, a]);

// Service ids are counters, so the nth successful placement is svc_n. Each board
// fits the 500 survival budget with change to spare for a mid-run upgrade.

/** The classic stack: waf, alb, two compute, a db and a bucket. */
export const BOARD_A: ScriptEntry[] = [
  ...at(
    0,
    { op: 0, type: "waf", x: 0, z: 0 },
    { op: 0, type: "alb", x: 8, z: 0 },
    { op: 0, type: "compute", x: 16, z: -4 },
    { op: 0, type: "compute", x: 16, z: 4 },
    { op: 0, type: "db", x: 24, z: 0 },
    { op: 0, type: "s3", x: 24, z: 8 },
    { op: 1, from: "internet", to: "svc_1" },
    { op: 1, from: "svc_1", to: "svc_2" },
    { op: 1, from: "svc_2", to: "svc_3" },
    { op: 1, from: "svc_2", to: "svc_4" },
    { op: 1, from: "svc_3", to: "svc_5" },
    { op: 1, from: "svc_4", to: "svc_5" },
    { op: 1, from: "svc_3", to: "svc_6" },
    { op: 1, from: "svc_4", to: "svc_6" },
  ),
];

/** A static-heavy shape: a CDN in front of a bucket beside a cached app path. */
export const BOARD_B: ScriptEntry[] = [
  ...at(
    0,
    { op: 0, type: "cdn", x: 0, z: -8 },
    { op: 0, type: "s3", x: 8, z: -8 },
    { op: 0, type: "waf", x: 0, z: 4 },
    { op: 0, type: "alb", x: 8, z: 4 },
    { op: 0, type: "compute", x: 16, z: 4 },
    { op: 0, type: "cache", x: 24, z: 4 },
    { op: 0, type: "db", x: 32, z: 4 },
    { op: 1, from: "internet", to: "svc_1" },
    { op: 1, from: "internet", to: "svc_3" },
    { op: 1, from: "svc_1", to: "svc_2" },
    { op: 1, from: "svc_3", to: "svc_4" },
    { op: 1, from: "svc_4", to: "svc_5" },
    { op: 1, from: "svc_5", to: "svc_6" },
    { op: 1, from: "svc_6", to: "svc_7" },
    { op: 1, from: "svc_6", to: "svc_2" },
    { op: 1, from: "svc_5", to: "svc_7" },
    { op: 1, from: "svc_5", to: "svc_2" },
  ),
];

/** A firewalled API gateway front door with a compute pair that switches auto-scaling on at 15 s. */
export const BOARD_C: ScriptEntry[] = [
  ...at(
    0,
    { op: 0, type: "apigw", x: 0, z: 0 },
    { op: 0, type: "alb", x: 8, z: 0 },
    { op: 0, type: "compute", x: 16, z: -4 },
    { op: 0, type: "compute", x: 16, z: 4 },
    { op: 0, type: "db", x: 24, z: 0 },
    { op: 0, type: "s3", x: 24, z: 8 },
    { op: 0, type: "waf", x: -8, z: 0 },
    { op: 1, from: "internet", to: "svc_7" },
    { op: 1, from: "svc_7", to: "svc_1" },
    { op: 1, from: "svc_1", to: "svc_2" },
    { op: 1, from: "svc_2", to: "svc_3" },
    { op: 1, from: "svc_2", to: "svc_4" },
    { op: 1, from: "svc_3", to: "svc_5" },
    { op: 1, from: "svc_4", to: "svc_5" },
    { op: 1, from: "svc_3", to: "svc_6" },
    { op: 1, from: "svc_4", to: "svc_6" },
  ),
  ...at(300, { op: 5, id: "svc_3" }),
];

/**
 * Serverless fleet: cheap, wide, and the one shape here that lasts a full 300 s
 * on the $500 survival budget (the classic compute boards fall over by about
 * 75 s as the arrival rate ramps), so it is what the golden run plays.
 */
export const BOARD_S: ScriptEntry[] = [
  ...at(
    0,
    { op: 0, type: "waf", x: 0, z: 0 },
    { op: 0, type: "alb", x: 8, z: 0 },
    { op: 0, type: "serverless", x: 16, z: -4 },
    { op: 0, type: "serverless", x: 16, z: 4 },
    { op: 0, type: "serverless", x: 16, z: 12 },
    { op: 0, type: "db", x: 24, z: 0 },
    { op: 0, type: "s3", x: 24, z: 8 },
    { op: 1, from: "internet", to: "svc_1" },
    { op: 1, from: "svc_1", to: "svc_2" },
    { op: 1, from: "svc_2", to: "svc_3" },
    { op: 1, from: "svc_2", to: "svc_4" },
    { op: 1, from: "svc_2", to: "svc_5" },
    { op: 1, from: "svc_3", to: "svc_6" },
    { op: 1, from: "svc_4", to: "svc_6" },
    { op: 1, from: "svc_5", to: "svc_6" },
    { op: 1, from: "svc_3", to: "svc_7" },
    { op: 1, from: "svc_4", to: "svc_7" },
    { op: 1, from: "svc_5", to: "svc_7" },
  ),
];

/** What a player does to the serverless board over five minutes, one action refused on purpose. */
export const MID_RUN_S: ScriptEntry[] = [
  ...at(300, { op: 0, type: "cache", x: 32, z: 12 }),
  ...at(320, { op: 1, from: "svc_5", to: "svc_8" }, { op: 1, from: "svc_8", to: "svc_6" }),
  ...at(600, { op: 7, on: true }),
  ...at(1200, { op: 6, id: "svc_3" }),
  ...at(1500, { op: 2, from: "svc_5", to: "svc_8" }),
  ...at(2400, { op: 3, id: "svc_8" }),
  ...at(3000, { op: 5, id: "svc_3" }),
  ...at(3600, { op: 4, id: "svc_6" }),
  ...at(4800, { op: 0, type: "alb", x: 8, z: 12 }),
];

/** Things a player does while the run is on, spread over time, some of them refused. */
export const MID_RUN: ScriptEntry[] = [
  ...at(400, { op: 4, id: "svc_3" }),
  ...at(500, { op: 6, id: "svc_5" }),
  ...at(600, { op: 1, from: "svc_5", to: "svc_3" }),
  ...at(900, { op: 7, on: true }),
  ...at(1200, { op: 4, id: "svc_4" }),
  ...at(1500, { op: 0, type: "cache", x: 40, z: 0 }),
];

export interface RecordedRun {
  log: LoggedAction[];
  ticks: number;
  hash: number;
  score: number;
}

/** Play a script live: reset, apply each entry at its tick, step to `ticks`, record. */
export function play(
  seed: string,
  mode: GameMode,
  script: readonly ScriptEntry[],
  ticks: number,
): RecordedRun {
  resetSim({ seed, mode });
  for (const [tick, action] of script) {
    // Entries past the end of the run were never made.
    if (tick > ticks) break;
    if (tick > S.tick) step(tick - S.tick);
    dispatch(action);
  }
  if (ticks > S.tick) step(ticks - S.tick);
  return { log: structuredClone(S.log), ticks, hash: stateHash(), score: scoreOf() };
}
