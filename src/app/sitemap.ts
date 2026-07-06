import type { MetadataRoute } from "next";
import { getAllBlogSlugs } from "@/lib/blog";
import { projects } from "@/data/projects";
import { GAMES } from "@/app/games/games-meta";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://amindhou.com";

  const projectSlugs = projects.map((p) => p.slug);
  const blogSlugs = getAllBlogSlugs();
  const gameSlugs = GAMES.filter((g) => !g.hidden && !g.external).map((g) => g.slug);

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    {
      url: `${baseUrl}/reviews`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/games`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
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
    ...gameSlugs.map((slug) => ({
      url: `${baseUrl}/games/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];
}
