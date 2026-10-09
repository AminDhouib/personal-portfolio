// Things that happen to the player: malicious spikes, traffic shifts and random
// events. All timers run on game time. Anything the player should see or hear is
// pushed onto S.events as a key and params, never as prose.

import { failRequest, removeRequest } from "./actions";
import { CONFIG, TICK, TRAFFIC_TYPES, type RandomEventType } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import type { Request } from "./request";
import { rand } from "./rng";
import { emit, S } from "./state";

const SPIKE = CONFIG.survival.maliciousSpike;

// The spike cycle is counted in whole ticks, so its edges land on exact ticks
// instead of depending on how a float accumulator happened to round.
const SPIKE_INTERVAL_TICKS = Math.round(SPIKE.interval / TICK);
const SPIKE_DURATION_TICKS = Math.round(SPIKE.duration / TICK);
const SPIKE_WARNING_TICKS = Math.round(SPIKE.warningTime / TICK);

/** Random events last 30 s of game time unless told otherwise. */
const DEFAULT_EVENT_MS = 30000;
/** Chance a random-event check starts an event. */
const EVENT_CHANCE = 0.3;

// ==================== MALICIOUS SPIKE ====================

export function updateMaliciousSpike(): void {
  if (S.gameMode !== "survival") return;
  if (!SPIKE.enabled) return;

  S.maliciousSpikeTicks++;
  const cycle = S.maliciousSpikeTicks % SPIKE_INTERVAL_TICKS;

  if (cycle === SPIKE_INTERVAL_TICKS - SPIKE_WARNING_TICKS && !S.maliciousSpikeActive) {
    emit({ kind: "warning", key: "ddos_incoming", level: "danger" });
  }

  if (cycle === 0 && S.maliciousSpikeTicks > SPIKE_WARNING_TICKS) {
    startMaliciousSpike();
  }

  if (S.maliciousSpikeActive && cycle === SPIKE_DURATION_TICKS) {
    endMaliciousSpike();
  }
}

function startMaliciousSpike(): void {
  // A traffic shift in progress owns the mix; the spike waits for the next cycle.
  if (S.intervention.trafficShiftActive) return;

  S.maliciousSpikeActive = true;
  const normal = { ...S.trafficDistribution };
  S.normalTrafficDist = normal;

  const maliciousPct = SPIKE.maliciousPercent;
  const remaining = 1 - maliciousPct;

  // Guard against a mix that is already all malicious: every other share would
  // divide by zero.
  const otherTotal = 1 - (normal.MALICIOUS ?? 0);
  if (otherTotal <= 0) {
    S.trafficDistribution = { ...normal };
  } else {
    S.trafficDistribution = {
      STATIC: ((normal.STATIC ?? 0) / otherTotal) * remaining,
      READ: ((normal.READ ?? 0) / otherTotal) * remaining,
      WRITE: ((normal.WRITE ?? 0) / otherTotal) * remaining,
      UPLOAD: ((normal.UPLOAD ?? 0) / otherTotal) * remaining,
      SEARCH: ((normal.SEARCH ?? 0) / otherTotal) * remaining,
      INFERENCE: ((normal.INFERENCE ?? 0) / otherTotal) * remaining,
      MALICIOUS: maliciousPct,
    };
  }
  emit({ kind: "spike-start" });
}

function endMaliciousSpike(): void {
  S.maliciousSpikeActive = false;
  if (S.normalTrafficDist) {
    S.trafficDistribution = { ...S.normalTrafficDist };
    S.normalTrafficDist = null;
  }
  emit({ kind: "spike-end" });
}

// ==================== TRAFFIC SHIFTS ====================

export function updateTrafficShift(dt: number): void {
  if (S.gameMode !== "survival") return;
  const config = CONFIG.survival.trafficShift;
  if (!config.enabled) return;

  const iv = S.intervention;
  iv.trafficShiftTimer += dt;

  if (!iv.trafficShiftActive && iv.trafficShiftTimer >= config.interval) {
    startTrafficShift();
  }

  // The timer is reset to 0 when a shift activates, so here it measures time
  // since the shift began. (A shift delayed by a spike would otherwise end on
  // its first active frame.)
  if (iv.trafficShiftActive && iv.trafficShiftTimer >= config.duration) {
    endTrafficShift();
    iv.trafficShiftTimer = 0;
  }
}

