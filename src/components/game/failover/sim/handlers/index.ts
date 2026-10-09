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
// Types with no entry fall back to genericForward. The firewall's and the auth
// node's blocking are not handlers: they screen requests at the door, in
// handlers/waf and handlers/auth. The DLQ, the Scheduler and the Stream have no
// entry either: they are ticked straight from Service.update, outside this
// dispatch.

import type { ServiceType } from "../config";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";
import { process as alb } from "./alb";
import { process as apigw } from "./apigw";
import { process as cache } from "./cache";
import { process as cdn } from "./cdn";
import { process as compute } from "./compute";
import { process as db } from "./db";
import { process as dns } from "./dns";
import { genericForward } from "./forward";
import { process as nosql } from "./nosql";
import { process as notify } from "./notify";
import { process as pubsub } from "./pubsub";
import { process as replica } from "./replica";
import { process as s3 } from "./s3";
import { process as search } from "./search";
import { process as sqs } from "./sqs";
import { process as warehouse } from "./warehouse";
import { process as waf } from "./waf";

type Handler = (service: Service, job: Job) => HandlerOutcome;

export const SERVICE_HANDLERS: Partial<Record<ServiceType, Handler>> = {
  waf,
  alb,
  apigw,
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
  dns,
  nosql,
  notify,
  pubsub,
  replica,
  s3,
  search,
  sqs,
  warehouse,
};

export function dispatch(service: Service, job: Job): HandlerOutcome {
  const handler = SERVICE_HANDLERS[service.type] ?? genericForward;
  return handler(service, job);
}
