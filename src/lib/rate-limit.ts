/**
 * In-memory rate limiting and origin checks for the public API routes.
 *
 * The app runs as a single self-hosted replica behind Traefik, so a process-local
 * sliding-window log is enough — no Redis or shared store required. State lives in
 * a module-level Map and resets on redeploy, which is fine for abuse throttling.
 */

import { ipRateLimitKey, parseIpAddress } from "@/lib/ip-address";
import { logWarn } from "@/lib/log";

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

/** The missing-header warning is logged at most this often. */
const MISSING_CF_WARN_INTERVAL_MS = 60_000;

let lastMissingCfWarnAt = Number.NEGATIVE_INFINITY;

/**
 * Production traffic always crosses Cloudflare, so a request without a valid `CF-Connecting-IP`
 * means the edge was bypassed or misconfigured. One `logWarn` a minute at most (never
 * `captureException`: no Sentry or PostHog event, so a flood of such requests cannot amplify into
 * either). The detail names the fallback in use and never an address.
 */
function warnMissingCloudflareIp(fallback: "x-forwarded-for" | "unknown"): void {
  // eslint-disable-next-line no-restricted-properties -- production-only diagnostic gate, the same NODE_ENV precedent as hextris.tsx; not an integration var
  if (process.env.NODE_ENV !== "production") return;
  const now = Date.now();
  if (now - lastMissingCfWarnAt < MISSING_CF_WARN_INTERVAL_MS) return;
  lastMissingCfWarnAt = now;
  logWarn("rate-limit", "no valid CF-Connecting-IP; rate limits are keying on a fallback", {
    fallback,
  });
}

/**
 * Clear the module state (buckets and the warning throttle) so tests do not depend on order.
 * Test-only; nothing in the app calls it.
 */
export function resetRateLimitForTests(): void {
  buckets.clear();
  lastPruneAt = Number.NEGATIVE_INFINITY;
  lastMissingCfWarnAt = Number.NEGATIVE_INFINITY;
}

/**
 * The client key used for rate limits: a validated IP, canonicalised by `ipRateLimitKey` (IPv4
 * whole, IPv6 reduced to its /64, IPv4-mapped IPv6 folded onto IPv4). Every candidate must pass
 * `parseIpAddress` (`isIP`, no `%zone`, length-capped), and the order is chosen so a client cannot
 * pick the result:
 *
 * 1. `CF-Connecting-IP`. Production sits behind Cloudflare (proxied), which overwrites this
 *    header with the address it saw on every request, discarding any client-sent value. Traefik
 *    only passes it through. This is the one value a client cannot choose.
 * 2. The RIGHTMOST `X-Forwarded-For` entry, and only that one. Each proxy APPENDS the address it
 *    received the request from, so the right end is written by the nearest proxy and everything
 *    to its left is whatever the client typed. Without `CF-Connecting-IP` the request did not come
 *    through Cloudflare, and the nearest proxy is Traefik (or the Next server itself, which fills
 *    `X-Forwarded-For` from the socket when it is absent). That hop is one of two things, and this
 *    function cannot tell which: the peer address Traefik saw (a trusted peer keeps the client's
 *    header and appends to it, an untrusted peer has the header replaced by the peer address), or
 *    the client itself when it connects straight to the origin. Either way it is written by
 *    infrastructure, not typed by the client, so it cannot be rotated for free. Behind Cloudflare
 *    that same entry is Cloudflare's or Traefik's own hop, not the visitor, which is why step 1
 *    comes first. If the last entry is not an address, nothing appended it, and walking left
 *    would land on client-typed text, so the walk stops there.
 * 3. "unknown", one shared bucket for everything unattributable.
 *
 * `X-Real-Ip` is deliberately not read: the Next server sets `X-Forwarded-For` from
 * `socket.remoteAddress` when it is absent, so the header is never the only source.
 *
 * Residual risk: the origin is reachable without Cloudflare (tracked as T-5533), and a request
 * sent straight to it can carry any `CF-Connecting-IP`. Closing that is an infrastructure fix
 * (firewall the origin to Cloudflare's ranges, or authenticated origin pulls); this function
 * cannot tell a real Cloudflare header from a forged one. Production logs a throttled warning when
 * the header is missing, which is the signal that the edge was bypassed.
 */
export function getClientIp(request: Request): string {
  const cloudflare = parseIpAddress(request.headers.get("cf-connecting-ip"));
  if (cloudflare) return ipRateLimitKey(cloudflare);

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",");
    const nearestProxy = parseIpAddress(hops[hops.length - 1]);
    if (nearestProxy) {
      warnMissingCloudflareIp("x-forwarded-for");
      return ipRateLimitKey(nearestProxy);
    }
  }

  warnMissingCloudflareIp("unknown");
  return "unknown";
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
