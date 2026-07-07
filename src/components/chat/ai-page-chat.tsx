"use client";

import { CopilotKit, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useLeadCollectorAction } from "@/hooks/use-lead-collector-action";

const INSTRUCTIONS = `You are Amin Dhouib's personal AI assistant on his portfolio site amindhou.com.
You are friendly, concise, and knowledgeable about Amin's work.

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

Services: AI Automation, Full Stack Dev, DevOps/Cloud, Database Management, Security/DevSecOps, SEO & Analytics.
Rate: $50-75/hr on Contra. Book at app.trycaly.com/amin/15min.

Contact: amin@devino.ca | contra.com/amin | github.com/AminDhouib | linkedin.com/in/amin-dhouib

LEAD COLLECTION: When a visitor expresses interest in hiring Amin or working together,
first encourage them to book a call at https://app.trycaly.com/amin/15min.
If they prefer to leave contact details instead, use the collectLead action.
Always confirm before submitting.`;

function AiPageActions() {
  useCopilotReadable({
    description: "The page the visitor is currently viewing",
    value: "/ai — full-page AI assistant",
  });

  useLeadCollectorAction("ai-page");

  useCopilotChatSuggestions({
    instructions:
      "ALWAYS suggest EXACTLY these 3 options: 1. 'What services does Amin offer?' 2. 'Tell me about Amin\\'s projects' 3. 'How do I hire Amin?'",
    maxSuggestions: 3,
  });

  return null;
}

export function AiPageChat() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
      <AiPageActions />
      <CopilotChat
        instructions={INSTRUCTIONS}
        labels={{
          title: "Amin AI",
          initial:
            "Hi! I'm Amin's AI assistant. Ask me anything about his work, skills, or how you can work together.",
          placeholder: "Ask about projects, services, availability...",
        }}
        className="h-full"
      />
    </CopilotKit>
  );
}
