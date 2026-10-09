import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

/** Terminal node: completes storage traffic (destination s3 or cdn, both are static origins). */
export function process(_service: Service, job: Job): HandlerOutcome {
  if (job.req.destination === "s3" || job.req.destination === "cdn") {
    finishRequest(job.req);
  } else {
    // Object storage cannot answer database or search traffic.
    failRequest(job.req, FAIL_REASONS.WRONG_STORE);
  }
  return "next";
}
