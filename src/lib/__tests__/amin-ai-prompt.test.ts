import { describe, it, expect } from "vitest";
import { buildAminAiSystemPrompt, applySystemPrompt } from "../amin-ai-prompt";
import { projects } from "@/data/projects";
import { ossProjects } from "@/data/oss-projects";
import { services } from "@/data/services";
import { BOOKING_URL, socialLinks } from "@/data/nav";
import { GAMES } from "@/app/games/games-meta";

describe("buildAminAiSystemPrompt", () => {
  const prompt = buildAminAiSystemPrompt(GAMES);

  it("names every product from the projects data source", () => {
    // The five products: Shorty, uNotes, Caramel, UpUp, GetItDone.
    expect(projects).toHaveLength(5);
    for (const project of projects) {
      expect(prompt).toContain(project.name);
      expect(prompt).toContain(project.url);
    }
  });

  it("lists every OSS repo with its derived GitHub URL", () => {
    for (const oss of ossProjects) {
      expect(prompt).toContain(oss.name);
      expect(prompt).toContain(`https://github.com/${oss.owner}/${oss.repo}`);
    }
  });

  it("lists every service offering", () => {
    for (const service of services) {
      expect(prompt).toContain(service.title);
    }
  });

  it("includes the booking URL from nav data", () => {
    expect(prompt).toContain(BOOKING_URL);
  });

  it("includes the contact email and every social link", () => {
    expect(prompt).toContain("amin@devino.ca");
    for (const social of socialLinks) {
      expect(prompt).toContain(social.url);
    }
  });

  it("preserves the rate and headline stats", () => {
    expect(prompt).toContain("$50-75");
    expect(prompt).toContain("$1M+");
    expect(prompt).toContain("50+ clients");
    expect(prompt).toContain("30K+");
    expect(prompt).toContain("5.0/5.0");
    expect(prompt).toContain("99.99%");
  });

  it("keeps the lead-collection directive and honesty rule", () => {
    expect(prompt).toContain("collectLead");
    expect(prompt).toMatch(/recruiters/i);
    expect(prompt).toMatch(/2-3 sentences/);
  });

  it("lists every visible game with its /games URL and omits hidden ones", () => {
    for (const game of GAMES) {
      if (game.hidden) {
        expect(prompt).not.toContain(game.title);
      } else {
        expect(prompt).toContain(game.title);
        expect(prompt).toContain(`https://amindhou.com/games/${game.slug}`);
      }
    }
    expect(prompt).toContain("https://amindhou.com/games");
  });

  it("contains no emoji characters", () => {
    expect(prompt).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("applySystemPrompt", () => {
  const SYSTEM = "GROUNDING";

  it("unshifts a system message when none is present", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    applySystemPrompt(body, SYSTEM);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: "system", content: SYSTEM });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("prepends grounding ahead of an existing system message", () => {
    const body = {
      messages: [
        { role: "system", content: "## Context from the application" },
        { role: "user", content: "hi" },
      ],
    };
    applySystemPrompt(body, SYSTEM);
    expect(body.messages).toHaveLength(2);
    const [first] = body.messages;
    expect(first?.role).toBe("system");
    expect(first?.content).toBe(`${SYSTEM}\n\n## Context from the application`);
  });

  it("is a no-op when the body has no messages array", () => {
    const body: { messages?: Array<{ role?: string; content?: string }> } = {};
    expect(() => applySystemPrompt(body, SYSTEM)).not.toThrow();
    expect(body.messages).toBeUndefined();
  });
});
