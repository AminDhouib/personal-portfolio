import { failRequest } from "./actions";
import { recordBreakerFailure } from "./circuit-breaker";
import { CONFIG, type Destination, type TrafficType, type TrafficTypeConfig } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import { tickRetry } from "./retry";
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
  /** Shed by an API gateway: a soft failure that feeds neither the error rate nor the breaker. */
  throttled = false;
  /** Held in a dead-letter queue until its drain recovers it. */
  parked = false;
  /** A Pub/Sub delivery to one more subscriber: counted and costly, but the customer paid once. */
  isFanoutCopy = false;

  /** Retries spent, capped by CONFIG.resilience.maxRetries. */
  retries = 0;
  /** Game seconds of backoff left before the retry flies; above 0 the request is not in flight. */
  retryDelay = 0;
  retryTarget: Service | null = null;

  /** INFERENCE only: scales the GPU batch time. 70% short (0.6-1.0), 30% long (1.8-3.0). */
  genLength = 1;
  /** INFERENCE at a GPU: game time the request landed in the intake queue, stamped once. */
  gpuArrivedAt: number | null = null;

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
    // Age ticks BEFORE the retry early-return: a request waiting out a backoff is
    // still a request the caller is waiting for.
    this.age += dt;
    if (tickRetry(this, dt)) return;

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
          // One of the two genuine "this node is failing" signals the breaker
          // listens to: the target is so backed up it cannot accept an arrival.
          recordBreakerFailure(this.target);
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
