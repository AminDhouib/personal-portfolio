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
 * (no tsconfig path mapping, so no `@/` alias in here), and so does the browser bundle
 * (`src/instrumentation-client.ts`), which is why nothing server-only (`node:net`) may be imported
 * here; the visitor-IP forwarding lives in `posthog-proxy-forward.ts`.
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
 * The flat bundles a self-hosted PostHog serves under `/static` (read off the live instance with
 * plain GETs): the SDK's lazy extensions plus the main bundle. Anything else under `/static`, and
 * every `/static/<version>/...` URL, is answered `302 /login` by that instance. posthog-js 1.438
 * also loads `web-vitals-soft-navs` and `web-vitals-with-attribution-soft-navs` (its soft-navigation
 * variants); both were probed on 2026-10-30 and are left out because the host does not serve them
 * (302 /login), so mapping them would only trade one failed load for another.
 */
const POSTHOG_STATIC_BUNDLES = [
  "array",
  "recorder",
  "lazy-recorder",
  "surveys",
  "dead-clicks-autocapture",
  "exception-autocapture",
  "product-tours",
  "tracing-headers",
  "toolbar",
  "logs",
  "web-vitals",
  "web-vitals-with-attribution",
  "conversations",
];

/**
 * A versioned bundle URL, `/static/<semver>/<bundle>.js`, which posthog-js requests when
 * `strict_script_versioning` is on or 'fallback' (its default from 1.438). The self-hosted instance
 * has no versioned paths, so the request would end in `302 /login`, a failed script load, and the
 * SDK removing its script node (T-7017). It is mapped to the flat bundle the instance does serve,
 * for the allow-listed bundles only, so the load succeeds. This is the SAME bundle an unversioned
 * request already gets (`strict_script_versioning: false` in `instrumentation-client.ts` stays),
 * i.e. the server's PostHog version, not the SDK's: the version is dropped, never honoured.
 * Only plain `major.minor.patch` matches: a prerelease such as 1.440.0-beta.1 deliberately falls
 * through to the generic `/static/:path*` rule, since posthog-js does not publish prereleases to
 * latest. Must precede that generic rule: the first match wins.
 */
const POSTHOG_VERSIONED_STATIC_SUBPATH = `/static/:version(\\d+\\.\\d+\\.\\d+)/:file(${POSTHOG_STATIC_BUNDLES.join("|")}).js`;

/**
 * What the SDK may reach through the proxy: an allow-list grounded in posthog-js (1.399.x),
 * where every request goes through `endpointFor` (`api_host` is the proxy path). Nothing else
 * under the proxy path is forwarded: a catch-all would expose PostHog's whole app surface
 * (`/login`, `/admin`, the private `/api/projects/...`) on this origin.
 *
 *  - `/e` and `/i/v0/e`: capture. `/i/v1/:path*`: the logs and metrics ingest (`/i/v1/logs`,
 *    `/i/v1/metrics`). `/i/v0/e` is its own literal rule, not part of a `/i/:path*` wildcard,
 *    because a `:path*` source swallows the final slash of what it matches and `/i/v0/e/` must
 *    reach PostHog with it (see the next paragraph).
 *  - `/s`: session recording snapshots (recording is switched on in the PostHog project).
 *  - `/flags`: feature flags and remote config (`/flags/?v=2`).
 *  - `/static/:path*` and `/array/:path*`: the SDK's lazy bundles and its remote config. A
 *    versioned `/static/<semver>/<bundle>.js` is mapped onto the flat bundle first (see
 *    `POSTHOG_VERSIONED_STATIC_SUBPATH`).
 *  - four token-scoped public reads under `/api` (surveys, web experiments, product tours, early
 *    access features), listed by exact path, never `/api/:path*`.
 *
 * Not allowed on purpose: `/api/conversations/v1/widget/*` (the conversations widget; this site
 * does not load it), `/batch` and `/capture` (the SDK never calls them), and anything else.
 *
 * Exact paths are written without a trailing slash and forwarded WITH one, because PostHog's
 * endpoints are slash-terminated. Next matches the slashless source against both spellings (its
 * `modifyRouteRegex` appends an optional slash to every rewrite source). A wildcard source's
 * `:path*` swallows a trailing slash, so wildcards are used only where the SDK's URLs carry none
 * (`/static/...`, `/array/...`, `/i/v1/...`). `__tests__/posthog-proxy.test.ts` runs Next's real
 * matcher over this list to pin all of it.
 */
const POSTHOG_ALLOWED_PATHS: ReadonlyArray<{ subPath: string; upstream: string }> = [
  { subPath: "/e", upstream: "/e/" },
  { subPath: "/i/v0/e", upstream: "/i/v0/e/" },
  { subPath: "/i/v1/:path*", upstream: "/i/v1/:path*" },
  { subPath: "/s", upstream: "/s/" },
  { subPath: "/flags", upstream: "/flags/" },
  { subPath: POSTHOG_VERSIONED_STATIC_SUBPATH, upstream: "/static/:file.js" },
  { subPath: "/static/:path*", upstream: "/static/:path*" },
  { subPath: "/array/:path*", upstream: "/array/:path*" },
  { subPath: "/api/surveys", upstream: "/api/surveys/" },
  { subPath: "/api/web_experiments", upstream: "/api/web_experiments/" },
  { subPath: "/api/product_tours", upstream: "/api/product_tours/" },
  { subPath: "/api/early_access_features", upstream: "/api/early_access_features/" },
];

/**
 * The rewrite rules: one per allowed path, to the same path on PostHog. A self-hosted PostHog
 * serves the SDK bundle and its remote config from the same host as the API, so every rule shares
 * one upstream. A request under the proxy path that matches none of them is not rewritten and
 * falls through to the app's own 404.
 */
export function posthogProxyRewrites(
  configuredHost: string | null | undefined,
): PosthogProxyRewrite[] {
  const upstream = posthogUpstreamHost(configuredHost);
  return POSTHOG_ALLOWED_PATHS.map(({ subPath, upstream: destination }) => ({
    source: `${POSTHOG_PROXY_PATH}${subPath}`,
    destination: `${upstream}${destination}`,
  }));
}

/**
 * The proxy path holds PostHog's responses, not pages: keep it out of search indexes. robots.txt
 * disallows `/_p/` as well, but a blocked URL can still be indexed from a link, and this header
 * is what actually says "do not index" on a response a crawler did fetch.
 *
 * Checked against a production build: this header lands on the app's own answers under the path
 * (the 404s). A response proxied from PostHog carries the upstream's headers only, and neither
 * `headers()` nor `src/proxy.ts` can add one to it. Those URLs are not discoverable (nothing
 * links to them) and robots.txt disallows them, so the gap is accepted.
 */
export function posthogProxyHeaders(): Array<{
  source: string;
  headers: Array<{ key: string; value: string }>;
}> {
  return [
    {
      source: `${POSTHOG_PROXY_PATH}/:path*`,
      headers: [{ key: "X-Robots-Tag", value: "noindex" }],
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
