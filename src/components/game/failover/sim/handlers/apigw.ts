import { throttleRequest } from "../actions";
import { CONFIG } from "../config";
import type { Request } from "../request";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";
import { genericForward } from "./forward";

// The share of the rate limit at which a class starts being refused. A gateway
// that sheds blindly protects nothing: the topology alone decided what died, and
// the player had no say in it. Real systems classify in ADVANCE (a critical
// versus a sheddable class, priority levels) because nobody can make that call
// during an incident. Unclassified traffic is treated as CRITICAL: refusing
// something the config never spoke about would be the wrong default.
function shedThresholdFor(req: Request): number {
  const cls = req.typeConfig.criticality;
  return (cls ? CONFIG.shedding[cls] : undefined) ?? 1.0;
}

/**
 * API gateway. Rate limiting: over-limit requests are throttled (a soft fail),
 * the rest round-robin to any live downstream. SHEDDABLE traffic goes at 60% of
 * the limit, STANDARD at 85%, CRITICAL is carried to the very last slot.
 * Throttling feeds neither the breaker nor the error rate, so this changes WHICH
 * requests are shed, never how many the gateway can serve. The per-second counter
 * reset lives in Service.update.
 */
export function process(service: Service, job: Job): HandlerOutcome {
  service.rateCounter++;
  const rateLimit = service.config.rateLimit ?? 20;

  if (service.rateCounter > rateLimit * shedThresholdFor(job.req)) {
    throttleRequest(job.req);
    return "next";
  }

  // Forward to the downstream, skipping offline and breaker-open nodes and the
  // dead-letter sink. The gateway has an infgw edge, so its forward carries the
  // same INFERENCE preference and single-type exclusion as any other.
  return genericForward(service, job);
}
