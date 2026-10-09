import type { Service } from "./service";

/**
 * The one routing predicate: every candidate filter in the sim funnels through
 * it, so a node that cannot take traffic is skipped the same way everywhere and
 * redundancy fails over on its own.
 */
export function isRoutable(service: Service | null | undefined): service is Service {
  return !!service && !service.isDisabled;
}
