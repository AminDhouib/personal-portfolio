// @vitest-environment node
// The three next/dist imports below are Next internals (no public API runs the rewrite matcher
// offline). Re-check this test, and that they still resolve and behave, on every Next upgrade.
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, it } from "vitest";
import {
  POSTHOG_DEFAULT_UPSTREAM_HOST,
  POSTHOG_PROXY_PATH,
  isPosthogProxyPath,
  posthogProxyHeaders,
  posthogProxyRewrites,
  posthogUpstreamHost,
  slashlessRedirectTarget,
} from "@/lib/posthog-proxy";

describe("the proxy path", () => {
  it("is a short, meaningless path that ad-blocker rules do not match", () => {
    expect(POSTHOG_PROXY_PATH).toMatch(/^\/_p\/[a-z0-9]{3}$/);
    for (const word of ["ingest", "analytics", "posthog", "collect", "track", "telemetry"]) {
      expect(POSTHOG_PROXY_PATH).not.toContain(word);
    }
  });

  it("matches the path itself and anything beneath it, never a lookalike prefix", () => {
    expect(isPosthogProxyPath(POSTHOG_PROXY_PATH)).toBe(true);
    expect(isPosthogProxyPath(`${POSTHOG_PROXY_PATH}/`)).toBe(true);
    expect(isPosthogProxyPath(`${POSTHOG_PROXY_PATH}/e/`)).toBe(true);
    expect(isPosthogProxyPath(`${POSTHOG_PROXY_PATH}/array/abc/config.js`)).toBe(true);
    expect(isPosthogProxyPath(`${POSTHOG_PROXY_PATH}x`)).toBe(false);
    expect(isPosthogProxyPath(`${POSTHOG_PROXY_PATH}x/e/`)).toBe(false);
    expect(isPosthogProxyPath("/about/")).toBe(false);
    expect(isPosthogProxyPath("/")).toBe(false);
  });
});

describe("posthogUpstreamHost", () => {
  it("falls back to the self-hosted instance when unset or blank", () => {
    expect(posthogUpstreamHost(undefined)).toBe(POSTHOG_DEFAULT_UPSTREAM_HOST);
    expect(posthogUpstreamHost(null)).toBe(POSTHOG_DEFAULT_UPSTREAM_HOST);
    expect(posthogUpstreamHost("")).toBe(POSTHOG_DEFAULT_UPSTREAM_HOST);
    expect(posthogUpstreamHost("   ")).toBe(POSTHOG_DEFAULT_UPSTREAM_HOST);
    expect(POSTHOG_DEFAULT_UPSTREAM_HOST).toBe("https://posthog.devino.ca");
  });

  it("uses the configured host and trims trailing slashes so destinations have no double slash", () => {
    expect(posthogUpstreamHost("https://ph.example.com")).toBe("https://ph.example.com");
    expect(posthogUpstreamHost(" https://ph.example.com/ ")).toBe("https://ph.example.com");
    expect(posthogUpstreamHost("https://ph.example.com///")).toBe("https://ph.example.com");
  });
});

// Next's own matcher, not a stand-in. A non-internal rewrite source is compiled by
// `buildCustomRoute` (next/dist/server/lib/router-utils/filesystem.js) with `getPathMatch`
// (next/dist/shared/lib/router/utils/path-match.js: strict, unnamed params removed, insensitive)
// whose regex goes through `modifyRouteRegex` (next/dist/lib/redirect-status.js), which appends an
// optional trailing slash. `resolveRoutes` (server/lib/router-utils/resolve-routes.js) then runs
// the first matching rule's destination through `prepareDestination` with `appendParamsToQuery`.
// This runs exactly those functions of the installed Next (16.3.8 at the time of writing), so
// the rule list is checked against what Next really does, including that optional-slash modifier:
// a `:path*` source swallows the final slash of the path it matches.
function resolveRewrite(
  rules: ReturnType<typeof posthogProxyRewrites>,
  pathname: string,
): string | null {
  for (const rule of rules) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      sensitive: false,
      regexModifier: (regex: string) => modifyRouteRegex(regex),
    });
    const params = match(pathname);
    if (params === false) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: true,
      destination: rule.destination,
      params,
      query: {},
    });
    return `${parsedDestination.origin}${parsedDestination.pathname}`;
  }
  return null;
}

