"use client";

import { useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotAction } from "@copilotkit/react-core";
import { CopilotPopup, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { usePathname } from "next/navigation";

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
- Caramel (grabcaramel.com) — Open-source Honey alternative browser ext.
- UpUp (useupup.com) — React file upload NPM component.
- GetItDone (nowgetitdone.com) — Team standups & time tracking.

Services: AI Automation, Full Stack Dev, DevOps/Cloud, Database, Security/DevSecOps.
Rate: $50-75/hr on Contra. calendly.com/amindhouib for booking.

Contact: amin@devino.ca | contra.com/amin

LEAD COLLECTION: When a visitor expresses interest in hiring Amin or working together, 
first encourage them to book a call at https://calendly.com/amindhouib.
If they'd prefer to leave their contact details instead, use the collectLead action
to collect their name and email. Always confirm before submitting.

Keep responses to 2-3 sentences max unless detail is explicitly requested.`;

function ChatActions() {
  useCopilotAction({
    name: "collectLead",
    description:
      "Collect a visitor's name and email when they express interest in hiring or working with Amin. Use this after they decline or can't use the Calendly link.",
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
    handler: async ({ name, email, note }: { name: string; email: string; note?: string }) => {
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

  useCopilotChatSuggestions({
    instructions: "ALWAYS suggest EXACTLY these 3 options (do not deviate or rephrase): 1. 'How can I reach out to Amin?' 2. 'What services does Amin offer?' 3. 'Tell me about Amin's projects'",
    maxSuggestions: 3,
  }, []);

  return null;
}

export function ChatWidget({ enabled }: { enabled?: boolean }) {
  const pathname = usePathname();

  // The navbar "Amin AI" button dispatches this event. CopilotKit manages its
  // own open state internally, so we drive it via DOM.
  // - If chat is closed: click CopilotKit's button to open it.
  // - If chat is already open: cycle through colored highlight classes
  //   manually so the effect doesn't depend on CSS animations (which the
  //   browser throttles when the tab isn't fully visible).
  useEffect(() => {
    let cycleInterval: ReturnType<typeof setInterval> | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    const HL_CLASSES = [
      "amin-ai-hl-purple",
      "amin-ai-hl-indigo",
      "amin-ai-hl-blue",
      "amin-ai-hl-pink",
    ];
    const stopCycle = (win: HTMLElement) => {
      if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
      }
      win.classList.remove(...HL_CLASSES);
    };
    const handler = () => {
      const btn = document.querySelector<HTMLElement>(".copilotKitButton");
      if (!btn) return;
      if (btn.classList.contains("open")) {
        const win = document.querySelector<HTMLElement>(".copilotKitWindow");
        if (!win) return;
        if (cycleInterval) clearInterval(cycleInterval);
        if (cleanupTimer) clearTimeout(cleanupTimer);
        let i = 0;
        const tick = () => {
          win.classList.remove(...HL_CLASSES);
          win.classList.add(HL_CLASSES[i % HL_CLASSES.length]);
          i++;
        };
        tick();
        cycleInterval = setInterval(tick, 280);
        cleanupTimer = setTimeout(() => stopCycle(win), 1400);
      } else {
        btn.click();
      }
    };
    window.addEventListener("open-amin-ai-chat", handler);
    return () => {
      window.removeEventListener("open-amin-ai-chat", handler);
      if (cycleInterval) clearInterval(cycleInterval);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
  }, []);

  const onGames = pathname === "/games" || pathname.startsWith("/games/");
  if (!enabled || onGames) return null;
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
      <ChatActions />
      <CopilotPopup
        instructions={INSTRUCTIONS}
        labels={{
          title: "Amin AI",
          initial: "Hi! Ask me anything about Amin's work, skills, or how we can work together.",
          placeholder: "Ask about Amin's projects, skills...",
        }}
        defaultOpen={false}
      />
    </CopilotKit>
  );
}
