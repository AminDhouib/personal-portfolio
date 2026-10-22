import { describe, it, expect } from "vitest";
import { extractToc, getAllBlogPosts, getAllBlogSlugs, getBlogPost } from "../blog";

describe("extractToc", () => {
  it("returns empty array for empty string", () => {
    expect(extractToc("")).toEqual([]);
  });

  it("parses a single h2", () => {
    expect(extractToc("## Hello World")).toEqual([
      { id: "hello-world", text: "Hello World", level: 2 },
    ]);
  });

  it("parses a single h3", () => {
    expect(extractToc("### Sub Section")).toEqual([
      { id: "sub-section", text: "Sub Section", level: 3 },
    ]);
  });

  it("parses mixed h2 and h3", () => {
    const content = `## First Heading\n### Nested One\n### Nested Two\n## Second Heading`;
    expect(extractToc(content)).toEqual([
      { id: "first-heading", text: "First Heading", level: 2 },
      { id: "nested-one", text: "Nested One", level: 3 },
      { id: "nested-two", text: "Nested Two", level: 3 },
      { id: "second-heading", text: "Second Heading", level: 2 },
    ]);
  });

  it("strips special characters from IDs", () => {
    expect(extractToc("## Hello, World!")).toEqual([
      { id: "hello-world", text: "Hello, World!", level: 2 },
    ]);
  });

  it("ignores h1 and h4+ headings", () => {
    expect(extractToc("# Ignored\n#### Also Ignored")).toEqual([]);
  });
});

describe("getAllBlogSlugs", () => {
  it("returns an array (empty if content/blog dir missing)", () => {
    const result = getAllBlogSlugs();
    expect(Array.isArray(result)).toBe(true);
  });
});

// T-6264. getBlogPost joined the slug straight into a path, so "../" segments walked out of
// content/blog and read any .md or .mdx file the process could see (the repo's own README.md and
// AGENTS.md, a dependency's docs). Tests run from the repo root, the same cwd the app uses.
describe("getBlogPost slug validation", () => {
  it.each(getAllBlogSlugs())("still serves the real post %s", (slug) => {
    expect(getBlogPost(slug)?.slug).toBe(slug);
  });

  it.each([
    "../../README",
    "../../AGENTS",
    "../../../README",
    "../blog/caramel-open-source-story",
    "./caramel-open-source-story",
    "caramel-open-source-story/../caramel-open-source-story",
    "/etc/passwd",
    "..\..\README",
    "..%2F..%2FREADME",
    "%2e%2e%2f%2e%2e%2fREADME",
    "caramel-open-source-story%00",
    `caramel-open-source-story${String.fromCharCode(0)}.x`,
    "Caramel-Open-Source-Story",
    "-caramel",
    "",
    ".",
    "..",
  ])("refuses the slug %j", (slug) => {
    expect(getBlogPost(slug)).toBeNull();
  });

  it("does not turn a refused slug into a listing entry or a read", () => {
    expect(getAllBlogPosts().map((p) => p.slug)).toEqual(
      expect.arrayContaining(["caramel-open-source-story"]),
    );
  });
});
