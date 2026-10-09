// The request lifecycle: score, finish, fail, remove. Handlers and entities call
// in here; nothing here calls back into them, so the sim has no import cycle.

import { CONFIG, TRAFFIC_TYPES } from "./config";
import { FAIL_REASONS, type FailReason } from "./failure-reasons";
import type { Request } from "./request";
import type { Service } from "./service";
import { emit, S } from "./state";

/** A failed request lingers this many ticks (500 ms) so the view can show it. */
export const FAIL_LINGER_TICKS = 10;

export type ScoreOutcome = "MALICIOUS_BLOCKED" | "MALICIOUS_PASSED" | "COMPLETED" | "FAILED";

/**
 * The chance a job fails from load alone.
 * @param load fraction of capacity in use, 0 to 1
 * @returns chance of failure, 0 to 1
 */
export function calculateFailChanceBasedOnLoad(load: number): number {
  if (load <= 0.5) return 0;
  return 2 * (load - 0.5);
}

export function flashMoney(): void {
  emit({ kind: "money-short" });
}

export function removeRequest(req: Request): void {
  req.destroy();
  S.requests = S.requests.filter((r) => r !== req);
}

export function updateScore(
  req: Request,
  outcome: ScoreOutcome,
  service: Service | null = null,
): void {
  const points = CONFIG.survival.SCORE_POINTS;
  const typeConfig = req.typeConfig;

  if (outcome === "MALICIOUS_BLOCKED") {
    S.score.maliciousBlocked += points.MALICIOUS_BLOCKED_SCORE;
    S.score.total += points.MALICIOUS_BLOCKED_SCORE;

    // Mitigation costs money.
    S.money -= points.MALICIOUS_MITIGATION_COST;
    S.finances.expenses.mitigation += points.MALICIOUS_MITIGATION_COST;
    if (service) emit({ kind: "request-blocked", id: req.id, serviceId: service.id });
  } else if (req.type === TRAFFIC_TYPES.MALICIOUS && outcome === "MALICIOUS_PASSED") {
    S.reputation += points.MALICIOUS_PASSED_REPUTATION;
    S.failures.MALICIOUS++;
    S.money -= points.MALICIOUS_BREACH_PENALTY;
    S.finances.expenses.breach += points.MALICIOUS_BREACH_PENALTY;
  } else if (outcome === "COMPLETED") {
    let reward = typeConfig.reward;
    const score = typeConfig.score;

    if (req.cached) {
      reward *= 1 + points.CACHE_HIT_BONUS;
    }

    // Lateness has a price. A completion past its class's SLO still completes
    // and is never a failure, but it is worth less. The COUNT is taken in every
    // mode; the PRICE is survival only, because req.wasLate is read back by
    // reputation.
    if (typeConfig.sloSec && req.age > typeConfig.sloSec) {
      S.lateCompletions++;
      req.pastSlo = true;
    }
    if (S.gameMode === "survival" && typeConfig.sloSec && req.age > typeConfig.sloSec) {
      // Decay toward a floor over one further SLO of lateness: a gradient, not a cliff.
      const floor = points.LATE_REWARD_FLOOR;
      const overdue = Math.min(1, (req.age - typeConfig.sloSec) / typeConfig.sloSec);
      reward *= 1 - (1 - floor) * overdue;
      req.wasLate = true;
    }

    if (typeConfig.destination === "s3" || typeConfig.destination === "cdn") {
      S.score.storage += score;
    } else if (typeConfig.destination === "db") {
      S.score.database += score;
    }

    S.score.total += score;
    S.money += reward;
    S.finances.income.requests += reward;
    S.finances.income.total += reward;
    const key = req.type;
    S.finances.income.byType[key] = (S.finances.income.byType[key] ?? 0) + reward;
    S.finances.income.countByType[key] = (S.finances.income.countByType[key] ?? 0) + 1;

    // A late completion earns the late tax INSTEAD of the success bonus, so a
    // board that serves everything late bleeds slowly while its failure counter
    // reads zero.
    S.reputation += req.wasLate ? points.LATE_REPUTATION : points.SUCCESS_REPUTATION;
  } else if (outcome === "FAILED") {
    S.reputation += points.FAIL_REPUTATION;
    // Booked into a row as well as the total, so the rows add up to the total.
    const penalty = typeConfig.score / 2;
    S.score.penalties += penalty;
    S.score.total -= penalty;
    S.failures[req.type]++;
  }
}

export function finishRequest(req: Request): void {
  S.requestsProcessed++;
  updateScore(req, "COMPLETED");
  removeRequest(req);
}

/**
 * Kill a request. `reason` is attribution for the view and the failure tally
 * only: it touches no branch and no score, so passing one cannot change which
 * requests fail. The request lingers for FAIL_LINGER_TICKS and is removed by
 * the step loop.
 */
export function failRequest(req: Request, reason: FailReason | null = null): void {
  if (reason) {
    S.failuresByReason[reason] = (S.failuresByReason[reason] ?? 0) + 1;
  }
  req.failed = true;
  const breach = req.type === TRAFFIC_TYPES.MALICIOUS;
  updateScore(req, breach ? "MALICIOUS_PASSED" : "FAILED");
  // A MALICIOUS request that gets here got through, whatever routing verdict
  // actually dropped it: the lesson is the breach.
  emit({
    kind: "request-failed",
    id: req.id,
    reason: breach ? FAIL_REASONS.BREACH : reason,
    serviceId: req.target ? req.target.id : null,
    breach,
  });
  req.removeAtTick = S.tick + FAIL_LINGER_TICKS;
}