function startTrafficShift(): void {
  if (S.maliciousSpikeActive) return;

  const iv = S.intervention;
  // The pick always consumes one draw, so the day's shift schedule does not
  // depend on whether the player owns the service a shift requires.
  const roll = rand("events");
  // A shift may require a service to exist, checked only when it is selected:
  // losing the last one mid-shift does not cancel a shift already running.
  const eligible = CONFIG.survival.trafficShift.shifts.filter(
    (shift) =>
      !("requiresService" in shift) || S.services.some((s) => s.type === shift.requiresService),
  );
  const shift = eligible[Math.floor(roll * eligible.length)];
  if (!shift) return;

  iv.currentShift = { name: shift.name, distribution: shift.distribution };
  iv.trafficShiftActive = true;
  // Reset so the end check measures duration from actual activation.
  iv.trafficShiftTimer = 0;
  iv.originalTrafficDist = { ...S.trafficDistribution };
  S.trafficDistribution = { ...shift.distribution };

  emit({ kind: "warning", key: "traffic_surging", level: "warning", params: { name: shift.name } });
}

function endTrafficShift(): void {
  const iv = S.intervention;
  iv.trafficShiftActive = false;
  if (iv.originalTrafficDist) {
    S.trafficDistribution = { ...iv.originalTrafficDist };
    iv.originalTrafficDist = null;
  }
  iv.currentShift = null;
}

// ==================== RANDOM EVENTS ====================

export function updateRandomEvents(dt: number): void {
  if (S.gameMode !== "survival") return;
  const config = CONFIG.survival.randomEvents;
  if (!config.enabled) return;

  const iv = S.intervention;
  iv.randomEventTimer += dt;

  if (iv.randomEventTimer >= config.checkInterval) {
    iv.randomEventTimer = 0;
    if (rand("events") < EVENT_CHANCE) triggerRandomEvent();
  }

  // Deadlines are game time, so a paused game cannot run an event out and a
  // fast-forward cannot stretch it.
  if (iv.activeEvent && S.elapsedGameTime >= iv.eventEndTime) {
    endRandomEvent();
  }
}

/**
 * Start a random event. With no type one is drawn from the events stream;
 * `outageServiceId` pins a SERVICE_OUTAGE to a service instead of drawing one.
 */
export function triggerRandomEvent(
  eventType: RandomEventType | null = null,
  durationMs: number = DEFAULT_EVENT_MS,
  outageServiceId: string | null = null,
): void {
  const iv = S.intervention;
  if (iv.activeEvent) return;

  const types = CONFIG.survival.randomEvents.types;
  const type = eventType ?? types[Math.floor(rand("events") * types.length)];
  if (!type) return;

  iv.activeEvent = type;
  // `durationMs` is in ms (the unit callers use); the deadline is game seconds.
  iv.eventEndTime = S.elapsedGameTime + durationMs / 1000;
  iv.eventDuration = durationMs;

  let serviceId: string | null = null;
  switch (type) {
    case "COST_SPIKE":
      emit({ kind: "warning", key: "cost_spike_warning", level: "danger" });
      iv.costMultiplier = 2.0;
      break;

    case "CAPACITY_DROP":
      emit({ kind: "warning", key: "capacity_drop_warning", level: "danger" });
      for (const s of S.services) s.tempCapacityReduction = 0.5;
      break;

    case "TRAFFIC_BURST":
      emit({ kind: "warning", key: "traffic_burst_warning", level: "warning" });
      iv.trafficBurstMultiplier = 3.0;
      break;

    case "SERVICE_OUTAGE": {
      // Always one draw, whether or not there is anything to take down, so the
      // schedule does not depend on the build.
      const roll = rand("events");
      let target = outageServiceId ? S.services.find((s) => s.id === outageServiceId) : undefined;
      if (!target) {
        const candidates = S.services.filter((s) => s.type !== "waf");
        target = candidates[Math.floor(roll * candidates.length)];
      }
      if (target) {
        // One node failure on the session counter behind survivedNodeFailure.
        S.resilience.outages++;
        iv.outageServiceId = target.id;
        target.isDisabled = true;
        serviceId = target.id;
        emit({
          kind: "warning",
          key: "service_outage_warning",
          level: "danger",
          params: { type: target.type },
        });
      }
      break;
    }
  }

  emit({ kind: "event-start", event: type, serviceId });
}

