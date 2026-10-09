// Per-service-type job handlers. Service.update() finishes a job's processing
// timer, runs the shared failure roll, then dispatches here:
//
//   const handler = SERVICE_HANDLERS[service.type] ?? genericForward;
//   const outcome = handler(service, job);
//
// The job has already been taken out of service.processing when the handler runs.
// What a handler returns is the job loop's control flow:
//
//   "next"          the job was consumed (finished, failed) or forwarded;
//   "requeue-next"  not consumed: put it back at its old index, try the next job;
//   "requeue-stop"  backpressure: put it back and stop for this step.
//
// Types with no entry fall back to genericForward. The firewall's blocking is not
// a handler: it screens requests at the door, in handlers/waf.

import type { ServiceType } from "../config";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";
import { process as alb } from "./alb";
import { process as cache } from "./cache";
import { process as cdn } from "./cdn";
import { process as compute } from "./compute";
import { process as db } from "./db";
import { genericForward } from "./forward";
import { process as s3 } from "./s3";
import { process as waf } from "./waf";

type Handler = (service: Service, job: Job) => HandlerOutcome;

export const SERVICE_HANDLERS: Partial<Record<ServiceType, Handler>> = {
  waf,
  alb,
  cache,
  cdn,
  compute,
  // A Container Cluster processes exactly like Compute. Its distinguishing
  // behaviour is economic (dense fixed capacity at a flat fee), not a different
  // job path.
  container: compute,
  // Serverless routes exactly like Compute; the per-invocation charge is made by
  // the compute handler, which is a no-op for every other type.
  serverless: compute,
  db,
  s3,
};

export function dispatch(service: Service, job: Job): HandlerOutcome {
  const handler = SERVICE_HANDLERS[service.type] ?? genericForward;
  return handler(service, job);
}
