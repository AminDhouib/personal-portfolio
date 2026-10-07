import { SITE_ORIGIN, profile, profileUrls } from "@/data/profile";
import type { FaqEntry } from "@/data/faq";
import type { Project } from "@/data/projects";
import type { BlogPostMeta } from "@/lib/blog";

// schema.org builders for the JSON-LD blocks. The site-wide graph (Person,
// Organization, WebSite) ships from the root layout; page-level nodes
// reference the Person by @id so every block describes the same entity.

export const PERSON_ID = `${SITE_ORIGIN}/#person`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const COMPANY_ID = `${SITE_ORIGIN}/#devino`;

type JsonLdNode = Record<string, unknown>;

/**
 * JSON for a `<script type="application/ld+json">` body. `<` is escaped so no
 * string in the payload can close the script tag (the Next.js JSON-LD guide's
 * recommended sanitization).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

export function personNode(): JsonLdNode {
  const { education } = profile;
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: profile.name,
    url: SITE_ORIGIN,
    image: profile.image,
    description: profile.summary,
    jobTitle: profile.jobTitle,
    email: `mailto:${profile.email}`,
    worksFor: { "@id": COMPANY_ID },
    address: {
      "@type": "PostalAddress",
      addressLocality: profile.city,
      addressCountry: profile.country,
    },
    alumniOf: {
      "@type": "CollegeOrUniversity",
      name: education.school,
      url: education.schoolUrl,
    },
    hasCredential: {
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "degree",
      name: `${education.degree} (${education.honors})`,
      recognizedBy: { "@type": "CollegeOrUniversity", name: education.school },
    },
    knowsLanguage: profile.languages,
    knowsAbout: profile.stack,
    sameAs: profileUrls,
  };
}

export function companyNode(): JsonLdNode {
  const { company } = profile;
  return {
    "@type": "Organization",
    "@id": COMPANY_ID,
    name: company.name,
    url: company.url,
    foundingDate: company.founded,
    founder: { "@id": PERSON_ID },
    address: {
      "@type": "PostalAddress",
      addressLocality: profile.city,
      addressCountry: profile.country,
    },
    sameAs: [company.github],
  };
}

export function websiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_ORIGIN,
    name: profile.name,
    inLanguage: "en",
    publisher: { "@id": PERSON_ID },
  };
}

/** The homepage is Amin's profile page: Google's ProfilePage type for a person's entity home. */
export function profilePageNode(): JsonLdNode {
  return {
    "@type": "ProfilePage",
    "@id": `${SITE_ORIGIN}/#profilepage`,
    url: SITE_ORIGIN,
    name: `${profile.name}: ${profile.summary}`,
    isPartOf: { "@id": WEBSITE_ID },
    // The full Person, not just a reference: validators read mainEntity
    // without merging nodes from the layout's separate script block.
    mainEntity: personNode(),
  };
}

export function projectListNode(projects: readonly Project[]): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${SITE_ORIGIN}/#projects`,
    name: `Projects by ${profile.name}`,
    itemListElement: projects.map((project, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: project.name,
      url: `${SITE_ORIGIN}/work/${project.slug}`,
    })),
  };
}

export function blogPostListNode(
  posts: readonly Pick<BlogPostMeta, "slug" | "title">[],
): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${SITE_ORIGIN}/blog#posts`,
    name: `Blog posts by ${profile.name}`,
    itemListElement: posts.map((post, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: post.title,
      url: `${SITE_ORIGIN}/blog/${post.slug}`,
    })),
  };
}

export function projectNode(project: Project): JsonLdNode {
  return {
    "@type": "CreativeWork",
    "@id": `${SITE_ORIGIN}/work/${project.slug}#project`,
    name: project.name,
    headline: project.tagline,
    description: project.description,
    url: project.url,
    creator: { "@id": PERSON_ID },
    ...(project.githubUrl ? { sameAs: [project.githubUrl] } : {}),
  };
}

export function faqPageNode(faqs: readonly FaqEntry[], id = `${SITE_ORIGIN}/#faq`): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": id,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** Breadcrumb trail from the site root; `path` is site-relative ("/work"). */
export function breadcrumbNode(crumbs: readonly { name: string; path: string }[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${SITE_ORIGIN}${crumb.path === "/" ? "" : crumb.path}`,
    })),
  };
}

/**
 * A playable game page. Free, in the browser, made by the Person; the image is
 * the page's file-based Open Graph card. No ratings: none exist to cite.
 */
export function videoGameNode(game: {
  name: string;
  description: string;
  /** Site-relative page path, e.g. "/games/hextris". */
  path: string;
  genre: readonly string[];
  playMode: "SinglePlayer" | "MultiPlayer" | "CoOp";
}): JsonLdNode {
  const url = `${SITE_ORIGIN}${game.path}`;
  return {
    "@type": "VideoGame",
    "@id": `${url}#game`,
    name: game.name,
    description: game.description,
    url,
    image: `${url}/opengraph-image`,
    genre: [...game.genre],
    playMode: `https://schema.org/${game.playMode}`,
    gamePlatform: "Web browser",
    applicationCategory: "GameApplication",
    operatingSystem: "Any",
    inLanguage: "en",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
  };
}

/**
 * A free in-browser tool page (not a game), made by the Person; the image is
 * the page's file-based Open Graph card.
 */
export function webApplicationNode(app: {
  name: string;
  description: string;
  /** Site-relative page path, e.g. "/games/super-voltorb-flip/solver". */
  path: string;
}): JsonLdNode {
  const url = `${SITE_ORIGIN}${app.path}`;
  return {
    "@type": "WebApplication",
    "@id": `${url}#app`,
    name: app.name,
    description: app.description,
    url,
    image: `${url}/opengraph-image`,
    applicationCategory: "UtilitiesApplication",
    browserRequirements: "Requires JavaScript",
    operatingSystem: "Any",
    inLanguage: "en",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
  };
}

export function gameListNode(games: readonly { title: string; slug: string }[]): JsonLdNode {
  return {
    "@type": "ItemList",
    "@id": `${SITE_ORIGIN}/games#games`,
    name: `Browser games by ${profile.name}`,
    itemListElement: games.map((game, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: game.title,
      url: `${SITE_ORIGIN}/games/${game.slug}`,
    })),
  };
}