export function endRandomEvent(): void {
  const iv = S.intervention;
  const type = iv.activeEvent;
  if (!type) return;

  switch (type) {
    case "COST_SPIKE":
      iv.costMultiplier = 1.0;
      break;
    case "CAPACITY_DROP":
      for (const s of S.services) s.tempCapacityReduction = 1.0;
      break;
    case "TRAFFIC_BURST":
      iv.trafficBurstMultiplier = 1.0;
      break;
    case "SERVICE_OUTAGE":
      for (const s of S.services) s.isDisabled = false;
      iv.outageServiceId = null;
      break;
  }

  iv.activeEvent = null;
  emit({ kind: "event-end", event: type });
  emit({ kind: "warning", key: "event_ended", level: "info" });
}

// ==================== RPS MILESTONES ====================

interface Milestone {
  time: number;
  multiplier: number;
}

/**
 * The acceleration multiplier, interpolated in time rather than stepped: a step
 * would jump the target rate 25% in one frame at the three-minute mark. It starts
 * at 1.0 at t=0, hits every milestone's exact multiplier at its exact time, and
 * holds the last one forever after.
 */
export function rpsMilestoneMultiplier(t: number, milestones: readonly Milestone[]): number {
  const first = milestones[0];
  if (!first) return 1.0;
  if (t <= 0) return 1.0;

  if (t < first.time) {
    return 1.0 + (first.multiplier - 1.0) * (t / first.time);
  }
  for (let i = 0; i < milestones.length - 1; i++) {
    const a = milestones[i];
    const b = milestones[i + 1];
    if (!a || !b) continue;
    if (t < b.time) {
      const span = b.time - a.time;
      // A zero-width span is a config typo; treat it as a step, not a division by zero.
      if (span <= 0) return b.multiplier;
      return a.multiplier + (b.multiplier - a.multiplier) * ((t - a.time) / span);
    }
  }
  const last = milestones[milestones.length - 1];
  return last ? last.multiplier : 1.0;
}

/**
 * The multiplier at game time `t`, announcing each milestone as it is passed.
 * The warnings fire at the original milestone times even though the traffic
 * arrives gradually: they tell the player the next tier of pressure is in effect.
 */
export function updateRpsMilestones(t: number): number {
  const config = CONFIG.survival.rpsAcceleration;
  if (!config.enabled) return 1.0;
  const iv = S.intervention;

  const milestones = config.milestones;
  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    if (m && t >= m.time && iv.currentMilestoneIndex < i + 1) {
      iv.currentMilestoneIndex = i + 1;
      emit({
        kind: "warning",
        key: "rps_surge_warning",
        level: "danger",
        params: { multiplier: m.multiplier.toFixed(1) },
      });
    }
  }

  iv.rpsMultiplier = rpsMilestoneMultiplier(t, milestones);
  return iv.rpsMultiplier;
}

// ==================== REGION OUTAGE ====================
//
// The whole-region failure the multi-region lesson needs: where SERVICE_OUTAGE kills
// one node, this kills one ENTIRE regional stack behind a GeoDNS front door, the
// "an Availability Zone went dark" scenario that active-active exists for. It is
// triggered by the caller (a campaign layer, or a test), and every timer is game
// time. It RESTORES after its duration on purpose: failover is only half of
// active-active, and the restore is what lets the player watch traffic spread back
// across both regions.

/**
 * The service ids that die with the region behind `frontDoorId` (one direct
 * downstream of a DNS node): everything reachable from that front door that is NOT
 * reachable some other way into the graph. A shared backend wired from both regions
 * stays up, which is accurate: a database both regions talk to is not sitting in
 * the dead zone.
 */
export function computeRegionSubtree(frontDoorId: string): string[] {
  const byId = new Map(S.services.map((s) => [s.id, s]));

  // A visited set keeps this terminating even if a cycle ever appears.
  const reachableFrom = (startIds: readonly string[], blockedId: string | null): Set<string> => {
    const seen = new Set<string>();
    const stack = [...startIds];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      if (id === blockedId || seen.has(id)) continue;
      const svc = byId.get(id);
      if (!svc) continue;
      seen.add(id);
      for (const next of svc.connections) stack.push(next);
    }
    return seen;
  };

  const behindFrontDoor = reachableFrom([frontDoorId], null);
  // Every OTHER way in: the Internet remaining direct entries (the GeoDNS itself
  // among them, and walking it reaches the surviving regions stacks). Traversal is
  // blocked at the dying front door, so "reachable" means reachable WITHOUT it.
  const otherEntries = S.internetNode.connections.filter((id) => id !== frontDoorId);
  const reachableElsewhere = reachableFrom(otherEntries, frontDoorId);

  return [...behindFrontDoor].filter((id) => !reachableElsewhere.has(id));
}

