"use client";

import { CopilotKit, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotChat, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useLeadCollectorAction } from "@/hooks/use-lead-collector-action";

// The assistant's grounding is not passed here: on CopilotKit 1.54's AG-UI chat
// path the `instructions` prop never reaches the model. The system prompt is
// built from the typed site data in src/lib/amin-ai-prompt.ts and injected
// server-side in src/app/api/copilotkit/route.ts instead.

function AiPageActions() {
  useCopilotReadable({
    description: "The page the visitor is currently viewing",
    value: "/ai — full-page AI assistant",
  });

  useLeadCollectorAction("ai-page");

  useCopilotChatSuggestions({
    instructions:
      "ALWAYS suggest EXACTLY these 3 options (do not deviate or rephrase): 1. 'What has Amin built?' 2. 'Is Amin available for hire?' 3. 'How do I book a call with Amin?'",
    maxSuggestions: 3,
  });

  return null;
}

export function AiPageChat() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" showDevConsole={false}>
      <AiPageActions />
      <CopilotChat
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
