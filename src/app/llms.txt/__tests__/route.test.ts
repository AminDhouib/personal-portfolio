import { describe, it, expect } from "vitest";
import { getAllBlogPosts } from "@/lib/blog";
import { faqs } from "@/data/faq";
import { projects } from "@/data/projects";
import { BOOKING_URL } from "@/data/nav";
import { GET } from "../route";

// Runs against the real checked-in content (content/blog, src/data): the
// point of generating llms.txt is that it can never fall behind that content.
describe("GET /llms.txt", () => {
  it("serves Markdown as UTF-8 plain text", () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("opens with the llms.txt H1 and blockquote summary", async () => {
    const body = await GET().text();
    const [h1, blank, summary] = body.split("\n");
    expect(h1).toBe("# Amin Dhouib");
    expect(blank).toBe("");
    expect(summary).toMatch(/^> Amin Dhouib is a full-stack software engineer/);
  });

  it("links every project, every blog post and the /work hub", async () => {
    const body = await GET().text();
    for (const project of projects) {
      expect(body).toContain(`(https://amindhou.com/work/${project.slug})`);
    }
    for (const post of getAllBlogPosts()) {
      expect(body).toContain(`[${post.title}](https://amindhou.com/blog/${post.slug})`);
    }
    expect(body).toContain("(https://amindhou.com/work)");
  });

  it("carries the FAQ answers and the booking link", async () => {
    const body = await GET().text();
    for (const faq of faqs) {
      expect(body).toContain(`### ${faq.question}\n\n${faq.answer}`);
    }
    expect(body).toContain(BOOKING_URL);
  });

  it("never renders an unfilled value", async () => {
    const body = await GET().text();
    expect(body).not.toMatch(/undefined|\[object Object\]/);
  });
});
