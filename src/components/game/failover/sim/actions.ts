// The request lifecycle: score, finish, fail, remove. Handlers and entities call
// in here; nothing here calls back into them, so the sim has no import cycle.

import { hasTrippedDownstream } from "./circuit-breaker";
import { CONFIG, TRAFFIC_TYPES } from "./config";
import { parkInDLQ } from "./dlq-park";
import { FAIL_REASONS, SOFT_BADGES, type FailReason } from "./failure-reasons";
import type { Request } from "./request";
import type { Service } from "./service";
import { emit, S } from "./state";

/** A failed request lingers this many ticks (500 ms) so the view can show it. */
export const FAIL_LINGER_TICKS = 10;

export type ScoreOutcome =
  "MALICIOUS_BLOCKED" | "MALICIOUS_PASSED" | "COMPLETED" | "FAILED" | "THROTTLED";

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
    // A fan-out copy is an extra DELIVERY of one arrival, not an extra arrival:
    // Pub/Sub mints one per additional subscriber. It is counted, it occupies
    // capacity and it can fail and cost standing, but the customer paid once, so
    // it earns nothing. Without this, subscribers were a revenue multiplier and
    // the lesson ran backwards.
    const paid = !req.isFanoutCopy;
    let reward = paid ? typeConfig.reward : 0;
    const score = paid ? typeConfig.score : 0;

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
    // reads zero. Standing follows the customer, not the delivery count, so a
    // copy earns no bonus either (a copy that FAILS still costs).
    if (paid) {
      S.reputation += req.wasLate ? points.LATE_REPUTATION : points.SUCCESS_REPUTATION;
    }
  } else if (outcome === "THROTTLED") {
    // Soft fail from API Gateway rate limiting: much less reputation loss.
    S.reputation += points.THROTTLED_REPUTATION;
  } else if (outcome === "FAILED") {
    S.reputation += points.FAIL_REPUTATION;
    // Booked into a row as well as the total, so the rows add up to the total.
    const penalty = (typeConfig.score || 5) / 2;
    S.score.penalties += penalty;
    S.score.total -= penalty;
    S.failures[req.type]++;
  }
}

/**
 * Complete a request. `service` is the node that finished it, so a late answer
 * can be badged against the node that made it wait.
 */
export function finishRequest(req: Request, service?: Service): void {
  S.requestsProcessed++;
  updateScore(req, "COMPLETED");
  // After scoring, which owns the verdict: the badge only reads the flag it set.
  if (req.wasLate && service) {
    emit({ kind: "service-badge", serviceId: service.id, key: SOFT_BADGES.SLOW });
  }
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

// A NO_ROUTE at a node whose downstream is only unreachable because its breaker
// tripped is fail-fast, not a wiring mistake: a different lesson. Resolving it
// here, rather than at every routing site, is pure relabelling since NO_ROUTE and
// CIRCUIT_OPEN fail the request identically.
function routingReason(service: Service, reason: FailReason | null): FailReason | null {
  if (reason !== FAIL_REASONS.NO_ROUTE) return reason;
  return hasTrippedDownstream(service) ? FAIL_REASONS.CIRCUIT_OPEN : reason;
}

/**
 * The single choke point every "this request finally failed AT a node" site
 * funnels through: if the failing service has a connected DLQ with room, the
 * request is PARKED there (recovered later at a cost) instead of failed.
 * `service` is the node that ran out of options. Failure sites with no node to
 * hang a DLQ off (entry routing with no Internet link, a queue overflow in
 * Request.update) call failRequest directly.
 */
export function failOrPark(req: Request, service: Service, reason: FailReason | null = null): void {
  if (parkInDLQ(req, service)) return;
  failRequest(req, routingReason(service, reason));
}

/**
 * A Notification node's overload drops are SILENT: no failure count, only a
 * fraction of the usual reputation hit accrued as dissatisfaction. The request
 * still terminates. `req.failed` keeps the job loop from scoring the dispatch as
 * a breaker success.
 */
export function notifySilentFail(req: Request, service: Service): void {
  req.failed = true;
  S.reputation -= service.config.dissatisfaction ?? 0;
  service.dissatisfactionCount++;
  removeRequest(req);
}

/**
 * Shed a request at an API gateway. Load shedding working as designed, not a
 * service error: it feeds neither the error rate nor the breaker window, and the
 * flag keeps the job loop from scoring it as a breaker success either. Lingers
 * like a failure so the view can show it.
 */
export function throttleRequest(req: Request): void {
  req.throttled = true;
  updateScore(req, "THROTTLED");
  emit({ kind: "request-throttled", id: req.id, serviceId: req.target ? req.target.id : null });
  req.removeAtTick = S.tick + FAIL_LINGER_TICKS;
}
