import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The first-party PostHog proxy path (src/lib/posthog-proxy.ts): API traffic, not pages.
      disallow: ["/_p/"],
    },
    sitemap: "https://amindhou.com/sitemap.xml",
  };
}
