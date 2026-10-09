import { failRequest, finishRequest } from "../actions";
import { FAIL_REASONS } from "../failure-reasons";
import type { Service } from "../service";
import { S } from "../state";
import type { HandlerOutcome, Job } from "../types";

/**
 * Terminal node: completes db-destined READ requests, but only while wired to a
 * master (db or nosql).
 */
export function process(service: Service, job: Job): HandlerOutcome {
  const hasMaster = service.connections.some((id) => {
    const s = S.services.find((svc) => svc.id === id);
    return s && (s.type === "db" || s.type === "nosql");
  });
  if (!hasMaster) {
    // A replica replicates FROM somewhere: unwired, it has nothing to serve.
    failRequest(job.req, FAIL_REASONS.NO_MASTER);
    return "next";
  }
  if (job.req.type === "READ" && job.req.destination === "db") {
    finishRequest(job.req, service);
  } else {
    // The read-replica lesson: WRITEs must go to the master.
    failRequest(job.req, FAIL_REASONS.READ_ONLY_REPLICA);
  }
  return "next";
}
