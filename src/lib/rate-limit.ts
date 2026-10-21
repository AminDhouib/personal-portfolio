/**
 * In-memory rate limiting and origin checks for the public API routes.
 *
 * The app runs as a single self-hosted replica behind Traefik, so a process-local
 * sliding-window log is enough — no Redis or shared store required. State lives in
 * a module-level Map and resets on redeploy, which is fine for abuse throttling.
 */

import { parseIpAddress } from "@/lib/ip-address";

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

/**
 * Hard ceiling on tracked keys. Keys are validated client IPs, so a flood of unique keys needs a
 * flood of source addresses; the cap still bounds memory (and the work a request can trigger)
 * whatever an attacker manages.
 */
const MAX_BUCKETS = 10_000;

/** A full scan is O(n), so it runs at most this often however fast requests arrive. */
const PRUNE_INTERVAL_MS = 1000;

let lastPruneAt = Number.NEGATIVE_INFINITY;

function prune(now: number): void {
  lastPruneAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
}

/**
 * Make room for one new key. Expired buckets go first (a throttled scan); if the map is still at
 * the cap, the least recently used live buckets are evicted. `Map` iterates in insertion order and
 * every update re-inserts its key, so the front of the map is the least recently used, and each
 * eviction is O(1). Evicting a live bucket forgives that caller's spent budget, which is the
 * price of a bounded map.
 */
function makeRoom(now: number): void {
  if (now - lastPruneAt >= PRUNE_INTERVAL_MS) prune(now);
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    // Unreachable: the loop only runs while the map holds at least MAX_BUCKETS entries.
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/** Store a bucket as the most recently used (delete first so `Map` re-inserts it at the back). */
function setBucket(key: string, bucket: Bucket): void {
  buckets.delete(key);
  buckets.set(key, bucket);
}

/**
 * Sliding-window limiter keyed by an arbitrary string. Callers namespace the key
 * by route (e.g. `leads:${ip}`) so each endpoint gets an independent budget.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  if (buckets.size > PRUNE_THRESHOLD && now - lastPruneAt >= PRUNE_INTERVAL_MS) prune(now);

  const existing = buckets.get(key);
  if (!existing && buckets.size >= MAX_BUCKETS) makeRoom(now);
  const hits = existing ? existing.hits.filter((t) => t > windowStart) : [];

  if (hits.length >= opts.limit) {
    const oldest = hits[0];
    const newest = hits[hits.length - 1];
    // Unreachable: hits.length >= opts.limit (always >= 1 for real callers) means hits is non-empty.
    if (oldest === undefined || newest === undefined) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(opts.windowMs / 1000)) };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    setBucket(key, { hits, expiresAt: newest + opts.windowMs });
    return { allowed: false, retryAfterSeconds };
  }

  hits.push(now);
  setBucket(key, { hits, expiresAt: now + opts.windowMs });
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * The client IP used to key rate limits. Every candidate is validated as a bare IP address
 * (`parseIpAddress`: `isIP`, no `%zone`, length-capped), and the order is chosen so a client
 * cannot pick the result:
 *
 * 1. `CF-Connecting-IP`. Production sits behind Cloudflare (proxied), which overwrites this
 *    header with the address it saw on every request, discarding any client-sent value. Traefik
 *    only passes it through. This is the one value a client cannot choose.
 * 2. The RIGHTMOST `X-Forwarded-For` entry. Each proxy APPENDS the address it received the
 *    request from, so the right end is written by the nearest proxy and the left end is whatever
 *    the client typed. Cloudflare appends the real client and Traefik (which trusts its peer and so
 *    keeps the incoming header) appends the hop it heard from, so behind Cloudflare the rightmost
 *    entry is an infrastructure hop, not the visitor: that is why step 1 comes first, and why
 *    this step is only reached for requests that bypass Cloudflare. A direct connection to
 *    Traefik is untrusted, so Traefik discards the client's header and writes the peer address,
 *    which is exactly the rightmost entry. Only the last entry is considered: if it is not an
 *    address nothing appended it, and walking left would land on client-typed text.
 * 3. `X-Real-Ip`, for a bare process with no proxy at all (local dev). Behind Traefik
 *    `X-Forwarded-For` is always present, so this is never reached in production.
 * 4. "unknown", one shared bucket for everything unattributable.
 *
 * Residual risk: the origin is reachable without Cloudflare (tracked as T-5533), and a request
 * sent straight to it can carry any `CF-Connecting-IP`. Closing that is an infrastructure fix
 * (firewall the origin to Cloudflare's ranges, or authenticated origin pulls); this function
 * cannot tell a real Cloudflare header from a forged one.
 */
export function getClientIp(request: Request): string {
  const cloudflare = parseIpAddress(request.headers.get("cf-connecting-ip"));
  if (cloudflare) return cloudflare;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",");
    const nearestProxy = parseIpAddress(hops[hops.length - 1]);
    if (nearestProxy) return nearestProxy;
  }

  return parseIpAddress(request.headers.get("x-real-ip")) ?? "unknown";
}

/**
 * Same-origin guard for browser-facing POST endpoints. Requires an Origin header
 * whose host matches the request's own host (x-forwarded-host from Traefik first,
 * then Host). A missing Origin is rejected — legitimate browser POSTs always send
 * one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // silent-ok: malformed Origin header is a client error; rejecting is the correct behavior
    return false;
  }
  if (!originHost) return false;
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(requestHost && originHost === requestHost);
}
