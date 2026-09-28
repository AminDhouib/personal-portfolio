import { profile } from "./profile";
import { projects } from "./projects";
import { services } from "./services";

export interface FaqEntry {
  question: string;
  /** Plain text: rendered on the page and emitted verbatim as the FAQPage answer. */
  answer: string;
}

function listSentence(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function projectBySlug(slug: string) {
  const project = projects.find((p) => p.slug === slug);
  if (!project) throw new Error(`faq: unknown project slug "${slug}"`);
  return project;
}

const caramel = projectBySlug("caramel");
const { company, education } = profile;

// The questions visitors and answer engines actually ask about Amin. Answers
// are assembled from the typed site data so they cannot drift from the rest of
// the page; the visible FAQ and the FAQPage JSON-LD both render this list.
export const faqs: readonly FaqEntry[] = Object.freeze([
  {
    question: "Who is Amin Dhouib?",
    answer: `${profile.name} is a full-stack software engineer and founder based in ${profile.city}, Canada. He is the CEO and CTO of ${company.name}, holds a ${education.degree} from the ${education.school} (${education.honors}), and builds and self-hosts his own products.`,
  },
  {
    question: "What has Amin Dhouib built?",
    answer: `His products include ${listSentence(projects.map((p) => `${p.name} (${p.tagline})`))}. ${listSentence(projects.filter((p) => p.isOSS).map((p) => p.name))} are open source on GitHub.`,
  },
  {
    question: "Is Amin available for freelance or contract work?",
    answer: `Yes. Amin takes on client projects through ${company.name} and on Contra, and works with clients remotely from ${profile.city}. The fastest way to start is to book a 15-minute call.`,
  },
  {
    question: "What services does Amin offer?",
    answer: `${listSentence(services.map((s) => `${s.title} (${s.description})`))}.`,
  },
  {
    question: `What is ${company.name}?`,
    answer: `${company.name} is the AI and software consultancy Amin founded in ${company.founded} and runs as CEO and CTO, based in ${profile.city}. It builds web, mobile and AI products for clients and maintains open-source projects on GitHub under DevinoSolutions.`,
  },
  {
    question: `What is ${caramel.name}?`,
    answer: `${caramel.name} is Amin's open-source alternative to Honey: a ${caramel.description.charAt(0).toLowerCase()}${caramel.description.slice(1)} It is available on ${listSentence(caramel.platforms.map((p) => p.name))}, and its source code is on GitHub.`,
  },
  {
    question: "How can I contact Amin Dhouib?",
    answer: `Book a 15-minute call from any Book a Call button on this site, email ${profile.email}, or ask Amin AI, the assistant at amindhou.com/ai.`,
  },
]);
