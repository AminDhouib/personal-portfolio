import type { RandomEventType, TrafficMix } from "../sim/config";

// The six incident profiles of the Daily Incident. Pure data: what the day's traffic looks like
// and what goes wrong, and when. daily.ts picks one from the day's seed and turns it into calls
// on the sim. Changing a profile changes every score ever ranked on a day that used it, so the
// table is pinned (daily.test.ts) and a change bumps DAILY_SEED_PREFIX.

/** What an incident does at a moment of the run. */
export type IncidentStep =
  | {
      kind: "mix";
      /** Shares to fix; the rest of the traffic is scaled to fill what is left. */
      shares: TrafficMix;
    }
  | {
      kind: "event";
      event: RandomEventType;
      /** How long it lasts, in seconds of game time. */
      seconds: number;
    };

export interface Profile {
  id: string;
  name: string;
  /** One line for the poster and the share card. */
  blurb: string;
  /** Shares fixed from the first tick; the rest is scaled to fill what is left. */
  start: TrafficMix;
  /** What happens, in order of `atSec`. */
  steps: ReadonlyArray<{ atSec: number; step: IncidentStep }>;
}

export const PROFILES: readonly Profile[] = [
  {
    id: "launch-day",
    name: "Launch day",
    blurb: "Mostly pages and reads, then a burst at two minutes.",
    start: { STATIC: 0.4, READ: 0.3 },
    steps: [{ atSec: 120, step: { kind: "event", event: "TRAFFIC_BURST", seconds: 30 } }],
  },
  {
    id: "credential-stuffing",
    name: "Credential stuffing",
    blurb: "A third of the traffic turns hostile after a minute.",
    start: {},
    steps: [{ atSec: 60, step: { kind: "mix", shares: { MALICIOUS: 0.35 } } }],
  },
  {
    id: "region-outage",
    name: "Region outage",
    blurb: "A node goes dark at three minutes.",
    start: {},
    steps: [{ atSec: 180, step: { kind: "event", event: "SERVICE_OUTAGE", seconds: 45 } }],
  },
  {
    id: "flash-sale",
    name: "Flash sale",
    blurb: "Writes pile up and costs jump at ninety seconds.",
    start: { WRITE: 0.3 },
    steps: [{ atSec: 90, step: { kind: "event", event: "COST_SPIKE", seconds: 40 } }],
  },
  {
    id: "brownout",
    name: "Brownout",
    blurb: "Capacity drops at 150 s, a burst lands at seven minutes.",
    start: {},
    steps: [
      { atSec: 150, step: { kind: "event", event: "CAPACITY_DROP", seconds: 40 } },
      { atSec: 420, step: { kind: "event", event: "TRAFFIC_BURST", seconds: 20 } },
    ],
  },
  {
    id: "data-import",
    name: "Data import",
    blurb: "Uploads and searches crowd the front, then searches take over.",
    start: { UPLOAD: 0.18, SEARCH: 0.18 },
    steps: [{ atSec: 300, step: { kind: "mix", shares: { SEARCH: 0.3 } } }],
  },
];
