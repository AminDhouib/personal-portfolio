// Retry with backoff. A request that hits a transient service-level failure gets
// ONE more chance (CONFIG.resilience.maxRetries) through a healthy peer before it
// is counted as failed: the transient-fault lesson and, if the knobs were ever
// loosened, the retry-storm lesson.
//
// The load/health failure roll in Service.update is the only retry site. Every
// other failRequest is a topology verdict ("no route", "a replica cannot serve a
// WRITE", "the queue is full") and retrying it would only burn the same dead end
// again. One site also keeps the invariant provable: a retried request is still
// owned by exactly one terminator.
//
// The backoff is a countdown on the request, ticked by Request.update with the
// same dt as everything else, so it freezes with the run and a reset that drops
// S.requests takes the pending retry with it. When it ends the request either
// flies to a still-valid peer or is failed on the spot, so it always terminates.
//
// A retried request is neither completed nor failed at retry time. It is counted
// once, when it finally reaches finishRequest / failRequest / removeRequest. The
// FAILED SERVICE is still charged the error (the breaker) at the moment it
// happened, because the error genuinely happened there.

import { failRequest } from "./actions";
import { CONFIG } from "./config";
import { FAIL_REASONS } from "./failure-reasons";
import type { Request } from "./request";
import { isRoutable } from "./routing";
import type { Service } from "./service";
import { recordServiceError } from "./metrics";
import { emit, S } from "./state";

/**
 * A conservative "an alternate path exists" test: another routable service of the
 * SAME type that the failing node's own upstream can also reach (or that the
 * Internet can reach, when the failing node is an entry point). If we cannot
 * prove one exists we do not retry: a retry with nowhere to go is a delayed
 * failure plus a leak risk.
 */
export function findRetryPeer(service: Service): Service | null {
  const peers = S.services.filter((s) => s !== service && s.type === service.type && isRoutable(s));
  if (peers.length === 0) return null;

  const upstreams = S.services.filter(
    (s) => s !== service && s.connections.includes(service.id) && isRoutable(s),
  );
  const fromInternet = S.internetNode.connections.includes(service.id);

  for (const peer of peers) {
    if (upstreams.some((u) => u.connections.includes(peer.id))) return peer;
    if (fromInternet && S.internetNode.connections.includes(peer.id)) return peer;
  }
  return null;
}

/**
 * Called from Service.update's failure roll INSTEAD of failRequest. Returns true
 * when the request was taken over by the retry path (the caller must leave it
 * alone), false when the caller must fail it normally.
 */
export function retryRequest(req: Request, service: Service): boolean {
  const cfg = CONFIG.resilience;
  if (!cfg.retryEnabled) return false;
  if (req.retries >= cfg.maxRetries) return false;

  const peer = findRetryPeer(service);
  if (!peer) return false;

  // failRequest would have charged the node the error on the non-retry path, so doing
  // it here keeps the error rate identical whichever path the request takes. The
  // breaker event is recorded by the caller, which fires it on both paths.
  recordServiceError(service);

  req.retries++;
  req.retryTarget = peer;
  req.retryDelay = cfg.retryBackoffSec;
  S.resilience.retries++;
  emit({ kind: "request-retry", id: req.id, serviceId: service.id, peerId: peer.id });
  return true;
}

/**
 * Ticked from Request.update. Returns true while the request is still waiting out
 * its backoff (the caller then skips its normal flight step). The peer is
 * re-validated on expiry because it may have been deleted, disabled or tripped
 * during the backoff.
 */
export function tickRetry(req: Request, dt: number): boolean {
  if (req.retryDelay <= 0) return false;

  req.retryDelay -= dt;
  if (req.retryDelay > 0) return true;

  const peer = req.retryTarget;
  req.retryDelay = 0;
  req.retryTarget = null;

  if (peer && S.services.includes(peer) && isRoutable(peer)) {
    req.flyTo(peer);
  } else {
    // The backoff bought the request a second chance and the peer was gone when
    // it came due: the retry itself is what failed.
    failRequest(req, FAIL_REASONS.RETRY_FAILED);
  }
  return true;
}
