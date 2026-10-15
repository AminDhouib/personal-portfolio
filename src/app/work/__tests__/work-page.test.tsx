import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WorkDetailPage, { generateMetadata } from "../[slug]/page";
import { projects } from "@/data/projects";

vi.mock("@/lib/ga4", () => ({ fetchMAU: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/blog", () => ({
  getBlogPost: vi.fn((slug: string) =>
    slug === "caramel-open-source-story"
      ? { slug, title: "Caramel, the Open-Source Honey Alternative Extension" }
      : null,
  ),
}));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("/work/[slug] page", () => {
  afterEach(() => {
    cleanup();
  });

  it("titles every project page with its name and tagline", async () => {
    for (const project of projects) {
      const meta = await generateMetadata(params(project.slug));
      expect(meta.title).toBe(`${project.name}: ${project.tagline}`);
    }
  });

  it("links the Caramel page to its blog post with the post title as anchor text", async () => {
    render(await WorkDetailPage(params("caramel")));
    const link = screen.getByRole("link", {
      name: "Caramel, the Open-Source Honey Alternative Extension",
    });
    expect(link).toHaveAttribute("href", "/blog/caramel-open-source-story");
  });

  it("renders no blog link for a project without relatedPost", async () => {
    const { container } = render(await WorkDetailPage(params("shorty")));
    expect(container.querySelector('a[href^="/blog/"]')).toBeNull();
  });
});
