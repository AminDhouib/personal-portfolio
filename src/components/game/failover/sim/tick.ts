// The fixed-step driver. The sim has no clock: step() advances exactly TICK
// seconds of game time, and whoever drives it (the loop, the server replay)
// decides how many steps to take.

import { removeRequest } from "./actions";
import { CONFIG, TICK } from "./config";
import { log, pow } from "./dmath";
import { getAutoRepairUpkeep, processAutoRepair } from "./economy";
import { metricsTick } from "./metrics";
import { emit, S } from "./state";
import { spawnRequest } from "./traffic";
import {
  updateInferenceStaging,
  updateMaliciousSpike,
  updateRandomEvents,
  updateRegionOutage,
  updateRpsMilestones,
  updateTrafficShift,
} from "./events";

export { TICK };

/** A run ends when reputation reaches zero or the account is this far in debt. */
const MONEY_FLOOR = -1000;

/**
 * Exponential smoothing toward a target, calibrated so one 60 fps frame closes
 * exactly 1% of the gap. It is step-size invariant, so the ramp is the same at
 * any tick rate.
 */
export function smoothTowardsRPS(current: number, target: number, dt: number): number {
  return current + (target - current) * (1 - pow(0.99, dt * 60));
}

/** The arrival rate the survival ramp is heading for at game time `t`. */
export function calculateTargetRPS(t: number): number {
  const logGrowth = log(1 + t / 20) * 2.2;
  const linearBoost = t * 0.008; // about half a request per second per minute
  return (CONFIG.survival.baseRPS + logGrowth + linearBoost) * updateRpsMilestones(t);
}

function stepOnce(): void {
  if (S.over) return;

  S.tick++;
  S.elapsedGameTime = S.tick * TICK;
  const dt = TICK;
  updateRegionOutage();

  // A failed request lingers briefly for the view, then goes.
  for (const req of S.requests.slice()) {
    if (req.removeAtTick !== null && S.tick >= req.removeAtTick) removeRequest(req);
  }

  for (const service of S.services) service.update(dt);
  // Walk the list as it stood: removeRequest swaps in a new array, and a request
  // removed earlier this step is still stepped once, like every request before it.
  for (const req of S.requests) req.update(dt);

  S.spawnTimer += dt;
  const effectiveRPS = S.currentRPS * S.intervention.trafficBurstMultiplier;
  if (effectiveRPS > 0) {
    const spawnInterval = 1 / effectiveRPS;
    // More than one request per step at high rates.
    while (S.spawnTimer >= spawnInterval) {
      S.spawnTimer -= spawnInterval;
      spawnRequest();
    }
    // Only survival ramps up.
    if (S.gameMode === "survival") {
      const target = calculateTargetRPS(S.elapsedGameTime);
      S.currentRPS = Math.min(smoothTowardsRPS(S.currentRPS, target, dt), CONFIG.survival.maxRPS);
    }
  }

  updateMaliciousSpike();
  // Stage the survival INFERENCE base share (0 to 3% to 10%).
  updateInferenceStaging();
  updateTrafficShift(dt);
  updateRandomEvents(dt);
  processAutoRepair(dt);

  const autoRepairCost = getAutoRepairUpkeep();
  if (autoRepairCost > 0 && S.upkeepEnabled) {
    const cost = autoRepairCost * dt;
    S.money -= cost;
    S.finances.expenses.autoRepair += cost;
  }

  S.reputation = Math.min(100, S.reputation);

  // Last, so a sample sees the step's outcome. Pure bookkeeping: nothing in the sim
  // reads it back, so it cannot change how a run plays.
  metricsTick();

  if (S.gameMode === "survival" && (S.reputation <= 0 || S.money <= MONEY_FLOOR)) {
    const reason = S.reputation <= 0 ? "reputation" : "money";
    S.over = { reason, atTick: S.tick };
    emit({ kind: "game-over", reason });
  }
}

/** Advance the sim by `n` whole ticks (one by default). A finished run stays finished. */
export function step(n = 1): void {
  for (let i = 0; i < n && !S.over; i++) stepOnce();
}