describe("posthogProxyRewrites", () => {
  const UPSTREAM = "https://ph.example.com";
  const rules = posthogProxyRewrites(UPSTREAM);
  const rewrite = (subPath: string) => resolveRewrite(rules, `${POSTHOG_PROXY_PATH}${subPath}`);

  it("lists exactly the allowed paths, one rule each, all under the proxy path", () => {
    expect(rules.map((rule) => rule.source.slice(POSTHOG_PROXY_PATH.length))).toEqual([
      "/e",
      "/i/v0/e",
      "/i/v1/:path*",
      "/s",
      "/flags",
      "/static/:path*",
      "/array/:path*",
      "/api/surveys",
      "/api/web_experiments",
      "/api/product_tours",
      "/api/early_access_features",
    ]);
    expect(rules.every((rule) => rule.source.startsWith(`${POSTHOG_PROXY_PATH}/`))).toBe(true);
  });

  it.each([
    // capture
    ["/e/", "/e/"],
    ["/e", "/e/"],
    ["/i/v0/e/", "/i/v0/e/"],
    ["/i/v0/e", "/i/v0/e/"],
    ["/i/v1/logs", "/i/v1/logs"],
    ["/i/v1/metrics", "/i/v1/metrics"],
    // session recording
    ["/s/", "/s/"],
    ["/s", "/s/"],
    // flags and remote config
    ["/flags/", "/flags/"],
    ["/flags", "/flags/"],
    // the SDK's bundles and remote config
    ["/static/recorder.js", "/static/recorder.js"],
    ["/static/1.399.2/surveys.js", "/static/1.399.2/surveys.js"],
    ["/array/phc_key/config", "/array/phc_key/config"],
    ["/array/phc_key/config.js", "/array/phc_key/config.js"],
    // token-scoped public reads
    ["/api/surveys/", "/api/surveys/"],
    ["/api/surveys", "/api/surveys/"],
    ["/api/web_experiments/", "/api/web_experiments/"],
    ["/api/product_tours/", "/api/product_tours/"],
    ["/api/early_access_features/", "/api/early_access_features/"],
  ])("forwards %s to %s on the upstream", (subPath, upstreamPath) => {
    expect(rewrite(subPath)).toBe(`${UPSTREAM}${upstreamPath}`);
  });

  it.each([
    "",
    "/",
    "/login",
    "/login/",
    "/admin",
    "/admin/",
    "/api/projects/",
    "/api/projects/1/",
    "/api/",
    "/api/surveys/1/",
    "/api/surveys/../projects/",
    "/api/conversations/v1/widget/message",
    "/i/",
    "/i/v0/",
    "/i/v0/x/",
    "/i/v2/logs",
    "/batch",
    "/batch/",
    "/capture",
    "/capture/",
    "/decide/",
    "/engage/",
    "/ee/",
    "/events/",
    "/ex/",
    "/flagsx/",
    "/statics/x.js",
    "/arrays/x.js",
  ])("does not forward %j (the app answers 404)", (subPath) => {
    expect(rewrite(subPath)).toBeNull();
  });

  it("never forwards a path outside the proxy path, or a lookalike prefix of it", () => {
    expect(resolveRewrite(rules, "/e/")).toBeNull();
    expect(resolveRewrite(rules, `${POSTHOG_PROXY_PATH}x/e/`)).toBeNull();
  });

  it("defaults the destination host and trims its trailing slash", () => {
    const defaults = posthogProxyRewrites(undefined);
    expect(
      defaults.every((rule) => rule.destination.startsWith("https://posthog.devino.ca/")),
    ).toBe(true);
    const trimmed = posthogProxyRewrites("https://ph.example.com/");
    expect(trimmed.some((rule) => rule.destination.includes("com//"))).toBe(false);
  });
});

describe("posthogProxyHeaders", () => {
  it("marks everything under the proxy path, and the path itself, noindex", () => {
    expect(posthogProxyHeaders()).toEqual([
      {
        source: `${POSTHOG_PROXY_PATH}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ]);
  });
});

describe("slashlessRedirectTarget", () => {
  it("strips the trailing slash from a page path, like Next's default", () => {
    expect(slashlessRedirectTarget("/about/")).toBe("/about");
    expect(slashlessRedirectTarget("/games/hextris/")).toBe("/games/hextris");
    expect(slashlessRedirectTarget("/blog/some-post/")).toBe("/blog/some-post");
  });

  it("strips for file-like and dotted paths too, which Next's default also redirected", () => {
    expect(slashlessRedirectTarget("/gcc.git/")).toBe("/gcc.git");
    expect(slashlessRedirectTarget("/version/1.2.3/my-page/")).toBe("/version/1.2.3/my-page");
    expect(slashlessRedirectTarget("/.well-known/x/")).toBe("/.well-known/x");
    expect(slashlessRedirectTarget("/robots.txt/")).toBe("/robots.txt");
  });

  it("collapses a run of trailing slashes in its target", () => {
    expect(slashlessRedirectTarget("/about///")).toBe("/about");
  });

  it("leaves paths without a trailing slash and the root alone", () => {
    expect(slashlessRedirectTarget("/about")).toBeNull();
    expect(slashlessRedirectTarget("/")).toBeNull();
    expect(slashlessRedirectTarget("")).toBeNull();
    expect(slashlessRedirectTarget("//")).toBeNull();
  });

  it("keeps the PostHog proxy path exactly as written", () => {
    expect(slashlessRedirectTarget(`${POSTHOG_PROXY_PATH}/e/`)).toBeNull();
    expect(slashlessRedirectTarget(`${POSTHOG_PROXY_PATH}/i/v0/e/`)).toBeNull();
    expect(slashlessRedirectTarget(`${POSTHOG_PROXY_PATH}/`)).toBeNull();
    // ...but a lookalike prefix is an ordinary page path
    expect(slashlessRedirectTarget(`${POSTHOG_PROXY_PATH}x/`)).toBe(`${POSTHOG_PROXY_PATH}x`);
  });

  it("never produces a protocol-relative target (open redirect)", () => {
    expect(slashlessRedirectTarget("//evil.example.com/")).toBe("/evil.example.com");
    expect(slashlessRedirectTarget("///evil.example.com//")).toBe("/evil.example.com");
  });
});
