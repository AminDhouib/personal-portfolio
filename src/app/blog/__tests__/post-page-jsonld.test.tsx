import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

vi.mock("@/lib/blog", () => ({
  getAllBlogSlugs: () => ["sep-post"],
  getBlogPost: (slug: string) =>
    slug === "sep-post"
      ? {
          slug,
          title: `Title</script><b>${LS}end`,
          excerpt: `Excerpt${PS}end`,
          date: "2026-01-02",
          tags: ["a"],
          readingTime: "1 min",
          content: "body",
        }
      : null,
  extractToc: () => [],
}));
vi.mock("next-mdx-remote/rsc", () => ({ MDXRemote: () => null }));
vi.mock("rehype-pretty-code", () => ({ default: () => undefined }));
vi.mock("rehype-slug", () => ({ default: () => undefined }));
vi.mock("rehype-autolink-headings", () => ({ default: () => undefined }));
vi.mock("@/components/blog/toc-share", () => ({
  ShareButton: () => null,
  TableOfContents: () => null,
}));
vi.mock("@/components/ui/book-call-cta", () => ({ BookCallCta: () => null }));

import BlogPostPage from "../[slug]/page";

describe("/blog/[slug] JSON-LD", () => {
  afterEach(() => cleanup());

  it("escapes < and the line separators in the BlogPosting script, and it still parses", async () => {
    const { container } = render(
      await BlogPostPage({ params: Promise.resolve({ slug: "sep-post" }) }),
    );
    const html = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? "";
    expect(html).not.toContain("<");
    expect(html).not.toContain(LS);
    expect(html).not.toContain(PS);
    const parsed = JSON.parse(html) as { headline: string; description: string };
    expect(parsed.headline).toBe(`Title</script><b>${LS}end`);
    expect(parsed.description).toBe(`Excerpt${PS}end`);
  });
});
