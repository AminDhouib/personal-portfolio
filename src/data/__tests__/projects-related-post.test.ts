import { describe, expect, it } from "vitest";
import { projects } from "../projects";
import { getAllBlogSlugs, getBlogPost } from "@/lib/blog";

describe("project relatedPost", () => {
  it("points every relatedPost at a real blog post", () => {
    const slugs = getAllBlogSlugs();
    for (const project of projects) {
      if (!project.relatedPost) continue;
      expect(slugs, `${project.slug} relatedPost`).toContain(project.relatedPost);
      expect(getBlogPost(project.relatedPost), `${project.slug} post loads`).not.toBeNull();
    }
  });
});
