import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

/** Terminal node: handles READ and WRITE, but NOT SEARCH. */
export function process(service: Service, job: Job): HandlerOutcome {
  if (job.req.type === "SEARCH") {
    // A key-value store is not a search index: that is the whole reason the
    // Search Engine node exists.
    failRequest(job.req, FAIL_REASONS.NOT_INDEXED);
  } else if (job.req.destination === "db") {
    finishRequest(job.req, service);
  } else {
    failRequest(job.req, FAIL_REASONS.WRONG_STORE);
  }
  return "next";
}
