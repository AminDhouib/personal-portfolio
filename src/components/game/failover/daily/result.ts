import { TICK } from "../sim/config";
import { encodeProof } from "../sim/proof";
import { scoreOf } from "../sim/score";
import { S } from "../sim/state";

/** A finished Daily Incident, as the board needs it. */
export interface DailyResult {
  /** The UTC day of the incident, "YYYY-MM-DD". */
  day: string;
  score: number;
  /** Whole game seconds survived; the server checks it against `ticks`. */
  seconds: number;
  /** The tick the run ended on. */
  ticks: number;
  /** How many actions the proof carries. */
  actions: number;
  /** The action log as the server replays it, or null when it is too long to be ranked. */
  proof: string | null;
}

/** Read the result off the sim, once the run is over. */
export function readDailyResult(day: string): DailyResult {
  const ticks = S.over ? S.over.atTick : S.tick;
  return {
    day,
    score: scoreOf(),
    seconds: Math.floor(ticks * TICK),
    ticks,
    actions: S.log.length,
    proof: S.logOverflow ? null : encodeProof(S.log),
  };
}
