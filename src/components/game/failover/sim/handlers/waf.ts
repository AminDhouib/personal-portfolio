import { removeRequest, updateScore } from "../actions";
import { TRAFFIC_TYPES } from "../config";
import type { Request } from "../request";
import type { Service } from "../service";

/**
 * Screen a request at the firewall's door, before it becomes a job. A MALICIOUS
 * request is blocked and removed (the attack never reaches the processing
 * pipeline); everything else passes. Returns true when the request was taken.
 */
export function screen(service: Service, req: Request): boolean {
  if (req.type !== TRAFFIC_TYPES.MALICIOUS) return false;
  updateScore(req, "MALICIOUS_BLOCKED", service);
  // Through removeRequest, not a bare destroy: a blocked request left in the
  // request list would be ticked forever, and blocks are a large share of traffic.
  removeRequest(req);
  return true;
}

// Survivors are forwarded like any other job.
export { genericForward as process } from "./forward";
