import { describe, it, expect } from "vitest";
import { getAllBlogPosts } from "@/lib/blog";
import { projects } from "@/data/projects";
import sitemap from "../sitemap";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it("lists each URL once", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("includes the /work hub and every project page", () => {
    expect(urls).toContain("https://amindhou.com/work");
    for (const project of projects) {
      expect(urls).toContain(`https://amindhou.com/work/${project.slug}`);
    }
  });

  it("dates each blog post by its publish date, not the build time", () => {
    for (const post of getAllBlogPosts()) {
      const entry = entries.find((e) => e.url === `https://amindhou.com/blog/${post.slug}`);
      expect(entry?.lastModified).toEqual(new Date(post.date));
    }
  });

  it("dates the blog index by its newest post", () => {
    const [newest] = getAllBlogPosts();
    const index = entries.find((e) => e.url === "https://amindhou.com/blog");
    expect(index?.lastModified).toEqual(new Date(newest!.date));
  });
});
