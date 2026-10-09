// Auto-Scaling Group engine, the flagship compute mechanic. A Compute node with ASG
// enabled grows a fleet of instances under sustained load and shrinks it when the
// load passes:
//
//   util > targetUtil          held for sustainSec, cooldown elapsed -> boot ONE
//     OR queue pressure high   instance. It warms for warmupSec and carries NO
//                              traffic until then (the cold-start lesson: you pay
//                              for it from boot, you get capacity only later).
//   util < scaleInUtil         held for sustainSec, cooldown elapsed -> retire one
//     AND queue pressure low   instance immediately (newest first).
//
// Queue pressure is the second scaling signal: a fleet that PULLS from an upstream
// Queue caps its own intake at current capacity, so a saturated consumer reads
// comfortable utilization forever while the queue behind it grows without bound. The
// engine therefore also watches the fill ratio of every connected upstream SQS (max
// across queues) and scales out when it stays past queuePressureThreshold: the
// sim's version of target tracking on SQS ApproximateNumberOfMessages. Both signals
// feed the SAME streak accumulator, sustain window and cooldown; scale-in
// additionally requires the pressure to have dropped below HALF the threshold,
// otherwise the fleet would flap (drain a little, util still 0, retire the instance
// it just booted).
//
// The gap between the two utilization thresholds is the hysteresis that stops a
// fleet from flapping; cooldownSec caps how fast the fleet can change at all.
//
// Every timer here counts whole ticks, not float seconds: the config's seconds are
// converted once per use, so the sustain window, the cooldown and the cold start
// land on exact ticks and cannot drift with accumulated rounding. The engine is
// ticked once per step from Service.update, so it takes no dt.
//
// State lives on the Service (asgEnabled, instances, warming and the streak and
// cooldown counters, seeded for every type so capacity and upkeep math is uniform).
// The ring of satellite boxes the view draws round a fleet is derived on demand from
// that state (satellitesOf), never stored.

import { CONFIG, TICK } from "./config";
import type { Service } from "./service";
import { S } from "./state";

const ticks = (seconds: number): number => Math.round(seconds / TICK);

/**
 * ASG is the "scale out instead of scale up" counterpart to the tier upgrades.
 * Compute runs it (Serverless already auto-scales by construction), and so does the
 * Container Cluster: the same fleet mechanic with a longer node-pool warmup.
 */
export function canAutoscale(service: Service): boolean {
  return service.type === "compute" || service.type === "container";
}

// Cold-start length of a booting instance, in ticks. A Container's node pool warms
// notably longer than an ASG Compute's VM, so its scale-out lag is the
// distinguishing pain.
function warmupTicks(service: Service): number {
  const cfg = CONFIG.autoscaling;
  return ticks(service.type === "container" ? cfg.containerWarmupSec : cfg.warmupSec);
}

/**
 * Queue-depth signal: the fill ratio of the fullest upstream SQS this fleet pulls
 * from. Discovery mirrors the compute pull loop (type plus a connection into this
 * node), so the fleet scales on precisely the queues it is wired to drain. A
 * queue's backlog lives in BOTH arrays: `processing` holds the jobs parked by the
 * "requeue-next" wait-for-pull outcome, `queue` the overflow behind them.
 *
 * Deliberately NOT the pull loop's full isRoutable gate: a drowning SQS trips its
 * own breaker (its parked jobs re-roll load failures and a pull-drained queue never
 * records a success), so requiring routability would blind the signal in exactly the
 * backlog it exists to detect. Real queue metrics work the same way: the backlog is
 * reported no matter how sick the consumers are. Only a disabled queue (an outage)
 * is skipped, since its backlog is frozen and no fleet size can drain it. Reads 0
 * when the node has no upstream SQS, which keeps this signal a strict no-op for
 * every ALB-push fleet.
 */
export function upstreamQueuePressure(service: Service): number {
  let pressure = 0;
  for (const s of S.services) {
    if (s.type !== "sqs" || s.isDisabled) continue;
    if (!s.connections.includes(service.id)) continue;
    const fill = (s.queue.length + s.processing.length) / (s.config.maxQueueSize ?? 20);
    if (fill > pressure) pressure = fill;
  }
  return pressure;
}

/** Ready plus warming. Capacity counts only `instances`; upkeep counts this, because clouds bill from boot. */
export function instanceCount(service: Service): number {
  return service.instances + service.warming.length;
}

export function warmingCount(service: Service): number {
  return service.warming.length;
}

/**
 * Flip ASG on or off. Turning it OFF collapses the fleet to a single instance at
 * once (a boot in progress is cancelled), so the player gets an instant, legible
 * result and stops paying for the fleet the same step. Returns the new state, or
 * false when the service cannot autoscale at all.
 */
