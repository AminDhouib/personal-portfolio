import { failOrPark } from "../actions";
import { TRAFFIC_TYPES } from "../config";
import { chargeServerlessInvocation } from "../economy";
import { FAIL_REASONS, type FailReason } from "../failure-reasons";
import type { Service } from "../service";
import type { HandlerOutcome, Job } from "../types";

/**
 * The routing brain, shared by Compute and Container (and Serverless, which
 * differs only by the per-invocation charge). It prefers specialised services
 * (search, replica, nosql, cache) and falls back to the general path.
 */
export function process(service: Service, job: Job): HandlerOutcome {
  const req = job.req;
  // Per-request cost for serverless, charged on every route out including the
  // failing ones: you pay for the execution either way. A no-op for the rest.
  const charge = (): void => chargeServerlessInvocation(service);
  const forward = (target: Service): HandlerOutcome => {
    charge();
    req.flyTo(target);
    return "next";
  };
  const fail = (reason: FailReason | null): HandlerOutcome => {
    charge();
    failOrPark(req, service, reason);
    return "next";
  };

  const destType = req.destination;

  // INFERENCE: prefer the Inference Gateway (it buffers warming and full GPUs
  // with deadline honesty), fall back to a directly wired GPU, else no route.
  if (req.type === TRAFFIC_TYPES.INFERENCE) {
    const gateway = service.findConnectedService("infgw");
    if (gateway) return forward(gateway);
    const gpu = service.findConnectedService("gpu");
    if (gpu) return forward(gpu);
    return fail(FAIL_REASONS.NO_ROUTE);
  }

  if (destType === "blocked") {
    // Destination "blocked" is MALICIOUS traffic: failRequest relabels it as the
    // breach it is, so no reason is passed.
    return fail(null);
  }

  if (req.isCacheable) {
    // Prefer specialised services over a Cache when they are a better fit:
    // - SEARCH hits the cache only 15% of the time, so if a Search Engine is
    //   connected it goes there directly.
    // - READ hits 40%, but if the Cache is heavily loaded its queue delay
    //   outweighs the savings: prefer a Read Replica when both are connected
    //   and the Cache is over 60% loaded.
    if (req.type === "SEARCH") {
      const searchDirect = service.findConnectedService("search");
      if (searchDirect) return forward(searchDirect);
    }
    const cacheTarget = service.findConnectedService("cache");
    if (req.type === "READ" && cacheTarget && cacheTarget.totalLoad > 0.6) {
      const replicaDirect = service.findConnectedService("replica");
      if (replicaDirect) return forward(replicaDirect);
    }
    // Only route through a Cache if a miss can still reach its destination from
    // there. A Cache wired only to the DB must not swallow STATIC traffic whose
    // destination is Storage.
    if (cacheTarget) {
      const cacheCanDeliver =
        destType === "db"
          ? true // the cache-miss cascade handles search, replica, nosql and sql
          : !!(cacheTarget.findConnectedService("s3") || cacheTarget.findConnectedService("cdn"));
      if (cacheCanDeliver) return forward(cacheTarget);
    }
  }

  if (destType === "db") {
    if (req.type === "SEARCH") {
      const search = service.findConnectedService("search");
      if (search) return forward(search);
      const sql = service.findConnectedService("db");
      if (sql) return forward(sql);
    } else if (req.type === "READ") {
      const replica = service.findConnectedService("replica");
      if (replica) return forward(replica);
      const nosql = service.findConnectedService("nosql");
      if (nosql) return forward(nosql);
      const sql = service.findConnectedService("db");
      if (sql) return forward(sql);
    } else {
      const nosql = service.findConnectedService("nosql");
      if (nosql) return forward(nosql);
      const sql = service.findConnectedService("db");
      if (sql) return forward(sql);
    }
    return fail(FAIL_REASONS.NO_ROUTE);
  }

  // Storage-family destinations are interchangeable: STATIC's destination is
  // "cdn" but a Compute wired directly to S3 must still deliver it.
  let direct = service.findConnectedService(destType);
  if (!direct && (destType === "cdn" || destType === "s3")) {
    direct = service.findConnectedService(destType === "cdn" ? "s3" : "cdn");
  }
  if (direct) return forward(direct);
  return fail(FAIL_REASONS.NO_ROUTE);
}
