"use client";

import { useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotPopup, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { ossProjects, type OssProject } from "@/data/oss-projects";

// Open-source project facts (Caramel, UpUp below) are sourced from the single
// source of truth in src/data/oss-projects.ts so they can't drift out of sync
// with the site's Open Source section.
const ossByKey: Record<string, OssProject> = Object.fromEntries(
  ossProjects.map((p) => [p.key, p] as const),
);

const INSTRUCTIONS = `You are Amin Dhouib's personal AI assistant on his portfolio site amindhou.com.
You are friendly, concise, and knowledgeable about Amin's work. Keep responses short — this is a chat widget.

About Amin:
- CEO & CTO of Devino Solutions. Full-stack engineer & founder in Ottawa, Canada.
- Education: University of Ottawa, BASc Computer Software Engineering, Summa Cum Laude (A+)
- Languages: Fluent English & French, working Arabic
- Favorite stack: Next.js, TypeScript, Python (Django/FastAPI), Prisma, Docker, AWS

Key stats: $1M+ revenue, 50+ clients, 30K+ MAU across apps, 5.0/5.0 rating, 99.99% server uptime.

Apps:
- Shorty (aishorty.com) — AI YouTube & Spotify summarizer. 2.1K MAU, +50% MoM.
- uNotes (unotes.net) — Community university notes platform. 5K MAU.
- Caramel (grabcaramel.com) — ${ossByKey.caramel.description} browser ext.
- UpUp (useupup.com) — ${ossByKey.upup.description}.
- GetItDone (nowgetitdone.com) — Team standups & time tracking.

Services: AI Automation, Full Stack Dev, DevOps/Cloud, Database, Security/DevSecOps.
Rate: $50-75/hr on Contra. app.trycaly.com/amin/15min for booking.

Contact: amin@devino.ca | contra.com/amin

LEAD COLLECTION: When a visitor expresses interest in hiring Amin or working together,
first encourage them to book a call at https://app.trycaly.com/amin/15min.
If they'd prefer to leave their contact details instead, use the collectLead action
to collect their name and email. Always confirm before submitting.

Keep responses to 2-3 sentences max unless detail is explicitly requested.`;

const HIGHLIGHT_CLASSES = [
  "amin-ai-hl-purple",
  "amin-ai-hl-indigo",
  "amin-ai-hl-blue",
  "amin-ai-hl-pink",
];

function ChatActions({ pathname }: { pathname: string }) {
  useCopilotReadable({
    description: "The page the visitor is currently viewing on amindhou.com",
    value: pathname === "/" ? "homepage (portfolio overview)" : pathname,
  });

  useCopilotAction({
    name: "collectLead",
    description:
      "Collect a visitor's name and email when they express interest in hiring or working with Amin. Use this after they decline or can't use the booking link.",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "The visitor's full name",
        required: true,
      },
      {
        name: "email",
        type: "string",
        description: "The visitor's email address",
        required: true,
      },
      {
        name: "note",
        type: "string",
        description: "Brief note about what they're looking for (optional)",
        required: false,
      },
    ],
    handler: async ({
      name,
      email,
      note,
    }: {
      name: string;
      email: string;
      note?: string;
    }) => {
      try {
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, note, source: "chatbot" }),
        });
        if (!res.ok) throw new Error("Failed to save lead");
        return `Lead saved for ${name} (${email}). Amin will be in touch soon!`;
      } catch {
        return "Sorry, there was an issue saving your contact details. Please try emailing amin@devino.ca directly.";
      }
    },
  });

  useCopilotChatSuggestions(
    {
      instructions:
        "ALWAYS suggest EXACTLY these 3 options (do not deviate or rephrase): 1. 'How can I reach out to Amin?' 2. 'What services does Amin offer?' 3. 'Tell me about Amin's projects'",
      maxSuggestions: 3,
    },
    [],
  );

  return null;
}

function pulseOpenWindow() {
  const win = document.querySelector<HTMLElement>(".copilotKitWindow");
  if (!win) return () => {};

  let i = 0;
  const tick = () => {
    win.classList.remove(...HIGHLIGHT_CLASSES);
    win.classList.add(HIGHLIGHT_CLASSES[i % HIGHLIGHT_CLASSES.length]);
    i++;
  };

  tick();
  const cycleInterval = window.setInterval(tick, 280);
  const cleanupTimer = window.setTimeout(() => {
    window.clearInterval(cycleInterval);
    win.classList.remove(...HIGHLIGHT_CLASSES);
  }, 1400);

  return () => {
    window.clearInterval(cycleInterval);
    window.clearTimeout(cleanupTimer);
    win.classList.remove(...HIGHLIGHT_CLASSES);
  };
}

function openOrHighlightCopilot() {
  const btn = document.querySelector<HTMLElement>(".copilotKitButton");
  if (!btn) return () => {};
  if (btn.classList.contains("open")) {
    return pulseOpenWindow();
  }
  btn.click();
  return () => {};
}

export function ChatWidgetPanel({
  pathname,
  initiallyOpen,
  openSignal,
}: {
  pathname: string;
  initiallyOpen?: boolean;
  openSignal?: number;
}) {
  useEffect(() => {
    if (!openSignal) return;
    let cleanup = () => {};
    const timer = window.setTimeout(() => {
      cleanup = openOrHighlightCopilot();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [openSignal]);

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
      <ChatActions pathname={pathname} />
      <CopilotPopup
        instructions={INSTRUCTIONS}
        labels={{
          title: "Amin AI",
          initial:
            "Hi! Ask me anything about Amin's work, skills, or how we can work together.",
          placeholder: "Ask about Amin's projects, skills...",
        }}
        defaultOpen={Boolean(initiallyOpen)}
      />
    </CopilotKit>
  );
}
