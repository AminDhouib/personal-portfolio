// Pure objective checks over the live sim, ported from Server Survival's
// src/campaign/objectives.js (MIT, pinned 7804e59; see NOTICE). Every check reads
// the one sim state `S` and returns a boolean or a number; none writes.
//
// Upstream kept campaign-only counters on STATE.campaign. Here the sim already counts
// what the checks need (per-class completions in the income table, completions per
// finishing service in S.completedByService), so nothing is mirrored: a counter that
// is reset by resetSim cannot go stale across attempts.

import type { ServiceType, TrafficType } from "../../config";
import type { SimState } from "../../types";

function completedByClass(state: SimState): Array<[string, number]> {
  // "blocked" counts attacks the firewall stopped, which are not completions.
  return Object.entries(state.finances.income.countByType).filter(([key]) => key !== "blocked");
}

export const CampaignObjectives = {
  // ---- completion counters ----

  completedOfType(state: SimState, type: TrafficType): number {
    return state.finances.income.countByType[type] ?? 0;
  },

  totalCompleted(state: SimState): number {
    return completedByClass(state).reduce((sum, [, n]) => sum + n, 0);
  },

  totalFailures(state: SimState): number {
    return Object.values(state.failures).reduce((a, b) => a + b, 0);
  },

  failureRate(state: SimState): number {
    const completed = CampaignObjectives.totalCompleted(state);
    const failed = CampaignObjectives.totalFailures(state);
    const total = completed + failed;
    return total === 0 ? 0 : failed / total;
  },

  // ---- service introspection ----

  hasService(state: SimState, type: ServiceType): boolean {
    return state.services.some((s) => s.type === type);
  },

  countServices(state: SimState, type: ServiceType): number {
    return state.services.filter((s) => s.type === type).length;
  },

  /** True if the board holds `requiredType` and none of `forbiddenTypes`. */
  usesOnly(state: SimState, requiredType: ServiceType, forbiddenTypes: ServiceType[]): boolean {
    const types = new Set(state.services.map((s) => s.type));
    if (!types.has(requiredType)) return false;
    return forbiddenTypes.every((t) => !types.has(t));
  },

  // ---- load checks (Service.totalLoad, 0..1) ----

  maxLoadOfType(state: SimState, type: ServiceType): number {
    const loads = state.services.filter((s) => s.type === type).map((s) => s.totalLoad);
    return loads.length === 0 ? 0 : Math.max(...loads);
  },

  /**
   * Load of the single busiest service on the board, whatever its type. Level 15 is
   * deliberately type-blind: the player cannot name the bottleneck until the metrics
   * panel shows it, so the goal must not name it either.
   */
  busiestLoad(state: SimState): number {
    const loads = state.services.map((s) => s.totalLoad);
    return loads.length === 0 ? 0 : Math.max(...loads);
  },

  // ---- auto-scaling ----

  /**
   * True once an auto-scaling group of this type has actually grown a fleet, not
   * merely been switched on. Latched on purpose: hysteresis lands a freshly doubled
   * fleet at about half the scale-out threshold, so a quiet stretch legitimately
   * retires an instance again, and a live-count check would un-tick itself for
   * doing exactly what auto-scaling is for. `lastScaleAt` is stamped by the first
   * scaling action and never cleared.
   */
  fleetScaledOut(state: SimState, type: ServiceType): boolean {
    return state.services.some(
      (s) => s.type === type && s.asgEnabled && (s.instances > 1 || s.lastScaleAt > 0),
    );
  },

  // ---- finance ----

  netProfit(state: SimState): number {
    const exp = state.finances.expenses;
    const spent = exp.services + exp.upkeep + exp.repairs + exp.autoRepair + exp.mitigation;
    return state.finances.income.total - spent - exp.breach;
  },

  totalUpkeepPerSec(state: SimState): number {
    return state.services.reduce((sum, s) => sum + (s.config.upkeep ?? 0) / 60, 0);
  },

  // ---- resilience ----

  /**
   * The architecture took a real node failure (an outage event or a breaker trip) and
   * reputation stayed above `minReputation` afterwards: surviving is not "nothing
   * broke", it is "something broke and traffic kept flowing".
   */
  survivedNodeFailure(state: SimState, minReputation = 60): boolean {
    const failures = state.resilience.outages + state.resilience.trips;
    return failures > 0 && state.reputation >= minReputation;
  },

  /**
   * Requests completed while the forced region outage was dark. The outage stamps the
   * completion count at lights-out and again at lights-on, so while it is live the
   * delta grows with every completion and the objective can tick during the outage.
   */
  completedDuringRegionOutage(state: SimState): number {
    const outage = state.regionOutage;
    if (!outage) return 0;
    const now = state.requestsProcessed;
    const end = outage.active ? now : (outage.endedCompleted ?? now);
    return Math.max(0, end - outage.startedCompleted);
  },

  /** Circuit breakers that opened this session. */
  breakerTrips(state: SimState): number {
    return state.resilience.trips;
  },

  /** Inference requests that outlived an Inference Gateway deadline this session. */
  expiredRequests(state: SimState): number {
    return state.inference.expired;
  },

  /** Requests retried through a healthy peer this session. */
  retriedRequests(state: SimState): number {
    return state.resilience.retries;
  },

  /**
   * GPU bad answers across the fleet. A bad answer is a success-side event (the request
   * completed and paid, then the quality roll cost reputation), so it lives on the
   * service and is summed from the fleet, never read from the failure counters.
   */
  totalBadAnswers(state: SimState): number {
    return state.services.filter((s) => s.type === "gpu").reduce((sum, s) => sum + s.badAnswers, 0);
  },

  // ---- completions per finishing service ----

  /** Requests that FINISHED on a service of this type (Pub/Sub fan-out counts each subscriber). */
  completedByService(state: SimState, type: ServiceType): number {
    return state.completedByService[type] ?? 0;
  },

  replicaShareOfReads(state: SimState): number {
    const reads = CampaignObjectives.completedOfType(state, "READ");
    return reads === 0 ? 0 : CampaignObjectives.completedByService(state, "replica") / reads;
  },

  nosqlShareOfWrites(state: SimState): number {
    const writes = CampaignObjectives.completedOfType(state, "WRITE");
    return writes === 0 ? 0 : CampaignObjectives.completedByService(state, "nosql") / writes;
  },
};
