import { expect } from "vitest";
import { CONFIG, TICK, type ServiceType, type TrafficType } from "../config";
import { Request } from "../request";
import type { Service } from "../service";
import { resetSim, S } from "../state";
import { step } from "../tick";
import type { GameMode } from "../types";
import { createConnection, createService } from "../topology";
import { routeRequestToEntry } from "../traffic";

interface WorldOptions {
  money?: number;
  mode?: GameMode;
  seed?: string;
}

let placeIndex = 0;

/**
 * A quiet world: a rich sandbox with no upkeep and no spawning, so a test drives
 * exactly the requests it injects. Pass mode "survival" for the real thing.
 */
export function resetWorld({
  money = 100000,
  mode = "sandbox",
  seed = "test-world",
}: WorldOptions = {}): void {
  resetSim({ seed, mode, budget: money });
  S.upkeepEnabled = false;
  S.currentRPS = 0;
  placeIndex = 0;
}

/** Place a service on its own tile, far from the others. */
export function place(type: ServiceType): Service {
  const service = createService(type, { x: placeIndex * 8, z: 0 });
  placeIndex++;
  if (!service) throw new Error(`place(${type}) failed (money? occupied tile?)`);
  return service;
}

export function connect(from: Service | "internet", to: Service): void {
  createConnection(from === "internet" ? "internet" : from.id, to.id);
}

/** Make a request and route it through the Internet's entry points, like a spawn. */
export function inject(type: TrafficType): Request {
  const req = new Request(type);
  S.requests.push(req);
  routeRequestToEntry(req, type);
  return req;
}

/** Advance `seconds` of game time. */
export function run(seconds: number): void {
  step(Math.round(seconds / TICK));
}

/** Send a new request straight at one service, skipping the entry routing. */
export function injectTo(service: Service, type: TrafficType): Request {
  const req = new Request(type);
  S.requests.push(req);
  req.flyTo(service);
  return req;
}

/**
 * Pin a service's utilisation. The failure roll is 2 * (load - 0.5), which is
 * exactly 1 at full load, so a pinned load of 1 fails every job deterministically.
 */
export function pinLoad(service: Service, load: number): void {
  Object.defineProperty(service, "totalLoad", { get: () => load, configurable: true });
}

/** Every failure counted so far, across traffic classes. */
export function totalFailures(): number {
  return Object.values(S.failures).reduce((sum, n) => sum + n, 0);
}

/**
 * Every request the board has accounted for: completed, failed (any class) or
 * blocked as an attack. A leak battery asserts this equals what it injected.
 */
export function accountedRequests(): number {
  const blocked = S.score.maliciousBlocked / CONFIG.survival.SCORE_POINTS.MALICIOUS_BLOCKED_SCORE;
  return S.requestsProcessed + totalFailures() + blocked;
}

/** Nothing in flight, queued, processing or still holding an arrival slot. */
export function expectDrained(): void {
  expect(S.requests).toHaveLength(0);
  for (const s of S.services) {
    expect(s.queue, `${s.type} queue`).toHaveLength(0);
    expect(s.processing, `${s.type} processing`).toHaveLength(0);
    expect(s.incomingCount, `${s.type} incoming`).toBe(0);
    expect(s.parked, `${s.type} parked`).toHaveLength(0);
    expect(
      s.partitions.reduce((n, p) => n + p.length, 0),
      `${s.type} partitions`,
    ).toBe(0);
  }
}

/** A config knob the test depends on: fail loudly if it was removed rather than comparing against undefined. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`config value missing: ${what}`);
  return value;
}
