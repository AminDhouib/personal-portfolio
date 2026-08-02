/**
 * Single source of truth for the "Amin AI" chat assistant's grounding.
 *
 * The system prompt is BUILT from the same typed data modules that render the
 * site (projects, OSS repos, services, experience, reviews, nav), so the
 * assistant's facts cannot drift from what a visitor actually sees. It replaces
 * two hand-maintained INSTRUCTIONS string literals that had already drifted
 * apart between the widget and the /ai page.
 *
 * Delivery: this prompt is injected SERVER-SIDE, in the copilotkit route, not
 * via CopilotKit's client `instructions` prop. In CopilotKit 1.54 the chat UI
 * runs on the AG-UI stack (`@copilotkitnext/core` + `@ag-ui/client`); the legacy
 * `instructions` prop is captured into a React context value (`chatInstructions`)
 * that the AG-UI run path never reads, so it never reaches the model. The route
 * merges `buildAminAiSystemPrompt()` into the outbound OpenRouter request via
 * `applySystemPrompt`, which is the one place grounding provably lands in the
 * LLM call. See `src/app/api/copilotkit/route.ts`.
 */

import { projects } from "@/data/projects";
import { ossProjects } from "@/data/oss-projects";
import { services } from "@/data/services";
import { experience } from "@/data/experience";
import { reviews } from "@/data/reviews";
import { BOOKING_URL, socialLinks } from "@/data/nav";

/** Minimal shape of an OpenAI-style chat-completions request body. */
export type ChatCompletionBody = {
  messages?: Array<{ role?: string; content?: string }>;
};

/**
 * Structural subset of `GameMeta` (src/app/games/games-meta.ts). The games
 * registry lives in the app tree, and lib must not import from routes, so the
 * caller (the copilotkit route) passes the list in.
 */
export type PromptGameMeta = {
  slug: string;
  title: string;
  tagline: string;
  hidden?: true;
};

/**
 * Builds the Amin AI system prompt from the typed data sources. Pure and
 * deterministic (no I/O), so it is cheap to call once at route-module load and
 * straightforward to unit-test.
 */
export function buildAminAiSystemPrompt(games: readonly PromptGameMeta[]): string {
  const productLines = projects
    .map((p) => `- ${p.name} (${p.url}) - ${p.tagline}. ${p.description}`)
    .join("\n");

  const ossLines = ossProjects
    .map((o) => `- ${o.name} (https://github.com/${o.owner}/${o.repo}) - ${o.description}`)
    .join("\n");

  const serviceLines = services
    .map((s) => `- ${s.title}: ${s.description} (${s.tools.slice(0, 5).join(", ")})`)
    .join("\n");

  const currentRoles = experience
    .filter((e) => e.current)
    .map((e) => `${e.role} at ${e.company}`)
    .join("; ");

  const pastCompanies = experience
    .filter((e) => !e.current)
    .map((e) => e.company)
    .join(", ");

  const fiveStarReviews = reviews.filter((r) => r.rating === 5).length;
  const reviewSources = [...new Set(reviews.map((r) => r.source))].join(", ");

  const socialLines = socialLinks.map((s) => `${s.name}: ${s.url}`).join(" | ");

  const gameLines = games
    .filter((g) => !g.hidden)
    .map((g) => `- ${g.title} (https://amindhou.com/games/${g.slug}) - ${g.tagline}.`)
    .join("\n");

  return [
    "You are Amin AI, the assistant on Amin Dhouib's portfolio site (amindhou.com).",
    "Your visitors are mainly recruiters and hiring managers evaluating Amin for engineering roles, and prospective clients considering hiring him. Help them quickly understand what Amin has built and how to work with him.",
    "",
    "About Amin:",
    "- CEO and CTO of Devino Solutions; full-stack engineer and founder based in Ottawa, Canada.",
    "- BASc in Computer Software Engineering, University of Ottawa (Summa Cum Laude, A+).",
    "- Fluent in English and French, working Arabic.",
    "- Favorite stack: Next.js, TypeScript, Python (Django/FastAPI), Prisma, Docker, AWS.",
    `- Track record: $1M+ in revenue, 50+ clients, 30K+ monthly active users across his apps, a 5.0/5.0 rating, and 99.99% server uptime, backed by ${fiveStarReviews} five-star client reviews on ${reviewSources}.`,
    `- Current roles: ${currentRoles}. Past experience includes ${pastCompanies}.`,
    "",
    "Products Amin has built:",
    productLines,
    "",
    "Open-source projects (all on GitHub under DevinoSolutions):",
    ossLines,
    "",
    "Services Amin offers:",
    serviceLines,
    "",
    "Playable mini-games Amin built for the site, all at https://amindhou.com/games:",
    gameLines,
    "",
    `Rate and booking: $50-75/hr on Contra. If a visitor wants to move forward, the fastest next step is booking a 15-minute call at ${BOOKING_URL}.`,
    "",
    `Contact: amin@devino.ca | ${socialLines}`,
    "",
    `LEAD COLLECTION: When a visitor expresses interest in hiring Amin or working together, first encourage them to book a call at ${BOOKING_URL}. If they would rather leave their contact details, use the collectLead action to capture their name and email. Always confirm the details with them before submitting.`,
    "",
    `Honesty: Only state facts covered above. If you do not know something about Amin, or it is not covered here, say so plainly and offer the booking link (${BOOKING_URL}) instead of inventing details.`,
    "",
    "Style: Keep answers to 2-3 sentences unless the visitor explicitly asks for more detail. Be friendly, concrete, and specific - name the real products, services, and companies above rather than answering generically. Never use emojis.",
  ].join("\n");
}

/**
 * Ensures `systemPrompt` is the first system instruction the model sees, in
 * place, on a parsed chat-completions body. If the framework already prepended
 * a system message (CopilotKit's AG-UI agent unshifts a "context from the
 * application" system message when `useCopilotReadable` context is present),
 * this grounding is prepended ahead of it; otherwise a fresh system message is
 * unshifted. No-op when the body carries no `messages` array.
 */
export function applySystemPrompt(body: ChatCompletionBody, systemPrompt: string): void {
  const { messages } = body;
  if (!Array.isArray(messages)) return;
  const first = messages[0];
  if (first && first.role === "system" && typeof first.content === "string") {
    first.content = `${systemPrompt}\n\n${first.content}`;
  } else {
    messages.unshift({ role: "system", content: systemPrompt });
  }
}
