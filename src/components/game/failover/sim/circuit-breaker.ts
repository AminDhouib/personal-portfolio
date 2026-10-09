// Circuit breaker, the resilience flagship. An upstream stops sending traffic to
// a downstream that is failing, so requests fail FAST (or reroute to a healthy
// peer) instead of piling onto a dying node:
//
//   closed     normal. Every job outcome on the service is recorded in a small
//              rolling window; an error rate over tripErrorRate across at least
//              tripMinEvents events opens it.
//   open       routing skips the service exactly as it skips a disabled one.
//              After openSec of game time it goes half-open.
//   half-open  a limited number of probes (probeCount) is let through. One probe
//              failure sends it straight back to open with the timer reset;
//              probeCount successes close it.
//
// The state lives on the Service (breakerState and friends, closed by default
// for every type, so isRoutable never null-checks). The breaker keeps its own
// outcome window on purpose: resilience must not depend on observability, so it
// works whether or not the player bought a Monitoring node.

import { CONFIG } from "./config";
import type { Service } from "./service";
import { emit, S } from "./state";

/**
 * Whether a service is wired to a downstream that is ONLINE but skipped purely
 * because its breaker is not accepting traffic: the request in front of us is
 * being shed by the breaker rather than falling off an unwired board. Read-only:
 * it only lets failOrPark relabel a NO_ROUTE as "circuit open".
 */
export function hasTrippedDownstream(service: Service): boolean {
  return S.services.some(
    (s) =>
      service.connections.includes(s.id) &&
      !s.isDisabled &&
      (s.breakerState === "open" || (s.breakerState === "half-open" && s.breakerProbes <= 0)),
  );
}

export function errorRate(service: Service): number {
  const events = service.breakerEvents;
  if (events.length === 0) return 0;
  let errors = 0;
  for (const e of events) errors += e;
  return errors / events.length;
}

function trip(service: Service): void {
  service.breakerState = "open";
  service.breakerOpenSince = 0;
  service.breakerOpenedAt = S.elapsedGameTime;
  service.breakerProbes = 0;
  service.breakerEvents = [];
  S.resilience.trips++;
  emit({
    kind: "warning",
    key: "alert_breaker_open",
    level: "danger",
    params: { type: service.type },
  });
}

function close(service: Service): void {
  service.breakerState = "closed";
  service.breakerOpenSince = 0;
  service.breakerProbes = 0;
  service.breakerEvents = [];
  emit({
    kind: "warning",
    key: "alert_breaker_closed",
    level: "info",
    params: { type: service.type },
  });
}

// One recorded job outcome. A failure comes from the load/health failure roll
// in Service.update and from Request.update when a node's queue is too full to
// accept an arrival: both mean "this node dropped work it should have handled".
// Routing dead ends (no path to the destination, the wrong service for the
// traffic type) are NOT failures here. A success is a job that left the node
// without being failed or throttled.
function recordOutcome(service: Service, isError: boolean): void {
  const cfg = CONFIG.resilience;

  if (service.breakerState === "half-open") {
    // A half-open breaker is a question, not a second chance per request: one
    // failed probe is enough to re-open it.
    if (isError) {
      trip(service);
      return;
    }
    service.breakerProbes--;
    if (service.breakerProbes <= 0) close(service);
    return;
  }

  // Open: nothing is routed here, and the stragglers already in flight say
  // nothing about recovery.
  if (service.breakerState === "open") return;

  service.breakerEvents.push(isError ? 1 : 0);
  while (service.breakerEvents.length > cfg.windowSize) service.breakerEvents.shift();

  if (service.breakerEvents.length >= cfg.tripMinEvents && errorRate(service) > cfg.tripErrorRate) {
    trip(service);
  }
}

export function recordBreakerFailure(service: Service): void {
  recordOutcome(service, true);
}

export function recordBreakerSuccess(service: Service): void {
  recordOutcome(service, false);
}

/** Only the open to half-open cooldown needs a clock; every other transition is event-driven. */
export function updateBreaker(service: Service, dt: number): void {
  if (service.breakerState !== "open") return;

  service.breakerOpenSince += dt;
  if (service.breakerOpenSince >= CONFIG.resilience.openSec) {
    service.breakerState = "half-open";
    service.breakerOpenSince = 0;
    service.breakerProbes = CONFIG.resilience.probeCount;
  }
}
