// GPU Cluster mechanic (the AI Wave). The GPU is the ONLY node that BATCHES: it
// accumulates INFERENCE requests into `service.batch`, up to `batchSize` or
// `batchWindowSec` of game time from the FIRST arrival, and then runs the whole batch
// as ONE job of
//
//   batchTimeMs = (batchBaseMs + batchPerItemMs * n) * meanGenLength(batch)
//
// so a full batch amortizes the base cost and a lonely request pays nearly full
// price. That utilization curve is the lesson, and the profit-at-fill harness in
// ai-wave.test.ts is the authority on it.
//
// It sits OUTSIDE the normal job-dispatch pipeline (like stream, dlq and scheduler):
// Service.update() ticks tickGpu() and skips processQueue for a gpu, so nothing lands
// in `processing` and there is no handler registry entry for "gpu".
//
// MODEL COLD START: `service.modelLoading` is a DEDICATED flag, never isDisabled,
// because the event system re-enables disabled services and an outage ending would
// then cancel a model load. isRoutable() treats a loading GPU as unroutable. Held
// arrival rule: whatever is already in `gpu.queue` (including mid-air arrivals that
// land during the load) STAYS there, ages untouched, and batches normally when the
// load completes. The stall IS the lesson, and holding satisfies the termination
// invariant. Because the batch window counts from each head's true arrival, held
// requests have usually outlived it by then and fire their (partial) batch the moment
// the model is live. A tier upgrade re-triggers the load at the new tier's duration;
// a mid-FILL batch keeps its members and its window progress frozen across the reload.
//
// QUALITY: tiers are model size. A bigger model batches more AND answers better
// (qualityRisk 10%/4%/1%). The roll runs in the completion loop only: finishRequest()
// as usual, then on a hit the QUALITY_RISK_REPUTATION constant is applied,
// `service.badAnswers` ticks up, and a soft badge event is emitted for the view. It is
// a SUCCESS-side event that never goes through failRequest, so the failure counters
// stay untouched. The roll draws from the "rolls" stream.
//
// Termination invariant: a batch terminates with its batch (the completion loop) or
// its node (deleteObject folds `service.batch` into the orphan set; the region-outage
// teardown sweeps it). Non-INFERENCE intake is failed on the spot (fail_gpu_only;
// MALICIOUS relabels to the breach it is), and the intake queue is BOUNDED at
// batchSize (overflow takes the existing QUEUE_FULL path in Request.update), so
// nothing can pile up invisibly.

import { failRequest, finishRequest } from "./actions";
import { CONFIG, TRAFFIC_TYPES } from "./config";
import { FAIL_REASONS, SOFT_BADGES } from "./failure-reasons";
import { rand } from "./rng";
import type { Service } from "./service";
import { emit, S } from "./state";

/**
 * Begin (or re-begin, on a tier upgrade) a model load at the current config's
 * loadTimeSec. A freshly placed GPU cold-starts: the load begins the moment it is
 * placed, because provisioning ahead of demand is the point of the mechanic. While
 * loading the node is not routable; its queue and any mid-fill batch freeze in place
 * and resume when the load completes.
 */
export function startModelLoad(service: Service): void {
  service.modelLoading = true;
  service.modelLoadTimer = 0;
}

/**
 * Ticked once per step from Service.update(). Every timer here lives in game time and
 * dies with its node.
 */
export function tickGpu(service: Service, dt: number): void {
  // Intake pass: GPUs serve inference only. A wrong-type entry is rejected at the
  // queue, before it can ever join a batch (failRequest relabels a MALICIOUS one to
  // the breach it is). Legit arrivals get their ARRIVAL stamped: the batch window is
  // measured from the first arrival's landing, not from when a finished batch frees
  // the drain, because a request that waited out a running batch (or a model load)
  // has already served its share of the window. This pass runs even while the model
  // loads.
  for (let i = service.queue.length - 1; i >= 0; i--) {
    const req = service.queue[i];
    if (!req) continue;
    if (req.type !== TRAFFIC_TYPES.INFERENCE) {
      service.queue.splice(i, 1);
      failRequest(req, FAIL_REASONS.GPU_ONLY);
    } else if (req.gpuArrivedAt === null) {
      req.gpuArrivedAt = S.elapsedGameTime;
    }
  }

  // Model (re)load: everything is held (the queue ages untouched, a mid-fill batch
  // keeps its members, a mid-run batch keeps its progress) until the load completes.
  if (service.modelLoading) {
    service.modelLoadTimer += dt;
    if (service.modelLoadTimer < (service.config.loadTimeSec ?? 0)) return;
    service.modelLoading = false;
  }

  const batchSize = service.config.batchSize ?? 1;

  if (service.batchState === "filling") {
    // Accumulate: drain arrivals into the batch, up to batchSize. The window is
    // seeded with the head's ALREADY-ELAPSED age ("1.5 s from first arrival",
    // literally), so a partial batch never pays a dead window on top of the wait it
    // already served behind the previous run. Reset it to 0 here instead and the live
    // break-even climbs from about half fill to about 93%: the profit harness pins the
    // difference.
    while (service.queue.length > 0 && service.batch.length < batchSize) {
      const req = service.queue.shift();
      if (!req) break;
      if (service.batch.length === 0) {
        service.batchWindowTimer = S.elapsedGameTime - (req.gpuArrivedAt ?? S.elapsedGameTime);
      }
      service.batch.push(req);
    }

    if (service.batch.length > 0) {
      service.batchWindowTimer += dt;
      const windowSec = service.config.batchWindowSec || CONFIG.services.gpu.batchWindowSec || 0;
      if (service.batch.length >= batchSize || service.batchWindowTimer >= windowSec) {
        // Launch: the whole batch becomes ONE job. A long generation in the batch
        // slows everyone, which is what genLength is for.
        const mean =
          service.batch.reduce((sum, r) => sum + (r.genLength || 1), 0) / service.batch.length;
        service.batchRunTimeMs =
          ((service.config.batchBaseMs ?? 0) +
            (service.config.batchPerItemMs ?? 0) * service.batch.length) *
          mean;
        service.batchRunTimer = 0;
        service.batchState = "running";
      }
    }
  }

  if (service.batchState === "running") {
    service.batchRunTimer += dt * 1000;
    if (service.batchRunTimer >= service.batchRunTimeMs) {
      // Completion loop: every request terminates here, exactly once.
      const done = service.batch.splice(0);
      service.batchState = "filling";
      service.batchWindowTimer = 0;
      const risk = service.config.qualityRisk ?? 0;
      for (const req of done) {
        finishRequest(req, service);
        if (rand("rolls") < risk) {
          // A bad answer: completed and paid, but the user noticed. Success-side, so
          // it must still be VISIBLE (the amber soft badge) without ever touching the
          // fail path.
          S.reputation += CONFIG.survival.SCORE_POINTS.QUALITY_RISK_REPUTATION;
          service.badAnswers++;
          emit({ kind: "service-badge", serviceId: service.id, key: SOFT_BADGES.BAD_ANSWER });
        }
      }
    }
  }
}
