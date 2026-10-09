import { failRequest } from "../actions";
import { TRAFFIC_TYPES } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import type { Request } from "../request";
import { isRoutable } from "../routing";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

/**
 * The downstream services a job may be forwarded to: routable, never a
 * dead-letter queue (a failure sink, not a forward target). INFERENCE prefers
 * Inference Gateways, then GPUs, then anything; every other class avoids the
 * single-type GPU nodes.
 */
export function forwardCandidates(service: Service, req: Request): Service[] {
  const live = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .filter((s): s is Service => !!s && s.type !== "dlq" && isRoutable(s));

  if (req.type === TRAFFIC_TYPES.INFERENCE) {
    const gateways = live.filter((s) => s.type === "infgw");
    if (gateways.length > 0) return gateways;
    const gpus = live.filter((s) => s.type === "gpu");
    if (gpus.length > 0) return gpus;
    return live;
  }
  return live.filter((s) => s.type !== "infgw" && s.type !== "gpu");
}

/** Round-robin the job to any live connected service; fail it when there is none. */
export function genericForward(service: Service, job: Job): HandlerOutcome {
  const candidates = forwardCandidates(service, job.req);

  const target = candidates[service.rrIndex % candidates.length];
  if (target) {
    service.rrIndex++;
    job.req.flyTo(target);
  } else {
    failRequest(job.req, FAIL_REASONS.NO_ROUTE);
  }
  return "next";
}
