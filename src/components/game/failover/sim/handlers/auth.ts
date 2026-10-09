import { removeRequest, updateScore } from "../actions";
import { TRAFFIC_TYPES } from "../config";
import type { Request } from "../request";
import { rand } from "../rng";
import type { Service } from "../service";

/**
 * Auth / Identity is a second security layer on the pass-through path. At the
 * door it catches a FRACTION (catchRate) of the MALICIOUS traffic that reached it:
 * the session-based attacks a WAF alone misses. What it does NOT catch falls
 * through to processing and is forwarded downstream (auth has no handler of its own, so the generic forward carries it), where it eventually breaches
 * (that is the "slips past" lesson). The latency cost is the node's high
 * processingTime, paid by every request it passes. Returns true when the request
 * was taken.
 */
export function screen(service: Service, req: Request): boolean {
  if (req.type !== TRAFFIC_TYPES.MALICIOUS) return false;
  if (rand("rolls") >= (service.config.catchRate ?? 0.5)) return false;
  updateScore(req, "MALICIOUS_BLOCKED", service);
  removeRequest(req);
  return true;
}
