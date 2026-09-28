import { describe, it, expect } from "vitest";
import { faqs } from "@/data/faq";
import { projects } from "@/data/projects";
import { socialLinks } from "@/data/nav";
import {
  PERSON_ID,
  breadcrumbNode,
  companyNode,
  faqPageNode,
  graph,
  personNode,
  profilePageNode,
  projectListNode,
  projectNode,
  serializeJsonLd,
} from "../structured-data";

describe("serializeJsonLd", () => {
  it("escapes < so a payload string cannot close the script tag", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" });
  });
});

describe("personNode", () => {
  const person = personNode();

  it("points its image at a file that exists (the old /amin.jpg 404ed)", () => {
    expect(person.image).toBe("https://amindhou.com/profile.jpg");
  });

  it("lists every footer profile plus the extra ones in sameAs", () => {
    const sameAs = person.sameAs as string[];
    for (const link of socialLinks) expect(sameAs).toContain(link.url);
    expect(sameAs).toContain("https://dev.to/amindhou");
    expect(sameAs).toContain("https://instagram.com/amin.dhou");
  });

  it("links to the company node instead of an anonymous Organization", () => {
    expect(person.worksFor).toEqual({ "@id": companyNode()["@id"] });
    expect(companyNode().founder).toEqual({ "@id": PERSON_ID });
  });
});

describe("page-level nodes", () => {
  it("wraps nodes in a schema.org graph", () => {
    expect(graph({ a: 1 })).toEqual({ "@context": "https://schema.org", "@graph": [{ a: 1 }] });
  });

  it("embeds the full Person as the ProfilePage mainEntity", () => {
    const page = profilePageNode();
    expect(page["@type"]).toBe("ProfilePage");
    expect(page.mainEntity).toEqual(personNode());
  });

  it("lists every project in order with its /work URL", () => {
    const list = projectListNode(projects).itemListElement as Array<Record<string, unknown>>;
    expect(list).toHaveLength(projects.length);
    projects.forEach((project, i) => {
      expect(list[i]).toMatchObject({
        position: i + 1,
        name: project.name,
        url: `https://amindhou.com/work/${project.slug}`,
      });
    });
  });

  it("credits each project to the Person and links its source when it has one", () => {
    for (const project of projects) {
      const node = projectNode(project);
      expect(node.creator).toEqual({ "@id": PERSON_ID });
      expect(node.sameAs).toEqual(project.githubUrl ? [project.githubUrl] : undefined);
    }
  });

  it("turns every FAQ entry into a Question with an accepted Answer", () => {
    const questions = faqPageNode(faqs).mainEntity as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(faqs.length);
    faqs.forEach((faq, i) => {
      expect(questions[i]).toEqual({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      });
    });
  });

  it("builds absolute breadcrumb URLs, with the root as the bare origin", () => {
    const crumbs = breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Work", path: "/work" },
    ]).itemListElement as Array<Record<string, unknown>>;
    expect(crumbs).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://amindhou.com" },
      { "@type": "ListItem", position: 2, name: "Work", item: "https://amindhou.com/work" },
    ]);
  });
});

describe("faqs", () => {
  it("renders every answer from real data, with no unfilled template slots", () => {
    for (const faq of faqs) {
      expect(faq.answer).not.toMatch(/undefined|\$\{|NaN/);
      expect(faq.answer.length).toBeGreaterThan(40);
    }
  });

  it("names every product in the 'what has he built' answer", () => {
    const built = faqs.find((f) => f.question === "What has Amin Dhouib built?");
    for (const project of projects) expect(built?.answer).toContain(project.name);
  });
});
