import { describe, it, expect } from "vitest";
import { getAllBlogPosts } from "@/lib/blog";
import { faqs } from "@/data/faq";
import { projects } from "@/data/projects";
import { BOOKING_URL } from "@/data/nav";
import { GAMES } from "@/app/games/games-meta";
import { GAME_CONTENT } from "@/app/games/content";
import {
  SOLVER_DESCRIPTION,
  SOLVER_PATH,
} from "@/app/games/super-voltorb-flip/solver/solver-content";
import {
  PG2_HINTS_DESCRIPTION,
  PG2_HINTS_PATH,
} from "@/app/games/password-game/hints/hints-content";
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

  it("has a Games section describing every public game", async () => {
    const body = await GET().text();
    const section = body.split("## Games\n")[1]?.split("\n## ")[0] ?? "";
    expect(section).toContain("(https://amindhou.com/games)");
    for (const game of GAMES.filter((g) => !g.hidden)) {
      expect(section).toContain(
        `[${game.title}](https://amindhou.com/games/${game.slug}): ${GAME_CONTENT[game.slug].seoDescription}`,
      );
    }
  });

  it("lists the Voltorb Flip solver right after the game", async () => {
    const body = await GET().text();
    const solver = `- [Voltorb Flip solver](https://amindhou.com${SOLVER_PATH}): ${SOLVER_DESCRIPTION}`;
    const lines = body.split("\n");
    const at = lines.indexOf(solver);
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1]).toContain("(https://amindhou.com/games/super-voltorb-flip)");
  });

  it("lists the Password Game 2 hints page right after the game", async () => {
    const body = await GET().text();
    const hints = `- [Password Game 2 rules and hints](https://amindhou.com${PG2_HINTS_PATH}): ${PG2_HINTS_DESCRIPTION}`;
    const lines = body.split("\n");
    const at = lines.indexOf(hints);
    expect(at).toBeGreaterThan(0);
    expect(lines[at - 1]).toContain("(https://amindhou.com/games/password-game)");
  });

  it("never lists a hidden game", async () => {
    const body = await GET().text();
    for (const game of GAMES.filter((g) => g.hidden)) {
      expect(body).not.toContain(`/games/${game.slug})`);
    }
  });
});
