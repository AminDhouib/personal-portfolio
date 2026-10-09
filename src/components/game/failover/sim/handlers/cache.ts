import { failOrPark, finishRequest } from "../actions";
import { CONFIG } from "../config";
import { FAIL_REASONS } from "../failure-reasons";
import type { Request } from "../request";
import { rand } from "../rng";
import type { Service } from "../service";
import { emit } from "../state";
import type { HandlerOutcome, Job } from "../types";

// A cache hit needs BOTH content that is cacheable at all (a property of the
// traffic class: STATIC 0.9, READ 0.4, SEARCH 0.15, writes 0) and a cache big
// enough to still hold it (a property of the node's tier). The tier is a
// multiplier against tier 1, so tier 1 resolves to exactly 1.0 and only a
// player who spends on an upgrade sees a difference.
function effectiveHitRate(service: Service, req: Request): number {
  const baseQuality = CONFIG.services.cache.cacheHitRate ?? 0.35; // tier 1 is the anchor
  const quality = service.config.cacheHitRate || baseQuality;
  // Capped: a tier-3 cache must not make STATIC (0.9) a certainty, or a cache in
  // front of Storage would silently retire the origin.
  return Math.min(0.95, req.cacheHitRate * (quality / baseQuality));
}

/**
 * Rolls the cache-hit chance, and on a miss routes toward the request's
 * destination, preferring specialised services (search, replica, nosql) before
 * the SQL database.
 */
export function process(service: Service, job: Job): HandlerOutcome {
  const req = job.req;
  if (req.isCacheable) {
    if (rand("rolls") < effectiveHitRate(service, req)) {
      req.cached = true;
      emit({ kind: "cache-hit", id: req.id, serviceId: service.id });
      finishRequest(req, service);
      return "next";
    }
  }

  const destType = req.destination;

  if (destType === "db") {
    if (req.type === "SEARCH") {
      const searchTarget = service.findConnectedService("search");
      if (searchTarget) {
        req.flyTo(searchTarget);
        return "next";
      }
    }
    if (req.type === "READ") {
      const replicaTarget = service.findConnectedService("replica");
      if (replicaTarget) {
        req.flyTo(replicaTarget);
        return "next";
      }
    }
    if (req.type !== "SEARCH") {
      const nosqlTarget = service.findConnectedService("nosql");
      if (nosqlTarget) {
        req.flyTo(nosqlTarget);
        return "next";
      }
    }
    const sqlTarget = service.findConnectedService("db");
    if (sqlTarget) {
      req.flyTo(sqlTarget);
      return "next";
    }
    failOrPark(req, service, FAIL_REASONS.NO_ROUTE);
  } else {
    // Storage-family destinations are interchangeable on a miss: STATIC's
    // destination is "cdn" but a cache wired to S3 should still deliver it.
    let target = service.findConnectedService(destType);
    if (!target && (destType === "cdn" || destType === "s3")) {
      target = service.findConnectedService(destType === "cdn" ? "s3" : "cdn");
    }
    if (target) {
      req.flyTo(target);
    } else {
      failOrPark(req, service, FAIL_REASONS.NO_ROUTE);
    }
  }
  return "next";
}
