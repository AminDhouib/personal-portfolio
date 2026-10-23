import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WorkDetailPage, { generateMetadata, generateStaticParams, revalidate } from "../[slug]/page";
import * as workPage from "../[slug]/page";
import { projects } from "@/data/projects";

const { fetchMAU } = vi.hoisted(() => ({ fetchMAU: vi.fn() }));

vi.mock("@/lib/ga4", () => ({ fetchMAU }));
vi.mock("@/lib/blog", () => ({
  getBlogPost: vi.fn((slug: string) =>
    slug === "caramel-open-source-story"
      ? { slug, title: "Caramel, the Open-Source Honey Alternative Extension" }
      : null,
  ),
}));

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("/work/[slug] page", () => {
  beforeEach(() => {
    fetchMAU.mockReset();
    fetchMAU.mockResolvedValue(null);
  });

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

  it("shows the live GA4 figure and the live badge when GA4 returns data", async () => {
    fetchMAU.mockResolvedValue(189200);
    render(await WorkDetailPage(params("unotes")));
    expect(fetchMAU).toHaveBeenCalledWith("unotes");
    expect(screen.getByText("189.2K monthly active users")).toBeInTheDocument();
    expect(screen.getByText("live · last 30 days")).toBeInTheDocument();
  });

  it("shows the mauFallback figure and no live badge when GA4 returns null", async () => {
    const shorty = projects.find((p) => p.slug === "shorty");
    render(await WorkDetailPage(params("shorty")));
    expect(
      screen.getByText(`${((shorty?.mauFallback ?? 0) / 1000).toFixed(1)}K monthly active users`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/live · last 30 days/)).toBeNull();
  });

  it("answers an unknown slug with a 404", async () => {
    await expect(WorkDetailPage(params("not-a-project"))).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
  });
});

// GA4 credentials exist only at runtime, so a slug prerendered by `next build`
// would bake mauFallback into the HTML. These pin the rendering mode that
// avoids it: nothing is prerendered at build, each slug renders on its first
// request with the runtime env, then follows ISR.
describe("/work/[slug] rendering mode", () => {
  it("prerenders no slug at build", () => {
    expect(generateStaticParams()).toEqual([]);
  });

  it("keeps on-demand rendering of unlisted-at-build slugs on", () => {
    expect((workPage as { dynamicParams?: boolean }).dynamicParams).not.toBe(false);
  });

  it("regenerates hourly so a first render that missed GA4 heals", () => {
    expect(revalidate).toBe(3600);
  });
});
