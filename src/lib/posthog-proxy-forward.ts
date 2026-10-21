import { parseIpAddress } from "@/lib/ip-address";
import { POSTHOG_PROXY_PATH, isPosthogProxyPath } from "@/lib/posthog-proxy";

/**
 * The visitor's IP. Through the rewrites in `posthog-proxy.ts`, every event would reach PostHog
 * from THIS server, so PostHog would record the host's own address for every visitor and geo-IP
 * would collapse to one city. Forwarding the visitor's address is not enough on its own: PostHog's
 * capture service reads only the LEFTMOST `X-Forwarded-For` entry, and the devino.ca Cloudflare
 * zone strips `X-Forwarded-For` on posthog.devino.ca on purpose (an anti-spoof rule that must
 * never be worked around), so a header sent through Cloudflare never arrives.
 *
 * Capture therefore takes a second route when one is configured: straight to PostHog's capture
 * service over the host's own bridge, never leaving the box (`POSTHOG_CAPTURE_INTERNAL_ORIGIN`,
 * set by compose; the Traefik router behind it is host infra, see RUNBOOK.md). Everything else
 * (the SDK bundle, remote config, flags) keeps the public route, because only capture records an
 * IP.
 *
 * Server-only on purpose: it uses `node:net`, so it lives apart from `posthog-proxy.ts`, which
 * the browser bundle (`src/instrumentation-client.ts`) and `next.config.ts` import. Only
 * `src/proxy.ts` (Node runtime) imports this module.
 */

/**
 * Capture's own paths, a subset of what `posthogProxyRewrites` allows (`/e`, and `/i/v0` under
 * `/i`). A capture path outside the allow-list (`/batch`, `/capture`) is not hopped: the SDK never
 * calls it, and the public route does not forward it either.
 */
const POSTHOG_CAPTURE_PREFIXES = ["/e", "/i/v0"];

/** Is this proxied sub-path (the part after the proxy path) a capture endpoint? */
function isPosthogCapturePath(subPath: string): boolean {
  return POSTHOG_CAPTURE_PREFIXES.some(
    (prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`),
  );
}

/**
 * The visitor's IP as Cloudflare saw it. `CF-Connecting-IP` is the one header a visitor cannot
 * set: Cloudflare overwrites it on every request. A value that is not an address is refused,
 * never forwarded (`parseIpAddress` validates it, zone ids included).
 */
function trustedVisitorIp(cfConnectingIp: string | null | undefined): string | null {
  return parseIpAddress(cfConnectingIp);
}

/** The internal capture origin, or null when unset, blank or not an http(s) URL. */
function posthogInternalCaptureOrigin(configured: string | null | undefined): string | null {
  const value = configured?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    // silent-ok: an unparseable origin means "no internal hop"; capture falls back to the public
    // route, which is the documented behaviour for a blank value too (RUNBOOK.md).
    return null;
  }
}

type PosthogProxyForward = {
  /** Absolute URL to rewrite to over the internal hop, or null to leave the request to the rewrites. */
  internalRewrite: string | null;
  /** The `X-Forwarded-For` to send upstream: the visitor alone, or null to send none. */
  forwardedFor: string | null;
};

/**
 * What the proxy does with one PostHog request. The incoming `X-Forwarded-For` is never passed
 * on: its leftmost entry is whatever the visitor typed, and PostHog believes the leftmost entry.
 */
export function planPosthogProxyForward(input: {
  pathname: string;
  search: string;
  cfConnectingIp: string | null | undefined;
  internalCaptureOrigin: string | null | undefined;
}): PosthogProxyForward {
  const forwardedFor = trustedVisitorIp(input.cfConnectingIp);
  const origin = posthogInternalCaptureOrigin(input.internalCaptureOrigin);
  const subPath = input.pathname.slice(POSTHOG_PROXY_PATH.length);
  const internalRewrite =
    origin && isPosthogProxyPath(input.pathname) && isPosthogCapturePath(subPath)
      ? `${origin}${subPath}${input.search}`
      : null;
  return { internalRewrite, forwardedFor };
}

/** The request headers to send upstream, given the plan's forwarded-for. */
export function posthogUpstreamHeaders(incoming: Headers, forwardedFor: string | null): Headers {
  const headers = new Headers(incoming);
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  else headers.delete("x-forwarded-for");
  return headers;
}
