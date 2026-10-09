import { TICK, type ServiceType, type TrafficType } from "../config";
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
