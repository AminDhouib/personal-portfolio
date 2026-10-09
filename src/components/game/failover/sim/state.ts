import { CONFIG, SERVICE_TYPES, type TrafficMix } from "./config";
import { seedStreams } from "./rng";
import type { Finances, GameMode, SimEvent, SimState } from "./types";

export interface ResetOptions {
  seed: string;
  mode?: GameMode;
  /** Starting money. Survival defaults to the survival budget, sandbox to the sandbox one. */
  budget?: number;
}

// Cap on queued view events. The scene drains every frame; a headless replay
// never does, and must not grow without bound.
const MAX_PENDING_EVENTS = 512;

function zeroByService(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of SERVICE_TYPES) out[type] = 0;
  return out;
}

function createFinances(): Finances {
  return {
    income: {
      byType: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, INFERENCE: 0 },
      countByType: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, INFERENCE: 0, blocked: 0 },
      requests: 0,
      blocked: 0,
      total: 0,
    },
    expenses: {
      services: 0,
      upkeep: 0,
      repairs: 0,
      autoRepair: 0,
      mitigation: 0,
      breach: 0,
      dlq: 0,
      byService: zeroByService(),
      countByService: zeroByService(),
    },
  };
}

function sandboxMix(): TrafficMix {
  const pct = CONFIG.sandbox.trafficDistribution;
  return {
    STATIC: pct.STATIC / 100,
    READ: pct.READ / 100,
    WRITE: pct.WRITE / 100,
    UPLOAD: pct.UPLOAD / 100,
    SEARCH: pct.SEARCH / 100,
    MALICIOUS: pct.MALICIOUS / 100,
    INFERENCE: pct.INFERENCE / 100,
  };
}

export function createState(opts: ResetOptions): SimState {
  const mode: GameMode = opts.mode ?? "survival";
  const sandbox = mode === "sandbox";
  const budget =
    opts.budget ?? (sandbox ? CONFIG.sandbox.defaultBudget : CONFIG.survival.startBudget);
  return {
    seed: opts.seed,
    gameMode: mode,

    tick: 0,
    elapsedGameTime: 0,
    over: null,

    money: budget,
    reputation: 100,
    requestsProcessed: 0,
    lateCompletions: 0,
    failuresByReason: {},
    failures: { STATIC: 0, READ: 0, WRITE: 0, UPLOAD: 0, SEARCH: 0, MALICIOUS: 0, INFERENCE: 0 },
    score: { total: 0, storage: 0, database: 0, maliciousBlocked: 0, penalties: 0 },
    finances: createFinances(),

    services: [],
    requests: [],
    connections: [],
    internetNode: {
      id: "internet",
      type: "internet",
      position: { x: CONFIG.internetNodeStartPos.x, z: CONFIG.internetNodeStartPos.z },
      connections: [],
    },

    spawnTimer: 0,
    currentRPS: sandbox ? CONFIG.sandbox.defaultRPS : 0.5,
    upkeepEnabled: sandbox ? CONFIG.sandbox.upkeepEnabled : true,
    autoRepairEnabled: false,
    sandboxBudget: sandbox ? budget : CONFIG.sandbox.defaultBudget,
    trafficDistribution: sandbox ? sandboxMix() : { ...CONFIG.survival.trafficDistribution },

    maliciousSpikeTicks: 0,
    maliciousSpikeActive: false,
    normalTrafficDist: null,

    intervention: {
      trafficShiftTimer: 0,
      trafficShiftActive: false,
      currentShift: null,
      originalTrafficDist: null,
      randomEventTimer: 0,
      activeEvent: null,
      eventEndTime: 0,
      eventDuration: 0,
      outageServiceId: null,
      costMultiplier: 1.0,
      trafficBurstMultiplier: 1.0,
      currentMilestoneIndex: 0,
      rpsMultiplier: 1.0,
    },

    nextServiceId: 1,
    nextRequestId: 1,
    entryRR: {},

    resilience: { trips: 0, retries: 0, outages: 0, drained: 0 },
    // No GPUs yet, so only the base grid. recomputePower() is the one writer after this.
    power: { usedKw: 0, capKw: CONFIG.power.baseCapKw },
    regionOutage: null,

    events: [],

    log: [],
    logOverflow: false,
  };
}

/**
 * The one live simulation of this JS realm. Everything that mutates the sim
 * goes through this object, and `resetSim` is the only thing that replaces its
 * contents, so a second run in the same process starts from a clean slate.
 */
export const S: SimState = createState({ seed: "failover-unseeded" });

/** Start a fresh run: wipes every field of S and re-seeds the three RNG streams. */
export function resetSim(opts: ResetOptions): void {
  for (const key of Object.keys(S)) Reflect.deleteProperty(S, key);
  Object.assign(S, createState(opts));
  seedStreams(opts.seed);
}

export function emit(event: SimEvent): void {
  if (S.events.length >= MAX_PENDING_EVENTS) S.events.splice(0, MAX_PENDING_EVENTS / 2);
  S.events.push(event);
}

/** Hand the pending events to the caller and clear the queue. */
export function drainEvents(): SimEvent[] {
  const out = S.events;
  S.events = [];
  return out;
}
