// The park half of the dead-letter queue (the drain half is dlq.ts). It lives
// below actions because failOrPark calls it, while the drain calls removeRequest
// from actions; one file for both would be an import cycle.
//
// The DLQ is the only node that HOLDS already-failed requests instead of
// dropping them, turning a hard failure into a recoverable cost. Nothing is ever
// routed INTO a DLQ's queue: a failing upstream parks its dead request directly.
//
// Every parked request terminates. It is inert (not moving, not queued, not a
// job) until the drain removes it, recovered and counted as neither success nor
// failure. If the DLQ is full, parking is refused and the caller fails the
// request normally, so nothing is ever stranded.

import { TRAFFIC_TYPES } from "./config";
import type { Request } from "./request";
import type { Service } from "./service";
import { emit, S } from "./state";

/** A dead-letter queue wired from `service`, if any. */
function connectedDLQ(service: Service): Service | null {
  return (
    S.services.find(
      (s) => service.connections.includes(s.id) && s.type === "dlq" && !s.isDisabled,
    ) ?? null
  );
}

/**
 * Park a request that would otherwise finally fail. Returns true when it was
 * parked (the caller must NOT fail it), false when there is no DLQ or it is full
 * (the caller fails it normally). MALICIOUS is never parked, or a player could
 * route attacks into a DLQ and drain them away to dodge the breach penalty.
 */
export function parkInDLQ(req: Request, service: Service): boolean {
  if (req.type === TRAFFIC_TYPES.MALICIOUS) return false;
  const dlq = connectedDLQ(service);
  if (!dlq) return false;

  if (dlq.parked.length >= dlq.config.capacity) {
    // Overflow: an unmanaged DLQ is worse than none. Refuse the park and accrue
    // an extra reputation penalty.
    S.reputation -= dlq.config.overflowRepPenalty ?? 0;
    return false;
  }

  req.parked = true;
  req.isMoving = false;
  req.retryDelay = 0;
  dlq.parked.push(req);
  emit({ kind: "request-parked", id: req.id, dlqId: dlq.id });
  return true;
}
