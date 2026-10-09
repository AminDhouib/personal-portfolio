import { satellitesOf, type Satellite } from "./autoscaling";
import type { ServiceType, TrafficType } from "./config";
import { getRollingGoodput, hasMonitoring } from "./metrics";
import { S } from "./state";
import type { Connection, GameOverReason, Power, Score, Vec2 } from "./types";

// What the view may know about the sim. The scene draws from this and never
// reaches into the sim's own objects, so nothing the sim owns can be mutated
// from a render loop.

export interface ServiceSnapshot {
  id: string;
  type: ServiceType;
  x: number;
  z: number;
  tier: number;
  /** 0-100. */
  health: number;
  /** Smoothed load, 0 idle; 0.5 is 100% of rated capacity. */
  load: number;
  /** Requests waiting. */
  queue: number;
  /** Requests being worked on. */
  processing: number;
  /** Out of service (an outage), so it takes no traffic. */
  disabled: boolean;
  /** Auto-scaling is on. */
  asg: boolean;
  /** Ready instances of an auto-scaled fleet, and instances still booting. */
  instances: number;
  warming: number;
  /**
   * The ring of boxes round an auto-scaled fleet, one per extra instance. The angle
   * is in radians and is plain arithmetic on the slot: the sim takes no sine or
   * cosine, so the view does (x = cos(angle) * radius, z = sin(angle) * radius).
   */
  satellites: Satellite[];
  /** A GPU's model is (re)loading: it takes no traffic until it is live. */
  loading: boolean;
  /** Requests in a GPU's live batch, and in an Inference Gateway's deadline queue. */
  batch: number;
  pending: number;
  /** Bad answers a GPU has served this run. */
  badAnswers: number;
}

export interface RequestSnapshot {
  id: number;
  type: TrafficType;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** 0 at the origin, 1 at the target. */
  progress: number;
  failed: boolean;
}

export interface Snapshot {
  tick: number;
  /** Game seconds since the run began. */
  time: number;
  money: number;
  reputation: number;
  rps: number;
  score: Score;
  /** Share of the last 30 game seconds of demand answered in time, or null while the window is empty. */
  goodput: number | null;
  /** The power grid: watts drawn and supplied. */
  power: Power;
  /** Requests the Inference Gateways expired past their deadline this run. */
  expired: number;
  /** A live Monitoring node is on the board, so the metrics panel is unlocked. */
  monitoring: boolean;
  over: GameOverReason | null;
  internet: Vec2;
  services: ServiceSnapshot[];
  requests: RequestSnapshot[];
  connections: Connection[];
}

export function snapshot(): Snapshot {
  return {
    tick: S.tick,
    time: S.elapsedGameTime,
    money: S.money,
    reputation: S.reputation,
    rps: S.currentRPS,
    score: { ...S.score },
    goodput: getRollingGoodput(),
    power: { ...S.power },
    expired: S.inference.expired,
    monitoring: hasMonitoring(),
    over: S.over ? S.over.reason : null,
    internet: { ...S.internetNode.position },
    services: S.services.map((s) => ({
      id: s.id,
      type: s.type,
      x: s.position.x,
      z: s.position.z,
      tier: s.tier,
      health: s.health,
      load: s.smoothedLoad,
      queue: s.queue.length,
      processing: s.processing.length,
      disabled: s.isDisabled,
      asg: s.asgEnabled,
      instances: s.instances,
      warming: s.warming.length,
      satellites: satellitesOf(s),
      loading: s.modelLoading,
      batch: s.batch.length,
      pending: s.pending.length,
      badAnswers: s.badAnswers,
    })),
    requests: S.requests.map((r) => {
      const to = r.target ? r.target.position : r.position;
      return {
        id: r.id,
        type: r.type,
        fromX: r.origin.x,
        fromZ: r.origin.z,
        toX: to.x,
        toZ: to.z,
        progress: r.progress,
        failed: r.failed,
      };
    }),
    connections: S.connections.map((c) => ({ from: c.from, to: c.to })),
  };
}
