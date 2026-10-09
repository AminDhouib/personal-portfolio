// Stream mechanic. The Stream is the ONLY node that models HEAD-OF-LINE
// BLOCKING, the ordering-versus-throughput lesson.
//
// Records arriving in the node's queue are split, in arrival order, across
// `partitions` independent partitions (round-robin at ingress). Each partition
// is a strict FIFO: only its HEAD is ever worked, and the head forwards to the
// partition's OWN downstream consumer (partition i goes to the i-th routable
// downstream, wrapping if there are fewer downstreams than partitions). If that
// consumer is saturated the whole partition WAITS behind its head and never
// skips ahead, while the other partitions, with other consumers, keep flowing.
// One slow partition stalls its own tail but not its neighbours.
//
// It sits OUTSIDE the normal job pipeline, like the DLQ drain and the Scheduler
// source: Service.update ticks tickStream and skips processQueue for a stream, so
// nothing lands in `processing` and there is no handler registry entry for it.
//
// Every record terminates exactly once:
//   - a head with a routable-but-saturated consumer WAITS and forwards once the
//     consumer frees, so a blocked partition drains as soon as its downstream does;
//   - a head with NO routable consumer is failed (or parked in a wired DLQ) via
//     failOrPark, never left hanging;
//   - forwarded records terminate on their consumer's usual path.
// Deleting a stream node re-homes its partition records (topology.deleteObject
// adds service.partitions to the orphan set), so nothing is stranded there.

import { failOrPark } from "./actions";
import { FAIL_REASONS } from "./failure-reasons";
import { isRoutable } from "./routing";
import type { Service } from "./service";
import { S } from "./state";

// Seed the partition buckets and per-partition timers on first tick.
function ensurePartitions(service: Service): void {
  const n = Math.max(1, service.config.partitions ?? 1);
  if (service.partitions.length !== n) {
    service.partitions = Array.from({ length: n }, () => []);
    service.partitionTimers = Array.from({ length: n }, () => 0);
  }
}

// Routable downstream consumers, in a stable order (connection order).
function consumers(service: Service): Service[] {
  return service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => isRoutable(s));
}

// Can this consumer take one more record right now? Mirrors the queue-overflow
// gate in Request.update (queue plus in-flight below the node's cap).
function canAccept(target: Service): boolean {
  const maxQueue = target.config.maxQueueSize ?? 20;
  return target.queue.length + target.incomingCount < maxQueue;
}

/** Ticked once per step with the step's dt. */
export function tickStream(service: Service, dt: number): void {
  ensurePartitions(service);

  // 1) Ingest: drain the arrival queue into partitions, round-robin, so the
  //    relative order of records within a partition is their arrival order.
  for (let req = service.queue.shift(); req; req = service.queue.shift()) {
    const p = service.ingressRR % service.partitions.length;
    service.ingressRR++;
    service.partitions[p]?.push(req);
  }

  // 2) Advance each partition independently. Only the HEAD is worked; a blocked
  //    head holds the whole partition.
  const cons = consumers(service);
  for (let p = 0; p < service.partitions.length; p++) {
    const part = service.partitions[p];
    if (!part) continue;
    if (part.length === 0) {
      service.partitionTimers[p] = 0;
      continue;
    }

    const elapsed = (service.partitionTimers[p] ?? 0) + dt * 1000;
    service.partitionTimers[p] = elapsed;
    if (elapsed < service.config.processingTime) continue;

    const head = part[0];
    if (!head) continue;

    if (cons.length === 0) {
      // No consumer at all: fail the head (a wired DLQ may catch it) so it cannot
      // leak. The tail advances to the next head next step. "Partition stalled"
      // rather than "no route": what the player has to learn is that the whole
      // partition was WAITING on this one head, with everything behind it
      // blocked while the neighbouring partitions kept flowing.
      part.shift();
      service.partitionTimers[p] = 0;
      failOrPark(head, service, FAIL_REASONS.PARTITION_STALLED);
      continue;
    }

    // Each partition has its OWN consumer (wrapping if fewer consumers than
    // partitions). This is what lets one partition block while others flow.
    const target = cons[p % cons.length];
    if (target && canAccept(target)) {
      part.shift();
      service.partitionTimers[p] = 0;
      head.flyTo(target);
    }
    // Otherwise the consumer is saturated: hold the head and WAIT, never skip
    // ahead. The timer stays satisfied, so the head retries every step until the
    // consumer frees; the records behind it are stuck by design.
  }
}
