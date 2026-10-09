import { failRequest } from "./actions";
import { CONFIG, type Destination, type TrafficType, type TrafficTypeConfig } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import { rand } from "./rng";
import type { Service } from "./service";
import { S } from "./state";
import type { Vec2 } from "./types";

/** Flight speed: a hop takes half a second of game time. */
const FLIGHT_SPEED = 2;

/**
 * One request in flight or waiting. A plain data object: no mesh, no clock.
 * The view reads `origin`, `target` and `progress` to place it.
 */
export class Request {
  readonly id: number;
  readonly type: TrafficType;
  readonly typeConfig: TrafficTypeConfig;

  /** Game-time age. Ticks every step, queued or not, so it measures the wait the board imposed. */
  age = 0;
  cached = false;
  failed = false;
  wasLate = false;
  pastSlo = false;

  /** INFERENCE only: scales the GPU batch time. 70% short (0.6-1.0), 30% long (1.8-3.0). */
  genLength = 1;

  target: Service | null = null;
  origin: Vec2;
  /** Where the request last settled. A flight starts from here. */
  position: Vec2;
  progress = 0;
  isMoving = false;

  /** Set by failRequest: the step loop removes the request on this tick. */
  removeAtTick: number | null = null;

  constructor(type: TrafficType) {
    this.id = S.nextRequestId++;
    this.type = type;
    this.typeConfig = CONFIG.trafficTypes[type];

    if (type === "INFERENCE") {
      this.genLength = rand("rolls") < 0.7 ? 0.6 + rand("rolls") * 0.4 : 1.8 + rand("rolls") * 1.2;
    }

    this.position = { x: S.internetNode.position.x, z: S.internetNode.position.z };
    this.origin = { x: this.position.x, z: this.position.z };
  }

  get isCacheable(): boolean {
    return this.typeConfig.cacheable && !this.cached;
  }

  get cacheHitRate(): number {
    return this.typeConfig.cacheHitRate;
  }

  get destination(): Destination {
    return this.typeConfig.destination;
  }

  get processingWeight(): number {
    return this.typeConfig.processingWeight;
  }

  /** The class's service-level objective in game seconds, or null when it has none. */
  get sloSec(): number | null {
    return this.typeConfig.sloSec ?? null;
  }

  flyTo(service: Service): void {
    this.origin = { x: this.position.x, z: this.position.z };
    this.target = service;
    this.progress = 0;
    this.isMoving = true;
    service.incomingCount++;
  }

  update(dt: number): void {
    this.age += dt;

    if (this.isMoving && this.target) {
      this.progress += dt * FLIGHT_SPEED;
      if (this.progress >= 1) {
        this.progress = 1;
        this.isMoving = false;
        this.position = { x: this.target.position.x, z: this.target.position.z };
        this.target.incomingCount = Math.max(0, this.target.incomingCount - 1);

        const maxQueue = this.target.config.maxQueueSize ?? 20;
        if (this.target.queue.length < maxQueue) {
          this.target.queue.push(this);
        } else {
          failRequest(this, FAIL_REASONS.QUEUE_FULL);
        }
      }
    }
  }

  /** Release the arrival slot this request holds on its target. */
  destroy(): void {
    if (this.isMoving && this.target) {
      this.target.incomingCount = Math.max(0, this.target.incomingCount - 1);
    }
  }
}
