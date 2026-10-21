// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";

// src/proxy.ts is the Next 16 proxy (the renamed middleware). It does two jobs: first-party
// PostHog forwarding, and the slashless redirect that skipTrailingSlashRedirect (next.config.ts)
// switched off globally. Both are pinned here against real NextRequest/NextResponse objects.

const ORIGIN = "https://amindhou.com";
const INTERNAL = "http://posthog-capture.internal";

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${ORIGIN}${path}`, init);
}

function rewriteTarget(response: Response): string | null {
  return response.headers.get("x-middleware-rewrite");
}

// The headers a response tells Next to hand the next stage, as a lower-cased map. Next encodes
// them as x-middleware-override-headers (the full name list) plus x-middleware-request-<name>.
function forwardedRequestHeaders(response: Response): Record<string, string> | null {
  const names = response.headers.get("x-middleware-override-headers");
  if (names === null) return null;
  return Object.fromEntries(
    names
      .split(",")
      .map((name) => [name, response.headers.get(`x-middleware-request-${name}`) ?? ""]),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: capture requests", () => {
  it("rewrites a capture POST to the internal origin with the visitor's IP as the only forwarded-for", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", INTERNAL);
    const response = await proxy(
      request(`${POSTHOG_PROXY_PATH}/e/?ip=0&_=1`, {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          "x-forwarded-for": "6.6.6.6, 10.0.0.2",
          "user-agent": "ua-test",
        },
      }),
    );
    expect(rewriteTarget(response)).toBe(`${INTERNAL}/e/?ip=0&_=1`);
    expect(response.status).toBe(200);
    const headers = forwardedRequestHeaders(response);
    expect(headers?.["x-forwarded-for"]).toBe("203.0.113.9");
    expect(headers?.["user-agent"]).toBe("ua-test");
  });

  it("drops a forged forwarded-for and sends none when Cloudflare gave no visitor address", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", INTERNAL);
    const response = await proxy(
      request(`${POSTHOG_PROXY_PATH}/i/v0/e/`, {
        method: "POST",
        headers: { "x-forwarded-for": "6.6.6.6" },
      }),
    );
    expect(rewriteTarget(response)).toBe(`${INTERNAL}/i/v0/e/`);
    expect(forwardedRequestHeaders(response)).not.toHaveProperty("x-forwarded-for");
  });

  it("refuses a CF-Connecting-IP that is not an address", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", INTERNAL);
    const response = await proxy(
      request(`${POSTHOG_PROXY_PATH}/e/`, {
        method: "POST",
        headers: { "cf-connecting-ip": "evil.example.com", "x-forwarded-for": "6.6.6.6" },
      }),
    );
    expect(forwardedRequestHeaders(response)).not.toHaveProperty("x-forwarded-for");
  });

  it("is not a redirect: the slash on /e/ survives", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", INTERNAL);
    const response = await proxy(request(`${POSTHOG_PROXY_PATH}/e/`, { method: "POST" }));
    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
  });

  it("a blank internal origin falls back to the public rewrite (no hop)", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", "");
    const response = await proxy(
      request(`${POSTHOG_PROXY_PATH}/e/`, {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.9" },
      }),
    );
    expect(rewriteTarget(response)).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("an unset internal origin also disables the hop", async () => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", undefined);
    const response = await proxy(request(`${POSTHOG_PROXY_PATH}/e/`, { method: "POST" }));
    expect(rewriteTarget(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: everything else under the proxy path", () => {
  it.each([
    "/array/phc_key/config.js",
    "/static/recorder.js",
    "/flags/?v=2",
    "/decide/",
    "/",
    "/ex/",
  ])("passes %s through to next.config.ts rewrites, slash kept", async (subPath) => {
    vi.stubEnv("POSTHOG_CAPTURE_INTERNAL_ORIGIN", INTERNAL);
    const response = await proxy(request(`${POSTHOG_PROXY_PATH}${subPath}`));
    expect(rewriteTarget(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.status).toBe(200);
  });

  it("still strips a forged forwarded-for on the public route", async () => {
    const response = await proxy(
      request(`${POSTHOG_PROXY_PATH}/flags/`, { headers: { "x-forwarded-for": "6.6.6.6" } }),
    );
    expect(forwardedRequestHeaders(response)).not.toHaveProperty("x-forwarded-for");
  });
});

describe("proxy: trailing slashes on ordinary paths", () => {
  it.each([
    ["/about/", "/about"],
    ["/games/hextris/", "/games/hextris"],
    ["/blog/some-post/", "/blog/some-post"],
    ["/api/health/", "/api/health"],
    ["/robots.txt/", "/robots.txt"],
    ["/about///", "/about"],
    ["/monitoring/", "/monitoring"],
  ])("answers 308 for %s, to the slashless form %s", async (path, target) => {
    const response = await proxy(request(path));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${ORIGIN}${target}`);
  });

  it("keeps the query string on the redirect", async () => {
    const response = await proxy(request("/games/?utm_source=x&a=1"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/games?utm_source=x&a=1`);
  });

  it("keeps the method-preserving status for non-GET requests", async () => {
    const response = await proxy(request("/api/leads/", { method: "POST" }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/api/leads`);
  });

  // The proxy hands Next an absolute URL because a hand-built relative Location makes the server
  // throw "Invalid URL" and answer 500. Next then relativises an absolute Location on its own
  // origin before it goes out, so the value on the wire is `/about` (RUNBOOK.md's curl check).
  it("builds the redirect as an absolute URL on the origin the visitor used", async () => {
    const response = await proxy(request("/about/"));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/about`);
    expect(response.headers.get("location")).toMatch(/^https:\/\/amindhou\.com\//);
  });

  it("cannot be turned into a protocol-relative or foreign-host redirect", async () => {
    const response = await proxy(request("//evil.example.com/"));
    const location = response.headers.get("location");
    expect(location === null || new URL(location).origin === ORIGIN).toBe(true);
  });

  it.each(["/", "/about", "/games/hextris", "/sitemap.xml", "/llms.txt"])(
    "leaves %s untouched",
    async (path) => {
      const response = await proxy(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("does not touch the query of a slashless path", async () => {
    const response = await proxy(request("/games?a=1"));
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("proxy: matcher", () => {
  const matcher = config.matcher[0] ?? "";
  // Next compiles matcher sources with path-to-regexp; the leading-slash negative lookahead is
  // plain regex, so anchoring it directly is the same test.
  const matches = (path: string) => new RegExp(`^${matcher}$`).test(path);

  it("is a single statically-analysable pattern", () => {
    expect(config.matcher).toHaveLength(1);
  });

  it("runs for pages, API routes, the proxy path and trailing-slash lookalikes of files", () => {
    for (const path of [
      "/",
      "/about/",
      "/games/hextris",
      "/api/health",
      `${POSTHOG_PROXY_PATH}/e/`,
      "/robots.txt/",
      "/favicon.ico/",
      "/sitemap.xml",
      "/llms.txt",
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  // Next buffers a request body in the proxy layer before the route handler runs, which would
  // defeat the Sentry tunnel's idle and overall read deadlines (src/app/monitoring/route.ts).
  // Only the exact tunnel path skips the proxy; lookalikes and the trailing-slash form still run.
  it("skips exactly the Sentry tunnel path, so its body is not buffered ahead of the handler", () => {
    expect(matches("/monitoring")).toBe(false);
    for (const path of [
      "/monitoring/",
      "/monitoringx",
      "/monitoring-extra",
      "/monitoring/x",
      "/api/monitoring",
      "/x/monitoring",
      "/Monitoring",
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("skips build assets and static files", () => {
    for (const path of [
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/logo.svg",
      "/images/me.webp",
      "/fonts/a.woff2",
      "/site.webmanifest",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
