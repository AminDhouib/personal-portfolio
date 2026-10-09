import { isRoutable } from "../routing";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

/**
 * Message queue. Pushes to downstream ALBs with a backpressure check, and is the
 * only handler that uses the requeue outcomes: "requeue-next" while it waits for a
 * compute to pull, "requeue-stop" when every downstream is saturated.
 *
 * Compute nodes are deliberately NOT pushed to: they PULL from the queue (see
 * pullFromQueues in Service.update).
 */
export function process(service: Service, job: Job): HandlerOutcome {
  const candidates = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => !!s && s.type === "alb" && isRoutable(s));

  // Nothing to push to (for example, wired only to compute): the request stays in
  // `processing` so a compute can pop it.
  if (candidates.length === 0) return "requeue-next";

  // Round-robin with a backpressure check.
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const target = candidates[service.rrIndex % candidates.length];
    service.rrIndex++;
    if (!target) continue;

    const targetMaxQueue = target.config.maxQueueSize ?? 20;
    if (target.queue.length + target.incomingCount < targetMaxQueue) {
      job.req.flyTo(target);
      return "next";
    }
  }

  // Downstream busy: keep it in processing and retry next step.
  return "requeue-stop";
}
