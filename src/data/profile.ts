import { socialLinks } from "./nav";

export const SITE_ORIGIN = "https://amindhou.com";

// Who Amin is, in one place, for the machine-readable surfaces: the Person
// JSON-LD, the FAQ answers and llms.txt. Every fact here is already stated
// elsewhere on the site (the AI grounding in src/lib/amin-ai-prompt.ts, the
// experience timeline); do not add a claim that is not.
export const profile = Object.freeze({
  name: "Amin Dhouib",
  jobTitle: "CEO & CTO",
  summary:
    "Full-stack software engineer and founder based in Ottawa, Canada. CEO and CTO of Devino Solutions.",
  email: "amin@devino.ca",
  // Square 900x900 headshot. /profile.png is the transparent hero cutout,
  // which renders as a black square in most previews.
  image: `${SITE_ORIGIN}/profile.jpg`,
  city: "Ottawa",
  country: "CA",
  education: {
    degree: "BASc in Computer Software Engineering",
    school: "University of Ottawa",
    schoolUrl: "https://www.uottawa.ca",
    honors: "Summa Cum Laude",
  },
  languages: ["English", "French", "Arabic"],
  company: {
    name: "Devino Solutions",
    url: "https://devino.ca",
    github: "https://github.com/DevinoSolutions",
    founded: "2023",
  },
  stack: ["Next.js", "TypeScript", "Python", "Django", "FastAPI", "Prisma", "Docker", "AWS"],
});

// Profiles that belong to Amin but are not shown as icons in the site footer.
const EXTRA_PROFILES = ["https://dev.to/amindhou"];

/** Every profile URL that identifies Amin (JSON-LD sameAs). */
export const profileUrls: readonly string[] = Object.freeze([
  ...socialLinks.map((link) => link.url),
  ...EXTRA_PROFILES,
]);
