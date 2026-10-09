import type { Service } from "./service";

/**
 * The one routing predicate: every candidate filter in the sim funnels through
 * it, so a node that cannot take traffic is skipped the same way everywhere and
 * redundancy fails over on its own. An open breaker is skipped exactly like a
 * disabled node; a half-open one is routable only while it has probes left.
 */
export function isRoutable(service: Service | null | undefined): service is Service {
  if (!service || service.isDisabled) return false;
  // A GPU loading its model takes no traffic. A dedicated flag, never isDisabled: the
  // event system re-enables disabled services and would cancel the load.
  if (service.modelLoading) return false;
  if (service.breakerState === "open") return false;
  if (service.breakerState === "half-open") return service.breakerProbes > 0;
  return true;
}
