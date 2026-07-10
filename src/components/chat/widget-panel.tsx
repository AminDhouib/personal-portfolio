"use client";

import { useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotReadable } from "@copilotkit/react-core";
import { CopilotPopup, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useLeadCollectorAction } from "@/hooks/use-lead-collector-action";

// The assistant's grounding is not passed here: on CopilotKit 1.54's AG-UI chat
// path the `instructions` prop never reaches the model. The system prompt is
// built from the typed site data in src/lib/amin-ai-prompt.ts and injected
// server-side in src/app/api/copilotkit/route.ts instead.

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

  useLeadCollectorAction("chatbot");

  useCopilotChatSuggestions(
    {
      instructions:
        "ALWAYS suggest EXACTLY these 3 options (do not deviate or rephrase): 1. 'What has Amin built?' 2. 'Is Amin available for hire?' 3. 'How do I book a call with Amin?'",
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
    const cls = HIGHLIGHT_CLASSES[i % HIGHLIGHT_CLASSES.length];
    if (cls) win.classList.add(cls);
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
        labels={{
          title: "Amin AI",
          initial: "Hi! Ask me anything about Amin's work, skills, or how we can work together.",
          placeholder: "Ask about Amin's projects, skills...",
        }}
        defaultOpen={Boolean(initiallyOpen)}
      />
    </CopilotKit>
  );
}
