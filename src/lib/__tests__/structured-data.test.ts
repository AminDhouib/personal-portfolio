import { describe, it, expect } from "vitest";
import { faqs } from "@/data/faq";
import { projects } from "@/data/projects";
import { socialLinks } from "@/data/nav";
import {
  PERSON_ID,
  blogPostListNode,
  breadcrumbNode,
  companyNode,
  faqPageNode,
  gameListNode,
  graph,
  personNode,
  profilePageNode,
  projectListNode,
  projectNode,
  serializeJsonLd,
  videoGameNode,
  webApplicationNode,
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

  it("lists blog posts in the order given, each with its /blog URL", () => {
    const list = blogPostListNode([
      { slug: "newer-post", title: "The newer post" },
      { slug: "older-post", title: "The older post" },
    ]);
    expect(list).toMatchObject({ "@type": "ItemList", "@id": "https://amindhou.com/blog#posts" });
    expect(list.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "The newer post",
        url: "https://amindhou.com/blog/newer-post",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "The older post",
        url: "https://amindhou.com/blog/older-post",
      },
    ]);
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

describe("videoGameNode", () => {
  const node = videoGameNode({
    name: "Hextris",
    description: "Rotate the hexagon.",
    path: "/games/hextris",
    genre: ["Puzzle", "Arcade"],
    playMode: "SinglePlayer",
  });

  it("describes a free browser game made by the Person", () => {
    expect(node["@type"]).toBe("VideoGame");
    expect(node["@id"]).toBe("https://amindhou.com/games/hextris#game");
    expect(node.url).toBe("https://amindhou.com/games/hextris");
    expect(node.author).toEqual({ "@id": PERSON_ID });
    expect(node.gamePlatform).toBe("Web browser");
    expect(node.isAccessibleForFree).toBe(true);
    expect(node.offers).toEqual({ "@type": "Offer", price: 0, priceCurrency: "USD" });
  });

  it("points its image at the page's generated share card and its play mode at schema.org", () => {
    expect(node.image).toBe("https://amindhou.com/games/hextris/opengraph-image");
    expect(node.playMode).toBe("https://schema.org/SinglePlayer");
    expect(node.genre).toEqual(["Puzzle", "Arcade"]);
  });
});

describe("webApplicationNode", () => {
  it("describes a free in-browser tool by the Person", () => {
    const node = webApplicationNode({
      name: "Voltorb Flip Solver",
      description: "d",
      path: "/games/super-voltorb-flip/solver",
    });
    expect(node).toEqual({
      "@type": "WebApplication",
      "@id": "https://amindhou.com/games/super-voltorb-flip/solver#app",
      name: "Voltorb Flip Solver",
      description: "d",
      url: "https://amindhou.com/games/super-voltorb-flip/solver",
      image: "https://amindhou.com/games/super-voltorb-flip/solver/opengraph-image",
      applicationCategory: "UtilitiesApplication",
      browserRequirements: "Requires JavaScript",
      operatingSystem: "Any",
      inLanguage: "en",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
      author: { "@id": "https://amindhou.com/#person" },
      publisher: { "@id": "https://amindhou.com/#person" },
    });
  });
});

describe("gameListNode", () => {
  it("lists the games in order with absolute URLs", () => {
    const node = gameListNode([
      { title: "Hextris", slug: "hextris" },
      { title: "Typing Speed", slug: "typing-speed" },
    ]);
    expect(node["@type"]).toBe("ItemList");
    expect(node.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Hextris",
        url: "https://amindhou.com/games/hextris",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Typing Speed",
        url: "https://amindhou.com/games/typing-speed",
      },
    ]);
  });
});

describe("faqPageNode ids", () => {
  it("keeps the site FAQ id by default and takes a page-specific one", () => {
    const qa = [{ question: "Q?", answer: "A." }];
    expect(faqPageNode(qa)["@id"]).toBe("https://amindhou.com/#faq");
    expect(faqPageNode(qa, "https://amindhou.com/games/hextris#faq")["@id"]).toBe(
      "https://amindhou.com/games/hextris#faq",
    );
  });
});
