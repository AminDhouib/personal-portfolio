import type { MetadataRoute } from "next";
import { POSTHOG_PROXY_PATH } from "@/lib/posthog-proxy";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The first-party PostHog proxy path (src/lib/posthog-proxy.ts): API traffic, not pages.
      // Only its first segment is published (`/_p/`), never the full ad-blocker-dodging path.
      disallow: [`/${POSTHOG_PROXY_PATH.split("/")[1]}/`],
    },
    sitemap: "https://amindhou.com/sitemap.xml",
  };
}
