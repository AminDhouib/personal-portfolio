import type { RandomEventType, ServiceType, TrafficMix, TrafficType } from "./config";
import type { FailReason } from "./failure-reasons";
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

/**
 * What a handler tells the job loop: `next` (consumed or forwarded), `requeue-next`
 * (not consumed, try the next job) or `requeue-stop` (backpressure, stop for this step).
 */
export type HandlerOutcome = "next" | "requeue-next" | "requeue-stop";

export type GameMode = "survival" | "sandbox";

export type GameOverReason = "reputation" | "money";

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
    byService: Record<string, number>;
    countByService: Record<string, number>;
  };
}

export interface Connection {
  from: string;
  to: string;
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

  /** Pending view events. Capped, so a headless replay that never drains stays bounded. */
  events: SimEvent[];
}
