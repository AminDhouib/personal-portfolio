/**
 * What a verifier answers when it cannot take the run now (it serializes a shared simulation and
 * its queue is full). The route turns exactly this reason into a 503 the client can retry; every
 * other reject stays a 422. A leaf module, so a verifier can import it without a cycle.
 */
export const VERIFY_BUSY_REASON = "the verifier is busy, try again";

/**
 * What a verifier answers when the caller has had its share of replays for now (a per-client and
 * a process-wide cap, checked before any replay starts). The route turns exactly this reason into
 * a 429 with Retry-After; the verdict carries the seconds in `retryAfterSeconds`.
 */
export const VERIFY_RATE_LIMITED_REASON = "too many replays, try again shortly";