export function toggleAutoscaling(service: Service): boolean {
  if (!canAutoscale(service)) return false;
  service.asgEnabled = !service.asgEnabled;
  if (!service.asgEnabled) {
    service.instances = 1;
    service.warming = [];
  }
  service.asgAbove = 0;
  service.asgBelow = 0;
  service.asgCooldown = 0;
  return service.asgEnabled;
}

/** One tick of the scaling loop. The type and enabled gate live here, so the caller is one unconditional line. */
export function updateAutoscaling(service: Service): void {
  if (!service.asgEnabled || !canAutoscale(service)) return;

  const cfg = CONFIG.autoscaling;

  // Cold start: warming instances become ready (and only then count toward capacity).
  for (let i = service.warming.length - 1; i >= 0; i--) {
    const left = (service.warming[i] ?? 0) - 1;
    if (left <= 0) {
      service.warming.splice(i, 1);
      service.instances++;
    } else {
      service.warming[i] = left;
    }
  }

  service.asgCooldown = Math.max(0, service.asgCooldown - 1);

  // Utilization of the CURRENT ready fleet: totalLoad already divides by the
  // instance count, so a fleet at half load reads 0.5 however wide it is. That is
  // what makes scale-in possible at all.
  const util = service.totalLoad;
  // Second signal: a pull-based fleet never looks busy however deep the upstream
  // queue gets, so queue pressure feeds the SAME accumulator as utilization.
  const pressureThreshold = cfg.queuePressureThreshold;
  const queuePressure = upstreamQueuePressure(service);
  if (util > cfg.targetUtil || queuePressure > pressureThreshold) {
    service.asgAbove++;
    service.asgBelow = 0;
  } else if (util < cfg.scaleInUtil && queuePressure < pressureThreshold / 2) {
    // Scale-in demands BOTH quiet: half the threshold is the queue-side hysteresis
    // gap. Without it the fleet scales out on pressure, drains a little, still reads
    // util 0 and immediately retires the instance it just booted.
    service.asgBelow++;
    service.asgAbove = 0;
  } else {
    // Inside the hysteresis band neither streak survives.
    service.asgAbove = 0;
    service.asgBelow = 0;
  }

  if (service.asgCooldown > 0) return;

  const sustain = ticks(cfg.sustainSec);
  const total = instanceCount(service);
  if (service.asgAbove >= sustain && total < cfg.maxInstances) {
    service.warming.push(warmupTicks(service));
    service.asgAbove = 0;
    service.asgCooldown = ticks(cfg.cooldownSec);
    service.lastScaleAt = S.elapsedGameTime;
  } else if (service.asgBelow >= sustain && total > cfg.minInstances) {
    // Newest first: cancel a boot in progress before retiring a healthy ready
    // instance (and never drop below minInstances).
    if (service.warming.length > 0) service.warming.pop();
    else service.instances--;
    service.asgBelow = 0;
    service.asgCooldown = ticks(cfg.cooldownSec);
    service.lastScaleAt = S.elapsedGameTime;
  }
}

/**
 * Upkeep multiplier for the fleet: instance #1 at base price, every further
 * instance (ready OR warming) at instanceUpkeepFactor of it.
 */
export function upkeepInstanceFactor(service: Service): number {
  const extra = instanceCount(service) - 1;
  if (extra <= 0) return 1;
  return 1 + extra * CONFIG.autoscaling.instanceUpkeepFactor;
}

/** One box in the ring round a fleet: where it sits and whether its instance is serving yet. */
export interface Satellite {
  /** Radians round the node, counter-clockwise from +x. Plain arithmetic on the slot, no trig. */
  angle: number;
  ready: boolean;
}

/**
 * The ring of satellite boxes, one per EXTRA instance. Slots are fixed by
 * maxInstances, so existing boxes never shuffle when the fleet changes size;
 * warming instances take the last slots and read as not ready. The sim stops at the
 * angle: the view takes cos and sin of it (the sim may not, the engines are free to
 * round libm differently), which is also why the angle is stored rather than a point.
 */
export function satellitesOf(service: Service): Satellite[] {
  const want = Math.max(0, instanceCount(service) - 1);
  const slots = Math.max(1, CONFIG.autoscaling.maxInstances - 1);
  const readyExtra = Math.max(0, service.instances - 1);
  const ring: Satellite[] = [];
  for (let i = 0; i < want; i++) {
    ring.push({ angle: (i / slots) * Math.PI * 2, ready: i < readyExtra });
  }
  return ring;
}
