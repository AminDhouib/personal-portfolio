// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  POSTHOG_DEFAULT_UPSTREAM_HOST,
  POSTHOG_PROXY_PATH,
  isPosthogProxyPath,
  planPosthogProxyForward,
  posthogProxyRewrites,
  posthogUpstreamHeaders,
  posthogUpstreamHost,
  slashlessRedirectTarget,
} from "@/lib/posthog-proxy";

const INTERNAL = "http://posthog-capture.internal";

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

describe("posthogProxyRewrites", () => {
  it("lists static, then array, then the catch-all, so the SDK bundle is not swallowed", () => {
    const rules = posthogProxyRewrites("https://ph.example.com");
    expect(rules).toEqual([
      {
        source: `${POSTHOG_PROXY_PATH}/static/:path*`,
        destination: "https://ph.example.com/static/:path*",
      },
      {
        source: `${POSTHOG_PROXY_PATH}/array/:path*`,
        destination: "https://ph.example.com/array/:path*",
      },
      {
        source: `${POSTHOG_PROXY_PATH}/:path*`,
        destination: "https://ph.example.com/:path*",
      },
    ]);
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

describe("planPosthogProxyForward", () => {
  const plan = (
    subPath: string,
    over: Partial<Parameters<typeof planPosthogProxyForward>[0]> = {},
  ) =>
    planPosthogProxyForward({
      pathname: `${POSTHOG_PROXY_PATH}${subPath}`,
      search: "",
      cfConnectingIp: "203.0.113.9",
      internalCaptureOrigin: INTERNAL,
      ...over,
    });

  it.each(["/e", "/e/", "/batch", "/batch/", "/i/v0/e/", "/i/v0", "/capture", "/capture/"])(
    "sends capture path %s over the internal hop, slash kept",
    (subPath) => {
      expect(plan(subPath).internalRewrite).toBe(`${INTERNAL}${subPath}`);
    },
  );

  it("keeps the query string on the internal hop", () => {
    expect(plan("/e/", { search: "?ip=0&_=1&ver=1.2" }).internalRewrite).toBe(
      `${INTERNAL}/e/?ip=0&_=1&ver=1.2`,
    );
  });

  it.each([
    "/static/recorder.js",
    "/array/phc_key/config.js",
    "/flags/",
    "/decide/",
    "/",
    "",
    "/ee/",
    "/engage/",
    // lookalikes of capture prefixes: not capture
    "/event/",
    "/ex/",
    "/batches/",
    "/captured/",
    "/capture-x/",
    "/i/v1/e/",
    "/i/v0x/",
  ])("leaves %s to the public rewrite", (subPath) => {
    expect(plan(subPath).internalRewrite).toBeNull();
  });

  it("never takes the hop for a path outside the proxy path, even if it looks like capture", () => {
    expect(
      planPosthogProxyForward({
        pathname: "/e/",
        search: "",
        cfConnectingIp: "203.0.113.9",
        internalCaptureOrigin: INTERNAL,
      }).internalRewrite,
    ).toBeNull();
    expect(
      planPosthogProxyForward({
        pathname: `${POSTHOG_PROXY_PATH}x/e/`,
        search: "",
        cfConnectingIp: "203.0.113.9",
        internalCaptureOrigin: INTERNAL,
      }).internalRewrite,
    ).toBeNull();
  });

  it.each([undefined, null, "", "   ", "not a url", "ftp://posthog-capture.internal"])(
    "a blank or unusable internal origin (%j) disables the hop",
    (origin) => {
      expect(plan("/e/", { internalCaptureOrigin: origin }).internalRewrite).toBeNull();
    },
  );

  it("normalises the internal origin to scheme and host so a stray path or slash cannot leak in", () => {
    expect(plan("/e/", { internalCaptureOrigin: `${INTERNAL}/` }).internalRewrite).toBe(
      `${INTERNAL}/e/`,
    );
    expect(plan("/e/", { internalCaptureOrigin: `${INTERNAL}/extra` }).internalRewrite).toBe(
      `${INTERNAL}/e/`,
    );
  });

  it("forwards the visitor's CF-Connecting-IP as the forwarded-for", () => {
    expect(plan("/e/").forwardedFor).toBe("203.0.113.9");
    expect(plan("/e/", { cfConnectingIp: " 203.0.113.9 " }).forwardedFor).toBe("203.0.113.9");
    expect(plan("/e/", { cfConnectingIp: "2001:db8::1" }).forwardedFor).toBe("2001:db8::1");
    expect(plan("/e/", { cfConnectingIp: "::ffff:203.0.113.9" }).forwardedFor).toBe(
      "::ffff:203.0.113.9",
    );
  });

  it.each([
    undefined,
    null,
    "",
    "   ",
    "unknown",
    "1.2.3",
    "1.2.3.4.5",
    "1.2.3.4, 5.6.7.8",
    "1.2.3.4:80",
    "999.1.1.1",
    "::ffff:999.1.1.1",
    "evil.example.com",
    "1.2.3.4\r\nx-injected: 1",
    "<script>",
    "::::::::::::::::::::::::::::::::::::::::::::::::",
    "abc",
    "1111",
  ])("refuses a CF-Connecting-IP that is not shaped like an address (%j)", (value) => {
    expect(plan("/e/", { cfConnectingIp: value }).forwardedFor).toBeNull();
  });

  it("still plans a forwarded-for for a non-capture proxy path (the public route needs it too)", () => {
    const result = plan("/array/phc_key/config.js");
    expect(result.internalRewrite).toBeNull();
    expect(result.forwardedFor).toBe("203.0.113.9");
  });
});

describe("posthogUpstreamHeaders", () => {
  it("replaces whatever X-Forwarded-For arrived with the visitor's address", () => {
    const incoming = new Headers({
      "x-forwarded-for": "6.6.6.6, 10.0.0.2",
      "content-type": "text/plain",
      "user-agent": "ua",
    });
    const out = posthogUpstreamHeaders(incoming, "203.0.113.9");
    expect(out.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(out.get("content-type")).toBe("text/plain");
    expect(out.get("user-agent")).toBe("ua");
  });

  it("sends no X-Forwarded-For at all when there is no trusted visitor address", () => {
    const out = posthogUpstreamHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" }), null);
    expect(out.has("x-forwarded-for")).toBe(false);
  });

  it("does not mutate the incoming headers", () => {
    const incoming = new Headers({ "x-forwarded-for": "6.6.6.6" });
    posthogUpstreamHeaders(incoming, "203.0.113.9");
    expect(incoming.get("x-forwarded-for")).toBe("6.6.6.6");
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

  it("collapses a run of trailing slashes in one hop", () => {
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
