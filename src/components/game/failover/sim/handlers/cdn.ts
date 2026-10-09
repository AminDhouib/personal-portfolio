import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import { rand } from "../rng";
import { isRoutable } from "../routing";
import type { Service } from "../service";
import { emit, S } from "../state";
import type { HandlerOutcome, Job } from "../types";

/**
 * High cache hit rate for static content; on a miss the request goes on to the
 * connected origin (S3 or whatever is wired).
 */
export function process(service: Service, job: Job): HandlerOutcome {
  if (job.req.type === "STATIC") {
    const hitRate = service.config.cacheHitRate ?? 0.95;

    if (rand("rolls") < hitRate) {
      job.req.cached = true;
      emit({ kind: "cache-hit", id: job.req.id, serviceId: service.id });
      finishRequest(job.req, service);
      return "next";
    }
  }

  // Cache miss: forward to any routable connected service.
  const origin = service.connections
    .map((id) => S.services.find((s) => s.id === id))
    .find((s) => isRoutable(s));

  if (origin) {
    job.req.flyTo(origin);
  } else {
    // "No origin" rather than the generic "no route": an edge cache with nothing
    // behind it is the specific mistake, and naming it is the lesson.
    failRequest(job.req, FAIL_REASONS.NO_ORIGIN);
  }
  return "next";
}
