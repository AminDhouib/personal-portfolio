import { describe, it, expect, vi } from "vitest";
import type { BlogPostMeta } from "@/lib/blog";

// Inject a fixed set of posts so the test controls the expected item count
// (derived from the array below, never hardcoded) and can assert that a title
// containing an ampersand is XML-escaped.
const posts: BlogPostMeta[] = [
  {
    slug: "escaping-ampersands",
    title: "ESLint, knip & Beyond",
    excerpt: 'Tools & "quotes" <angles> that must survive XML escaping.',
    date: "2026-04-01",
    tags: ["ci"],
    readingTime: "3 min read",
  },
  {
    slug: "second-post",
    title: "A Second Post",
    excerpt: "Another entry so the feed lists more than one item.",
    date: "2026-01-15",
    tags: ["misc"],
    readingTime: "2 min read",
  },
];

vi.mock("@/lib/blog", () => ({
  getAllBlogPosts: () => posts,
}));

const { GET } = await import("../route");

describe("GET /feed.xml", () => {
  it("returns 200 with an RSS content type", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
  });

  it("emits well-formed RSS with one <item> per blog post", async () => {
    const res = GET();
    const body = await res.text();

    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain('<rss version="2.0"');
    expect(body).toContain("</rss>");

    const itemCount = (body.match(/<item>/g) ?? []).length;
    expect(itemCount).toBe(posts.length);
  });

  it("links each item to its blog post URL with an RFC 822 pubDate", async () => {
    const res = GET();
    const body = await res.text();

    for (const post of posts) {
      expect(body).toContain(`<link>https://amindhou.com/blog/${post.slug}</link>`);
      expect(body).toContain(
        `<guid isPermaLink="true">https://amindhou.com/blog/${post.slug}</guid>`,
      );
    }
    expect(body).toContain(`<pubDate>${new Date(posts[0]!.date).toUTCString()}</pubDate>`);
  });

  it("escapes XML metacharacters in titles and descriptions", async () => {
    const res = GET();
    const body = await res.text();

    // The raw ampersand from the title must not appear unescaped anywhere.
    expect(body).toContain("ESLint, knip &amp; Beyond");
    expect(body).not.toContain("knip & Beyond");
    // Angle brackets and quotes from the excerpt are escaped too.
    expect(body).toContain("&lt;angles&gt;");
    expect(body).toContain("&quot;quotes&quot;");
  });
});
