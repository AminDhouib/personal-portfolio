import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

/** Terminal node: completes SEARCH requests only. */
export function process(service: Service, job: Job): HandlerOutcome {
  if (job.req.type === "SEARCH") {
    finishRequest(job.req, service);
  } else {
    // A search index serves SEARCH and nothing else.
    failRequest(job.req, FAIL_REASONS.SEARCH_ONLY);
  }
  return "next";
}
