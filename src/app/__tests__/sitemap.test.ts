import { afterEach, describe, it, expect, vi } from "vitest";
import { getAllBlogPosts } from "@/lib/blog";
import { projects } from "@/data/projects";
import { GAMES } from "@/app/games/games-meta";
import { SOLVER_PATH } from "@/app/games/super-voltorb-flip/solver/solver-content";
import { PG2_HINTS_PATH } from "@/app/games/password-game/hints/hints-content";
import sitemap from "../sitemap";

// No game is hidden today, so the hidden path gets a registry with Failover hidden.
function mockFailoverHidden() {
  vi.resetModules();
  vi.doMock("@/app/games/games-meta", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/app/games/games-meta")>();
    const GAMES = actual.GAMES.map((g) => (g.slug === "failover" ? { ...g, hidden: true } : g));
    return {
      ...actual,
      GAMES,
      getGameMeta: (slug: string) => GAMES.find((g) => g.slug === slug) ?? null,
    };
  });
}

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

  it("lists the Password Game page and every public game, and no hidden game", () => {
    expect(urls).toContain("https://amindhou.com/games/password-game");
    for (const game of GAMES) {
      const url = `https://amindhou.com/games/${game.slug}`;
      if (game.hidden) expect(urls).not.toContain(url);
      else expect(urls).toContain(url);
    }
  });

  it("lists the Voltorb Flip solver page", () => {
    expect(urls).toContain(`https://amindhou.com${SOLVER_PATH}`);
  });

  it("lists the Password Game 2 hints page", () => {
    expect(urls).toContain(`https://amindhou.com${PG2_HINTS_PATH}`);
  });
});

describe("sitemap with a hidden game", () => {
  afterEach(() => {
    vi.doUnmock("@/app/games/games-meta");
    vi.resetModules();
  });

  it("leaves the hidden game out and keeps the rest", async () => {
    mockFailoverHidden();
    const { default: hiddenSitemap } = await import("../sitemap");
    const hiddenUrls = hiddenSitemap().map((e) => e.url);
    expect(hiddenUrls).not.toContain("https://amindhou.com/games/failover");
    expect(hiddenUrls).toContain("https://amindhou.com/games/hextris");
  });
});
