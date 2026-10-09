import type { ServiceType, TrafficType } from "./config";
import { S } from "./state";
import type { Connection, GameOverReason, Score, Vec2 } from "./types";

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
  /** Ready instances of an auto-scaled fleet, and instances still booting. */
  instances: number;
  warming: number;
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
      instances: s.instances,
      warming: s.warming.length,
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
