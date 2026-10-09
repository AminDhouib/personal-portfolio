import type { RandomEventType, ServiceType, TrafficMix, TrafficType } from "./config";
import type { LoggedAction } from "./action-log";
import type { FailReason, SoftBadge } from "./failure-reasons";
import type { Request } from "./request";
import type { Service } from "./service";

/** A point on the ground plane. The sim has no height. */
export interface Vec2 {
  x: number;
  z: number;
}

/** A request being processed by a service, with the time it has spent there in ms. */
export interface Job {
  req: Request;
  timer: number;
}

/** An Inference Gateway entry: the held request and the game time it was admitted. */
export interface PendingEntry {
  req: Request;
  enqueuedAt: number;
}

/**
 * What a handler tells the job loop: `next` (consumed or forwarded), `requeue-next`
 * (not consumed, try the next job) or `requeue-stop` (backpressure, stop for this step).
 */
export type HandlerOutcome = "next" | "requeue-next" | "requeue-stop";

/** closed: normal; open: routing skips the service; half-open: a few probes are let through. */
export type BreakerState = "closed" | "open" | "half-open";

export type GameMode = "survival" | "sandbox";

/** `retired` is the player ending the run on purpose (Retire in the action log). */
export type GameOverReason = "reputation" | "money" | "retired";

/** What the scene and the audio layer drain each frame. The sim only appends. */
export type SimEvent =
  | { kind: "service-placed"; id: string; type: ServiceType }
  | { kind: "service-removed"; id: string }
  | { kind: "service-upgraded"; id: string; tier: number }
  | { kind: "service-repaired"; id: string }
  | { kind: "link-added"; from: string; to: string }
  | { kind: "link-removed"; from: string; to: string }
  | {
      kind: "request-failed";
      id: number;
      reason: FailReason | null;
      serviceId: string | null;
      breach: boolean;
    }
  | { kind: "request-blocked"; id: number; serviceId: string }
  | { kind: "request-throttled"; id: number; serviceId: string | null }
  | { kind: "request-parked"; id: number; dlqId: string }
  | { kind: "request-recovered"; id: number; dlqId: string }
  | { kind: "request-retry"; id: number; serviceId: string; peerId: string }
  | { kind: "service-badge"; serviceId: string; key: SoftBadge }
  | { kind: "cache-hit"; id: number; serviceId: string }
  | { kind: "money-short" }
  | {
      kind: "warning";
      key: string;
      level: "info" | "warning" | "danger";
      params?: Record<string, string | number>;
    }
  | { kind: "event-start"; event: RandomEventType; serviceId: string | null }
  | { kind: "event-end"; event: RandomEventType }
  | { kind: "spike-start" }
  | { kind: "spike-end" }
  | { kind: "game-over"; reason: GameOverReason };

export interface Score {
  total: number;
  storage: number;
  database: number;
  maliciousBlocked: number;
  penalties: number;
}

export interface Intervention {
  trafficShiftTimer: number;
  trafficShiftActive: boolean;
  currentShift: { name: string; distribution: TrafficMix } | null;
  originalTrafficDist: TrafficMix | null;
  randomEventTimer: number;
  activeEvent: RandomEventType | null;
  eventEndTime: number;
  eventDuration: number;
  outageServiceId: string | null;
  costMultiplier: number;
  trafficBurstMultiplier: number;
  currentMilestoneIndex: number;
  rpsMultiplier: number;
}

export interface Finances {
  income: {
    byType: Record<string, number>;
    countByType: Record<string, number>;
    requests: number;
    blocked: number;
    total: number;
  };
  expenses: {
    services: number;
    upkeep: number;
    repairs: number;
    autoRepair: number;
    mitigation: number;
    breach: number;
    /** What dead-letter queue drains cost: its own line, not DDoS mitigation. */
    dlq: number;
    byService: Record<string, number>;
    countByService: Record<string, number>;
  };
}

/** Session counters the resilience mechanics keep, read by objectives and the debrief. */
export interface Resilience {
  /** Circuit breakers opened. */
  trips: number;
  /** Requests retried through a healthy peer. */
  retries: number;
  /** Outage events, random or forced. */
  outages: number;
  /** Requests a dead-letter queue recovered. */
  drained: number;
}

