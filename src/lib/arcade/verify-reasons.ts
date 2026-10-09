/**
 * What a verifier answers when it cannot take the run now (it serializes a shared simulation and
 * its queue is full). The route turns exactly this reason into a 503 the client can retry; every
 * other reject stays a 422. A leaf module, so a verifier can import it without a cycle.
 */
export const VERIFY_BUSY_REASON = "the verifier is busy, try again";