// A request caught inside the dying region must terminate now, not sit in a dead
// queue. Non-MALICIOUS requests fail with REGION_DOWN; a MALICIOUS one is removed
// silently: the attack died with the region, so it neither breached nor earned the
// WAF a block.
function terminateInDeadRegion(req: Request): void {
  // A mid-air arrival holds an incomingCount slot on its target: give it back
  // before freezing the flight.
  if (req.isMoving && req.target) {
    req.target.incomingCount = Math.max(0, req.target.incomingCount - 1);
  }
  req.isMoving = false;
  if (req.type === TRAFFIC_TYPES.MALICIOUS) {
    removeRequest(req);
  } else {
    failRequest(req, FAIL_REASONS.REGION_DOWN);
  }
}

/**
 * Fire the region outage. The target is deterministic: the FIRST front door the
 * internet-wired DNS was connected to, so the player always knows which side dies.
 * Returns false (and stays inert) when there is no DNS front door to kill.
 */
export function triggerRegionOutage(durationSec: number): boolean {
  const dns = S.services.find((s) => s.type === "dns" && S.internetNode.connections.includes(s.id));
  const frontDoor = dns
    ? dns.connections.map((id) => S.services.find((s) => s.id === id)).find((s) => !!s)
    : undefined;
  if (!frontDoor) return false;

  const serviceIds = computeRegionSubtree(frontDoor.id);
  S.regionOutage = {
    serviceIds,
    endAtSec: S.elapsedGameTime + durationSec,
    active: true,
    // Completed-request watermarks for a "kept serving through the outage" check.
    startedCompleted: S.requestsProcessed,
    endedCompleted: null,
  };

  // One region outage is one node-failure event, same as SERVICE_OUTAGE.
  S.resilience.outages++;

  const dead = new Set(serviceIds);
  for (const id of serviceIds) {
    const s = S.services.find((x) => x.id === id);
    if (s) s.isDisabled = true;
  }

  // Terminate everything already inside the region: queued, processing and
  // mid-air arrivals. New traffic never enters (every routing site funnels through
  // isRoutable, which skips disabled nodes), and a retry backoff aimed here
  // re-validates its peer on expiry and fails on its own.
  for (const id of serviceIds) {
    const s = S.services.find((x) => x.id === id);
    if (!s) continue;
    const caught = [...s.queue.splice(0), ...s.processing.splice(0).map((job) => job.req)];
    for (const req of caught) terminateInDeadRegion(req);
  }
  for (const req of S.requests.slice()) {
    if (req.isMoving && req.target && dead.has(req.target.id)) terminateInDeadRegion(req);
  }

  emit({
    kind: "warning",
    key: "region_outage_warning",
    level: "danger",
    params: { type: frontDoor.type, count: serviceIds.length },
  });
  return true;
}

/**
 * Stepped every tick while an outage is active. The region is re-darkened each tick
 * because ending a random SERVICE_OUTAGE re-enables EVERY disabled service, this
 * region included.
 */
export function updateRegionOutage(): void {
  const outage = S.regionOutage;
  if (!outage?.active) return;

  for (const id of outage.serviceIds) {
    const s = S.services.find((x) => x.id === id);
    if (s && !s.isDisabled) s.isDisabled = true;
  }

  if (S.elapsedGameTime >= outage.endAtSec) endRegionOutage();
}

export function endRegionOutage(): void {
  const outage = S.regionOutage;
  if (!outage?.active) return;

  for (const id of outage.serviceIds) {
    const s = S.services.find((x) => x.id === id);
    if (!s) continue; // demolished mid-outage
    // A random SERVICE_OUTAGE may have independently picked this node; its own end
    // event owns that restore.
    if (S.intervention.activeEvent === "SERVICE_OUTAGE" && S.intervention.outageServiceId === id) {
      continue;
    }
    s.isDisabled = false;
  }

  outage.active = false;
  outage.endedCompleted = S.requestsProcessed;
  emit({ kind: "warning", key: "region_outage_restored", level: "info" });
}
