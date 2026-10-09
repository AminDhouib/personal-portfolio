// Inference Gateway mechanic (the AI Wave). The gateway is the ONLY node with a
// DEADLINE queue: it owns an array of { req, enqueuedAt } entries and every tick runs
// admission, grace, sweep and dispatch, in that order:
//
//   0. ADMISSION moves arrivals into the deadline array and stamps them. The gateway
//      is single-type (fail_gpu_only for anything else; MALICIOUS relabels to the
//      breach it is) and the held backlog is BOUNDED at maxQueueSize: an arrival past
//      the cap takes the QUEUE_FULL drop.
//   1. WARMUP GRACE: while every connected GPU is mid model-load the stamps slide with
//      game time. The deadline clock waits for a fleet that cannot serve anyone yet.
//      Without this the 6 s deadline is SHORTER than every tier's load (12/20/30 s)
//      and the gateway expires requests a direct-wired GPU's own bounded queue would
//      have held and served, which is worse than not buying it.
//   2. SWEEP: every entry older than deadlineSec is spliced out and failRequest()ed as
//      an SLO breach, never failOrPark (a blown deadline is not recoverable work; a
//      stale answer is worthless) and never dispatched after expiry. Splice-before-fail
//      is what makes expiry exactly-once even though the failed request lingers in the
//      fail-fade: it is already out of the array.
//   3. DISPATCH sends heads to the least-loaded routable GPU (queue + batch +
//      incomingCount). A warming or full fleet just means entries stay put, bounded by
//      maxQueueSize plus the expiry above.
//
// Why it exists (the honest pitch): a direct-wired GPU has only its tiny bounded intake,
// so during warmup or overload requests die fast; the gateway holds up to 20 with
// deadline honesty and dispatches where the batch has room. Its value is measured in
// reputation saved during those windows, not revenue.
//
// It sits OUTSIDE the normal job-dispatch pipeline: Service.update() ticks tickInfgw()
// and skips processQueue, so there is no handler registry entry for "infgw".
//
// Termination invariant: every entry terminates, dispatched to a GPU's usual path,
// expired via failRequest, or re-homed when its node dies (deleteObject folds
// `service.pending` into the orphan set; the region-outage teardown sweeps it). Ages
// are stamps against S.elapsedGameTime, the sim's own game clock.

import { failRequest } from "./actions";
import { TRAFFIC_TYPES } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import { isRoutable } from "./routing";
import type { Service } from "./service";
import { S } from "./state";

/**
 * Can this GPU take one more dispatched request right now? Mirrors the queue-overflow
 * gate in Request.update (its bounded intake, in-flight included).
 */
function canAccept(gpu: Service): boolean {
  const maxQueue = gpu.config.maxQueueSize ?? 20;
  return gpu.queue.length + gpu.incomingCount < maxQueue;
}

/** Everything the GPU is already committed to: waiting intake, the live batch, requests in flight. */
function gpuLoad(gpu: Service): number {
  return gpu.queue.length + gpu.batch.length + gpu.incomingCount;
}

/**
 * Ticked once per step from Service.update(). The ages are computed against the
 * enqueuedAt stamps, so the deadline clock is exactly the game clock; dt is only used
 * for the warmup grace.
 */
export function tickInfgw(service: Service, dt: number): void {
  const cap = service.config.maxQueueSize ?? 20;

  // 0) Admission. The breaker is deliberately NOT fed here: this admission is
  //    bookkeeping between the node's own buffers; the genuine arrival-overflow signal
  //    already fires in Request.update when the intake queue itself fills.
  while (service.queue.length > 0) {
    const req = service.queue.shift();
    if (!req) break;
    if (req.type !== TRAFFIC_TYPES.INFERENCE) {
      failRequest(req, FAIL_REASONS.GPU_ONLY);
      continue;
    }
    if (service.pending.length >= cap) {
      failRequest(req, FAIL_REASONS.QUEUE_FULL);
      continue;
    }
    service.pending.push({ req, enqueuedAt: S.elapsedGameTime });
  }

  const fleet = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => !!s && s.type === "gpu");

  // 1) Warmup grace. No connected GPUs at all is NOT a grace: with nothing to ever
  //    serve, the deadline is the only honest exit.
  if (dt > 0 && fleet.length > 0 && fleet.every((g) => g.modelLoading)) {
    for (const entry of service.pending) entry.enqueuedAt += dt;
  }

  // 2) Sweep before dispatch: expire first, so an entry that outlived its deadline is
  //    provably never sent to a GPU.
  const deadline = service.config.deadlineSec ?? 0;
  for (let i = service.pending.length - 1; i >= 0; i--) {
    const entry = service.pending[i];
    if (!entry) continue;
    if (S.elapsedGameTime - entry.enqueuedAt > deadline) {
      service.pending.splice(i, 1); // out BEFORE the fail-fade starts
      S.inference.expired++;
      service.expiredCount++;
      failRequest(entry.req, FAIL_REASONS.SLO_TIMEOUT);
    }
  }

  // 3) Dispatch heads to the least-loaded routable GPU with room. A warming GPU is not
  //    routable, a full one cannot accept; either way entries stay and keep aging
  //    toward their deadline.
  const gpus = fleet.filter((s) => isRoutable(s));
  while (service.pending.length > 0) {
    let target: Service | null = null;
    for (const gpu of gpus) {
      if (!canAccept(gpu)) continue;
      if (!target || gpuLoad(gpu) < gpuLoad(target)) target = gpu;
    }
    if (!target) break;
    const entry = service.pending.shift();
    if (!entry) break;
    entry.req.flyTo(target);
  }
}
