import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

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
});
