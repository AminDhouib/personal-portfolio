// Money that moves outside a request's own reward: upkeep scaling, auto-repair,
// and the per-invocation serverless charge.

import { CONFIG } from "./config";
import type { Service } from "./service";
import { S } from "./state";

/** Auto-repair heals this many health points per second. */
const AUTO_REPAIR_HP_PER_SEC = 5;

export function getUpkeepMultiplier(): number {
  // Two things live here. The ramp (1x to 2x over ten minutes) is a survival
  // progression mechanic. The cost spike is an EVENT, and applies wherever it
  // fires.
  const spike = S.intervention.costMultiplier;

  if (S.gameMode !== "survival") return spike;
  if (!CONFIG.survival.upkeepScaling.enabled) return spike;

  const { baseMultiplier, maxMultiplier, scaleTime } = CONFIG.survival.upkeepScaling;
  const progress = Math.min(S.elapsedGameTime / scaleTime, 1.0);
  return (baseMultiplier + (maxMultiplier - baseMultiplier) * progress) * spike;
}

export function setAutoRepair(enabled: boolean): void {
  S.autoRepairEnabled = enabled;
}

/** Money per second the auto-repair crew costs. Zero where it does nothing. */
export function getAutoRepairUpkeep(): number {
  if (!S.autoRepairEnabled) return 0;
  // Gated exactly like processAutoRepair: outside survival the healing does not
  // happen, so charging for it would bill a service the mode has switched off.
  if (S.gameMode !== "survival") return 0;

  const percent = CONFIG.survival.degradation.autoRepairCostPercent;
  const totalServiceCost = S.services.reduce((sum, s) => sum + s.config.cost, 0);
  return (totalServiceCost * percent) / 60;
}

export function processAutoRepair(dt: number): void {
  if (!S.autoRepairEnabled || S.gameMode !== "survival") return;
  if (!CONFIG.survival.degradation.enabled) return;

  for (const service of S.services) {
    if (service.health < 100) {
      service.health = Math.min(100, service.health + AUTO_REPAIR_HP_PER_SEC * dt);
    }
  }
}

/**
 * Charge one serverless invocation. A no-op for every other type, so shared
 * paths can call it unconditionally. Invocations are billed even when the
 * function errors out.
 */
export function chargeServerlessInvocation(service: Service): void {
  if (service.type !== "serverless") return;
  const cost = service.config.perRequestCost ?? 0;
  S.money -= cost;
  S.finances.expenses.upkeep += cost;
  S.finances.expenses.byService.serverless = (S.finances.expenses.byService.serverless ?? 0) + cost;
}
