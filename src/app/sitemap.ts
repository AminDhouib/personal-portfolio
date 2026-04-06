import type { MetadataRoute } from "next";
import { getAllBlogSlugs } from "@/lib/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://amindhou.com";

  const projectSlugs = [
    "shorty",
    "unotes",
    "caramel",
    "upup",
    "getitdone",
  ];

  const blogSlugs = getAllBlogSlugs();

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/games`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    ...projectSlugs.map((slug) => ({
      url: `${baseUrl}/work/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...blogSlugs.map((slug) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
