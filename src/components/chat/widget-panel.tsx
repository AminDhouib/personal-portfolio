"use client";

import { useEffect } from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { useCopilotReadable } from "@copilotkit/react-core";
import { CopilotPopup, useCopilotChatSuggestions } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useLeadCollectorAction } from "@/hooks/use-lead-collector-action";

// The assistant's grounding is not passed here: on CopilotKit's AG-UI chat
// path (1.54 through 1.77) the `instructions` prop never reaches the model. The system prompt is
// built from the typed site data in src/lib/amin-ai-prompt.ts and injected
// server-side in src/app/api/copilotkit/route.ts instead.

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

const ATTENTION_CLASS = "chat-attention";
const REDUCED_MOTION_RING_MS = 600;

// One attention ring, once: .chat-attention (globals.css) animates a pseudo-element's
// opacity 0 -> 1 -> 0. The class comes off on animationend so a later re-click can
// retrigger it; under reduced motion the ring is static and a timeout removes it.
function pulseOpenWindow() {
  const win = document.querySelector<HTMLElement>(".copilotKitWindow");
  if (!win) return () => {};

  let timer = 0;
  const clear = () => {
    win.classList.remove(ATTENTION_CLASS);
    win.removeEventListener("animationend", clear);
    window.clearTimeout(timer);
  };

  win.classList.remove(ATTENTION_CLASS);
  void win.offsetWidth; // force reflow so re-adding the class restarts the animation
  win.classList.add(ATTENTION_CLASS);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    timer = window.setTimeout(clear, REDUCED_MOTION_RING_MS);
  } else {
    win.addEventListener("animationend", clear);
  }

  return clear;
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
    <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint showDevConsole={false}>
      <ChatActions pathname={pathname} />
      {/* ph-sensitive: PostHog and Sentry session replay mask the text under it, so the
          transcript (a lead's name, email and note included) is never recorded. `contents`
          keeps the wrapper out of layout. */}
      <div className="ph-sensitive contents">
        <CopilotPopup
          labels={{
            title: "Amin AI",
            initial: "Hi! Ask me anything about Amin's work, skills, or how we can work together.",
            placeholder: "Ask about Amin's projects, skills...",
          }}
          defaultOpen={Boolean(initiallyOpen)}
        />
      </div>
    </CopilotKit>
  );
}
