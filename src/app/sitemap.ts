import type { MetadataRoute } from "next";
import { getAllBlogPosts } from "@/lib/blog";
import { projects } from "@/data/projects";
import { GAMES } from "@/app/games/games-meta";
import { PG2_HINTS_PATH } from "@/app/games/password-game/hints/hints-content";
import { SOLVER_PATH } from "@/app/games/super-voltorb-flip/solver/solver-content";

/** A post's front-matter date, or undefined when it is missing or unparseable. */
function postDate(date: string): Date | undefined {
  const parsed = new Date(date);
  return date && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://amindhou.com";

  const projectSlugs = projects.map((p) => p.slug);
  const posts = getAllBlogPosts();
  const gameSlugs = GAMES.filter((g) => !g.hidden).map((g) => g.slug);
  // Posts are sorted newest-first, so the blog index changed when its newest post did.
  const newestPostDate = posts.map((p) => postDate(p.date)).find((d) => d !== undefined);

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/work`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    {
      url: `${baseUrl}/blog`,
      lastModified: newestPostDate ?? new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    { url: `${baseUrl}/ai`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
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
    // A post's lastmod is its publish date, not the build time: stamping every
    // URL with "now" on each deploy teaches crawlers to ignore lastmod.
    ...posts.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: postDate(post.date) ?? new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...gameSlugs.map((slug) => ({
      url: `${baseUrl}/games/${slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    {
      url: `${baseUrl}${SOLVER_PATH}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}${PG2_HINTS_PATH}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
