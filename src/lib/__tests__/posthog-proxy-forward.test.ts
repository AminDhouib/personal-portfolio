// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";
import { planPosthogProxyForward, posthogUpstreamHeaders } from "@/lib/posthog-proxy-forward";

const INTERNAL = "http://posthog-capture.internal";

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

  it.each(["/e", "/e/", "/i/v0/e", "/i/v0/e/"])(
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
    // capture endpoints the SDK never calls and the rewrites do not allow: no hop either
    "/batch",
    "/batch/",
    "/capture",
    "/capture/",
    // lookalikes of capture prefixes: not capture
    "/event/",
    "/ex/",
    "/batches/",
    "/captured/",
    "/capture-x/",
    "/i/v1/e/",
    "/i/v0x/",
    // under a capture prefix but not one of the allowed capture paths
    "/i/v0",
    "/i/v0/",
    "/i/v0/e/x",
    "/i/v0/other/",
    "/e/x",
    "/e//",
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
    expect(plan("/e/", { cfConnectingIp: "::1" }).forwardedFor).toBe("::1");
    expect(plan("/e/", { cfConnectingIp: "2606:4700:4700:0:0:0:0:1111" }).forwardedFor).toBe(
      "2606:4700:4700:0:0:0:0:1111",
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
    // junk the old hand-rolled shape check let through
    ":::",
    "1:2",
    "::g",
    "12345::1",
    "1::2::3",
    ":",
    "::ffff:1.2.3",
    // comma-joined lists are a forwarded-for chain, not a single address
    "203.0.113.9,198.51.100.4",
    "2001:db8::1, 203.0.113.9",
    // a zone suffix parses as IPv6 but no real client address carries one
    "fe80::1%eth0",
    "fe80::1%25",
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

  it("strips the client-set address headers whatever the forwarded-for decision", () => {
    const incoming = new Headers({
      "x-real-ip": "6.6.6.6",
      forwarded: "for=6.6.6.6",
      "cf-connecting-ip": "6.6.6.6",
      "user-agent": "ua",
    });
    for (const decision of ["203.0.113.9", null]) {
      const out = posthogUpstreamHeaders(incoming, decision);
      expect(out.has("x-real-ip")).toBe(false);
      expect(out.has("forwarded")).toBe(false);
      expect(out.has("cf-connecting-ip")).toBe(false);
      expect(out.get("user-agent")).toBe("ua");
    }
  });

  it("does not mutate the incoming headers", () => {
    const incoming = new Headers({ "x-forwarded-for": "6.6.6.6" });
    posthogUpstreamHeaders(incoming, "203.0.113.9");
    expect(incoming.get("x-forwarded-for")).toBe("6.6.6.6");
  });
});
