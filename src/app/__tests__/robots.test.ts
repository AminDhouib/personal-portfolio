import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { posthogProxyRewrites } from "@/lib/posthog-proxy";

describe("robots", () => {
  it("allows the site, points at the sitemap and keeps crawlers off the analytics proxy path", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.userAgent).toBe("*");
    expect(rules[0]?.allow).toBe("/");
    expect(rules[0]?.disallow).toEqual(["/_p/"]);
    expect(result.sitemap).toBe("https://amindhou.com/sitemap.xml");
  });

  it("disallows every path the proxy forwards, so the two cannot drift apart", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallowed = [rules[0]?.disallow ?? []].flat();
    // A rewrite source minus its wildcard tail is a concrete URL under the proxy path.
    const sources = posthogProxyRewrites(undefined).map(({ source }) =>
      source.replace(/\/?:.*$/u, ""),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(disallowed.some((prefix) => `${source}/`.startsWith(prefix))).toBe(true);
    }
  });
});
