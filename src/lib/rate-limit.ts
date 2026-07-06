/**
 * In-memory rate limiting and origin checks for the public API routes.
 *
 * The app runs as a single self-hosted replica behind Traefik, so a process-local
 * sliding-window log is enough — no Redis or shared store required. State lives in
 * a module-level Map and resets on redeploy, which is fine for abuse throttling.
 */

export interface RateLimitOptions {
  /** Maximum number of requests permitted within the window. */
  limit: number;
  /** Length of the sliding window in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry; 0 when allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  /** Timestamps (ms) of requests still inside the window, oldest first. */
  hits: number[];
  /** When this bucket's newest hit leaves its window, making the key prunable. */
  expiresAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Pruning only kicks in once the map grows large, so the common path stays
 * allocation-free and the module needs no timers (trivially testable).
 */
const PRUNE_THRESHOLD = 5000;

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
}

/**
 * Sliding-window limiter keyed by an arbitrary string. Callers namespace the key
 * by route (e.g. `leads:${ip}`) so each endpoint gets an independent budget.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  if (buckets.size > PRUNE_THRESHOLD) prune(now);

  const existing = buckets.get(key);
  const hits = existing ? existing.hits.filter((t) => t > windowStart) : [];

  if (hits.length >= opts.limit) {
    const oldest = hits[0];
    const newest = hits[hits.length - 1];
    // Unreachable: hits.length >= opts.limit (always >= 1 for real callers) means hits is non-empty.
    if (oldest === undefined || newest === undefined) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(opts.windowMs / 1000)) };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    buckets.set(key, { hits, expiresAt: newest + opts.windowMs });
    return { allowed: false, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, { hits, expiresAt: now + opts.windowMs });
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP for rate-limit keying. Traefik forwards the real client
 * as the first hop of x-forwarded-for; x-real-ip is the fallback.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Same-origin guard for browser-facing POST endpoints. Requires an Origin header
 * whose host matches the request's own host (x-forwarded-host from Traefik first,
 * then Host). NEXT_PUBLIC_SITE_URL's host is also accepted when configured. A
 * missing Origin is rejected — legitimate browser POSTs always send one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (!originHost) return false;

  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (requestHost && originHost === requestHost) return true;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      if (originHost === new URL(siteUrl).host) return true;
    } catch {
      // Ignore a malformed NEXT_PUBLIC_SITE_URL and fall through to reject.
    }
  }

  return false;
}
