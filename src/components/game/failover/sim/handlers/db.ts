import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

/** Terminal node: completes database traffic, fails everything else. */
export function process(service: Service, job: Job): HandlerOutcome {
  if (job.req.destination === "db") {
    finishRequest(job.req, service);
  } else {
    // Not database traffic: a SQL DB is the wrong store for it.
    failRequest(job.req, FAIL_REASONS.WRONG_STORE);
  }
  return "next";
}
