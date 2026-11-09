import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projects } from "../projects";
import { experience } from "../experience";
import { CLIENT_COUNT } from "../profile";

const publicPath = (p: string) => join(process.cwd(), "public", p);

// Every product and client study Devino publishes on devino-landing-page
// (data/case-studies.ts) that Amin built or delivered. Dropping one here is the
// "undersells us" regression.
const FROM_DEVINO_CASE_STUDIES = [
  "shorty",
  "unotes",
  "caramel",
  "upup",
  "getitdone",
  "postify",
  "superbooks",
  "bioflow",
  "dodomain",
  "bitbuy",
  "syncara",
];

describe("projects data", () => {
  it("lists every product and client study from the Devino case studies", () => {
    const slugs = projects.map((p) => p.slug);
    for (const slug of FROM_DEVINO_CASE_STUDIES) expect(slugs).toContain(slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("ships the logo and hero image of every project", () => {
    for (const p of projects) {
      expect(existsSync(publicPath(p.logo)), `${p.slug} logo`).toBe(true);
      if (p.heroImage) expect(existsSync(publicPath(p.heroImage)), `${p.slug} hero`).toBe(true);
    }
  });

  it("names the client for client work and leaves it off products", () => {
    const clientWork = projects.filter((p) => p.clientName);
    expect(clientWork.map((p) => p.clientName)).toEqual(["Bitbuy", "Syncara"]);
    // No analytics property exists for a client's site, so client work carries no MAU.
    for (const p of clientWork) expect(p.mauFallback).toBeUndefined();
  });

  it("states each product's numbers once: no second user or document count in prose", () => {
    const unotes = projects.find((p) => p.slug === "unotes");
    if (!unotes) throw new Error("uNotes missing");
    const prose = [unotes.tagline, unotes.description, ...(unotes.story ?? [])].join(" ");
    // The document count is 100,000+ everywhere (devino-landing-page's figure); the older
    // 30,000+ and a prose "5,000+ monthly active users" are the stale values that once
    // contradicted the live GA4 stat.
    expect(prose).toMatch(/100,?000\+|100K\+/);
    expect(prose).not.toMatch(/30,000|30K/);
    expect(prose).not.toMatch(/5,000/);
    expect(prose).not.toMatch(/monthly active/i);
  });

  it("keeps product copy free of figures that read as user counts", () => {
    for (const p of projects) {
      const prose = [p.tagline, p.description, ...(p.story ?? [])].join(" ");
      expect(prose, p.slug).not.toMatch(/\d[\d,.]*K?\+? (monthly|active) users/i);
    }
  });
});

describe("work history labels", () => {
  it("does not label Math ANEX full-time while it overlaps Devino and Fujitsu", () => {
    const anex = experience.find((e) => e.company.startsWith("Math ANEX"));
    expect(anex?.type).toBe("Contract");
  });
});

describe("client count", () => {
  it("is the one CLIENT_COUNT in the experience bullet", () => {
    const devino = experience.find((e) => e.company === "Devino");
    expect(devino?.highlights.join(" ")).toContain(`${CLIENT_COUNT}+ satisfied clients`);
  });
});

describe("claims that no file may make", () => {
  const FILES = [
    "src/data/experience.ts",
    "src/data/faq.ts",
    "src/data/profile.ts",
    "src/data/projects.ts",
    "src/data/reviews.ts",
    "src/data/services.ts",
    "src/lib/amin-ai-prompt.ts",
    "src/app/reviews/page.tsx",
    "src/components/sections/hero.tsx",
    "src/components/sections/reviews.tsx",
    "src/components/sections/proof-bar.tsx",
    "src/components/sections/experience.tsx",
  ];
  const FORBIDDEN: [RegExp, string][] = [
    [/top[- ]rated/i, "Upwork shows no Top Rated badge"],
    [/\b100\+ (satisfied )?clients/i, "the client count is CLIENT_COUNT"],
    [/cumulative 20K/i, "the 20K user line is stale by ~10x"],
  ];

  for (const file of FILES) {
    it(`${file} makes none of them`, () => {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const [pattern, why] of FORBIDDEN) expect(text, why).not.toMatch(pattern);
    });
  }
});