/** The power grid: always a derivation over the live services (see power.ts). */
export interface Power {
  usedKw: number;
  capKw: number;
}

/** A whole regional stack taken dark behind a GeoDNS front door. */
export interface RegionOutage {
  serviceIds: string[];
  /** Game time the region comes back. */
  endAtSec: number;
  active: boolean;
  /** `requestsProcessed` when the lights went out, and when they came back (null while dark). */
  startedCompleted: number;
  endedCompleted: number | null;
}

export interface Connection {
  from: string;
  to: string;
}

/** One service's rolling samples, newest last, plus the counters the next sample drains. */
export interface ServiceSeries {
  util: number[];
  queueDepth: number[];
  errorRate: number[];
  latency: number[];
  errors: number;
  successes: number;
  latencySum: number;
  latencyCount: number;
  /** Consecutive samples above the high-load alert threshold. */
  utilStreak: number;
}

/** Terminated requests in one metrics sample, for the rolling goodput window. */
export interface GoodputBucket {
  onTime: number;
  late: number;
  failed: number;
}

/** The hottest a service ever ran this run, kept even after it is demolished. */
export interface RunPeak {
  type: ServiceType;
  util: number;
  atSec: number;
}

/** The observability layer's state: sampled series, alert cooldowns, goodput window and run peaks. */
export interface MetricsState {
  /** Ticks since the last sample. */
  sampleTicks: number;
  sampleCount: number;
  series: Map<string, ServiceSeries>;
  /** "serviceId:rule" to the game time of the last fire. */
  alertCooldowns: Map<string, number>;
  peaks: Map<string, RunPeak>;
  goodput: GoodputBucket[];
  /** Outcomes since the last sample. */
  pending: GoodputBucket;
}

/** The Internet entry node: always present, never a Service. */
export interface InternetNode {
  id: "internet";
  type: "internet";
  position: Vec2;
  connections: string[];
}

export interface SimState {
  seed: string;
  gameMode: GameMode;

  /** Whole ticks since the run began. Game time is `tick * TICK`. */
  tick: number;
  elapsedGameTime: number;
  over: { reason: GameOverReason; atTick: number } | null;

  money: number;
  reputation: number;
  requestsProcessed: number;
  lateCompletions: number;
  failuresByReason: Record<string, number>;
  failures: Record<TrafficType, number>;
  score: Score;
  finances: Finances;

  services: Service[];
  requests: Request[];
  connections: Connection[];
  internetNode: InternetNode;

  spawnTimer: number;
  currentRPS: number;
  upkeepEnabled: boolean;
  autoRepairEnabled: boolean;
  sandboxBudget: number;
  trafficDistribution: TrafficMix;

  /** Ticks into the malicious-spike cycle; the cycle is counted in whole ticks. */
  maliciousSpikeTicks: number;
  maliciousSpikeActive: boolean;
  normalTrafficDist: TrafficMix | null;

  intervention: Intervention;

  /** Next number for `svc_N` and request ids. Counters, so a replay names things the same way. */
  nextServiceId: number;
  nextRequestId: number;
  /** Round-robin cursor per entry type, cleared by resetSim. */
  entryRR: Record<string, number>;

  /**
   * Completions by the type of the service that finished them (`db`, `replica`,
   * `notify`...). A campaign objective can say "reads served by the replica", which
   * the per-class income counters cannot.
   */
  completedByService: Record<string, number>;
  /**
   * A campaign level that opted in to survival's spike, traffic-shift and random-event
   * machinery (`enableSurvivalShifts`). Survival always runs it; every other mode only
   * when this is set.
   */
  scriptedEvents: boolean;

  resilience: Resilience;
  power: Power;
  /** The live or last forced region outage, null before one fires. */
  regionOutage: RegionOutage | null;
  /** AI Wave session counter: requests the Inference Gateway expired past their deadline. */
  inference: { expired: number };
  metrics: MetricsState;

  /** Pending view events. Capped, so a headless replay that never drains stays bounded. */
  events: SimEvent[];

  /** Every action the player attempted, applied or refused: the proof a replay re-plays. */
  log: LoggedAction[];
  /** More actions than the log keeps. The run stays playable but cannot be ranked. */
  logOverflow: boolean;
}
