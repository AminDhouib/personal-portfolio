import { getAllBlogPosts } from "@/lib/blog";
import { GAMES } from "@/app/games/games-meta";
import { GAME_CONTENT } from "@/app/games/content";
import {
  SOLVER_DESCRIPTION,
  SOLVER_PATH,
} from "@/app/games/super-voltorb-flip/solver/solver-content";
import { BOOKING_URL, socialLinks } from "@/data/nav";
import { faqs } from "@/data/faq";
import { SITE_ORIGIN, profile } from "@/data/profile";
import { projects } from "@/data/projects";
import { services } from "@/data/services";

// llms.txt (https://llmstxt.org): a Markdown map of the site for LLM answer
// engines. Generated from the same data modules as the pages, so a new post or
// project shows up here on the next deploy; the hand-written public/llms.txt
// it replaces had gone stale (missing posts, and a link to a /work page that
// did not exist). Static for the same reason as feed.xml: it is a pure
// function of checked-in content.
export const dynamic = "force-static";

function link(label: string, path: string): string {
  return `[${label}](${SITE_ORIGIN}${path})`;
}

export function GET(): Response {
  const { company, education } = profile;
  const posts = getAllBlogPosts();
  const games = GAMES.filter((g) => !g.hidden);

  const lines = [
    `# ${profile.name}`,
    "",
    `> ${profile.name} is a full-stack software engineer and founder based in ${profile.city}, Canada, and the CEO and CTO of ${company.name}, an AI and software consultancy. He builds products and self-hosts them on a home server.`,
    "",
    `This is his personal site: his products, writing, services, client reviews and a set of browser games. The base URL is ${SITE_ORIGIN}.`,
    "",
    "## About",
    "",
    `- Role: ${profile.jobTitle}, [${company.name}](${company.url}), founded ${company.founded}`,
    `- Location: ${profile.city}, Canada; works with clients remotely`,
    `- Education: ${education.degree}, ${education.school} (${education.honors})`,
    `- Languages: ${profile.languages.join(", ")}`,
    `- Stack: ${profile.stack.join(", ")}`,
    `- Contact: ${profile.email}; book a 15-minute call at ${BOOKING_URL}`,
    `- Profiles: ${socialLinks.map((s) => `[${s.name}](${s.url})`).join(", ")}`,
    "",
    "## Work",
    "",
    ...projects.map(
      (p) =>
        `- ${link(p.name, `/work/${p.slug}`)}: ${p.tagline}. ${p.description}${p.githubUrl ? ` Source: ${p.githubUrl}` : ""}`,
    ),
    `- ${link("All work", "/work")}`,
    "",
    "## Services",
    "",
    ...services.map((s) => `- ${s.title}: ${s.description}. Tools: ${s.tools.join(", ")}`),
    "",
    "## Blog",
    "",
    ...posts.map((post) => `- ${link(post.title, `/blog/${post.slug}`)}: ${post.excerpt}`),
    `- ${link("Blog index", "/blog")}`,
    `- ${link("RSS feed", "/feed.xml")}`,
    "",
    "## FAQ",
    "",
    ...faqs.flatMap((faq) => [`### ${faq.question}`, "", faq.answer, ""]),
    "## Reviews",
    "",
    `- ${link("Client reviews and testimonials", "/reviews")}`,
    "",
    "## Games",
    "",
    `Free browser games built for this site, playable on desktop and phone with no download or sign-up.`,
    "",
    `- ${link("Games index", "/games")}`,
    ...games.flatMap((g) => [
      `- ${link(g.title, `/games/${g.slug}`)}: ${GAME_CONTENT[g.slug].seoDescription}`,
      ...(g.slug === "super-voltorb-flip"
        ? [`- ${link("Voltorb Flip solver", SOLVER_PATH)}: ${SOLVER_DESCRIPTION}`]
        : []),
    ]),
    "",
    "## Optional",
    "",
    `- ${link("Amin AI", "/ai")}: a chat assistant grounded in the same facts as this file`,
    `- ${link("Sitemap", "/sitemap.xml")}`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
