/**
 * The first-party PostHog path.
 *
 * Ad blockers filter by domain, and `posthog.devino.ca` is on every list. The browser SDK
 * therefore talks to `POSTHOG_PROXY_PATH` on the page's OWN origin, and Next `rewrites()`
 * (next.config.ts) forward it to PostHog server-side, so the request is first-party and a
 * blocker has no host to match. The path name is deliberately meaningless: `/ingest`,
 * `/analytics`, `/posthog` and `/collect` are what the blockers' generic rules match on.
 *
 * Pure and import-free on purpose: next.config.ts loads it through Next's own config loader
 * (no tsconfig path mapping, so no `@/` alias in here), and so do `src/proxy.ts` and the browser
 * bundle (`src/instrumentation-client.ts`).
 *
 * Server-side capture (`src/lib/log.ts`) stays DIRECT to PostHog: there is no ad blocker on a
 * server, and routing it through its own app would add a hop that can fail.
 */

/** The ONE spelling of the path. Everything else derives from it. */
export const POSTHOG_PROXY_PATH = "/_p/4qe";

/** Used when `NEXT_PUBLIC_POSTHOG_HOST` is unset, matching the SDK's previous default. */
export const POSTHOG_DEFAULT_UPSTREAM_HOST = "https://posthog.devino.ca";

export type PosthogProxyRewrite = { source: string; destination: string };

/** The upstream the proxy forwards to: the same host the SDK would otherwise have called directly. */
export function posthogUpstreamHost(configuredHost: string | null | undefined): string {
  const host = configuredHost?.trim() || POSTHOG_DEFAULT_UPSTREAM_HOST;
  return host.replace(/\/+$/u, "");
}

/**
 * The rewrite rules, in the order that matters: `static` and `array` before the catch-all so
 * the SDK bundle and its remote config are not swallowed by it. A self-hosted PostHog serves
 * both from the same host as the API, so all three rules share one upstream.
 */
export function posthogProxyRewrites(
  configuredHost: string | null | undefined,
): PosthogProxyRewrite[] {
  const upstream = posthogUpstreamHost(configuredHost);
  return [
    {
      source: `${POSTHOG_PROXY_PATH}/static/:path*`,
      destination: `${upstream}/static/:path*`,
    },
    {
      source: `${POSTHOG_PROXY_PATH}/array/:path*`,
      destination: `${upstream}/array/:path*`,
    },
    {
      source: `${POSTHOG_PROXY_PATH}/:path*`,
      destination: `${upstream}/:path*`,
    },
  ];
}

/** Is this request path the proxy's? Exactly the path or anything beneath it, never a lookalike prefix. */
export function isPosthogProxyPath(pathname: string): boolean {
  return pathname === POSTHOG_PROXY_PATH || pathname.startsWith(`${POSTHOG_PROXY_PATH}/`);
}

/**
 * Where a trailing-slash request is sent, or null when it is left alone.
 *
 * `skipTrailingSlashRedirect: true` (next.config.ts) is global: PostHog's endpoints are
 * slash-terminated (`/e/`, `/i/v0/e/`, `/flags/`) and Next's default 308 would break them, but
 * the switch also turns the default off for every page, which would leave each one answering 200
 * on a duplicate `/about/`. `src/proxy.ts` re-creates the default for everything that is not the
 * PostHog proxy path: a trailing slash 308s to the slashless form, the root stays `/`.
 *
 * Next's default also removed the slash from paths whose last segment has a dot (`/gcc.git/`),
 * so this does too: every non-root, non-proxy path takes the same rule. Leading slashes are
 * collapsed so the result is never protocol-relative (`//host/` would be an open redirect).
 */
export function slashlessRedirectTarget(pathname: string): string | null {
  if (isPosthogProxyPath(pathname)) return null;
  if (!pathname.endsWith("/")) return null;
  const trimmed = pathname.replace(/\/+$/u, "").replace(/^\/{2,}/u, "/");
  return trimmed === "" ? null : trimmed;
}

/**
 * The visitor's IP. Through the rewrites above, every event would reach PostHog from THIS
 * server, so PostHog would record the host's own address for every visitor and geo-IP would
 * collapse to one city. Forwarding the visitor's address is not enough on its own: PostHog's
 * capture service reads only the LEFTMOST `X-Forwarded-For` entry, and the devino.ca Cloudflare
 * zone strips `X-Forwarded-For` on posthog.devino.ca on purpose (an anti-spoof rule that must
 * never be worked around), so a header sent through Cloudflare never arrives.
 *
 * Capture therefore takes a second route when one is configured: straight to PostHog's capture
 * service over the host's own bridge, never leaving the box (`POSTHOG_CAPTURE_INTERNAL_ORIGIN`,
 * set by compose; the Traefik router behind it is host infra, see RUNBOOK.md). Everything else
 * (the SDK bundle, remote config, flags) keeps the public route above, because only capture
 * records an IP.
 */

/** Capture's own paths, exactly the PathPrefix list of PostHog's capture router. */
const POSTHOG_CAPTURE_PREFIXES = ["/e", "/batch", "/i/v0", "/capture"];

/** Is this proxied sub-path (the part after the proxy path) a capture endpoint? */
function isPosthogCapturePath(subPath: string): boolean {
  return POSTHOG_CAPTURE_PREFIXES.some(
    (prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`),
  );
}

/**
 * The visitor's IP as Cloudflare saw it. `CF-Connecting-IP` is the one header a visitor cannot
 * set: Cloudflare overwrites it on every request. A value that is not shaped like an address is
 * refused, never forwarded.
 */
function trustedVisitorIp(cfConnectingIp: string | null | undefined): string | null {
  const value = cfConnectingIp?.trim();
  if (!value) return null;
  const dottedQuad = (text: string) =>
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(text) &&
    text.split(".").every((octet) => Number(octet) <= 255);
  if (dottedQuad(value)) return value;
  // IPv6, optionally ending in an embedded IPv4 (`::ffff:203.0.113.9`). Only hex digits and
  // colons before that tail, so `1.2.3.4:80` (an address with a port) is not one.
  const embedded = /^([0-9A-Fa-f:]+:)(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(value);
  const head = embedded ? embedded[1] : value;
  const tailOk = embedded ? dottedQuad(embedded[2] ?? "") : true;
  const ipv6 = /^[0-9A-Fa-f:]{2,45}$/u.test(head ?? "") && (head ?? "").includes(":") && tailOk;
  return ipv6 && value.length <= 45 ? value : null;
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
    return null;
  }
}

type PosthogProxyForward = {
  /** Absolute URL to rewrite to over the internal hop, or null to leave the request to the rewrites above. */
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
