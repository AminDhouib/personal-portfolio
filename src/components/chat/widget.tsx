"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";

// Below sm the launcher is an icon-only circle: page content scrolls under
// this fixed corner, and on a phone the full pill hid a whole FAQ toggle or
// the end of a footer line. The label stays in the accessibility tree.
// While the panel chunk loads the same launcher stays on screen, disabled and
// busy, in the same fixed box, so a click on a slow link never looks dead.
function ChatLauncher({ pending = false, onClick }: { pending?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending ? "true" : undefined}
      className="fixed right-5 bottom-5 z-50 inline-flex size-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-black/80 text-sm font-semibold text-white shadow-2xl shadow-black/30 backdrop-blur transition-colors hover:border-white/30 hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue disabled:cursor-wait sm:size-auto sm:px-4 sm:py-3"
      aria-label="Open Amin AI chat"
    >
      <Sparkles
        className={`h-4 w-4 text-accent-blue${pending ? "motion-safe:animate-pulse" : ""}`}
        aria-hidden
      />
      <span className="sr-only sm:not-sr-only">Amin AI</span>
    </button>
  );
}

const ChatWidgetPanel = dynamic(() => import("./widget-panel").then((mod) => mod.ChatWidgetPanel), {
  ssr: false,
  loading: () => <ChatLauncher pending />,
});

export function ChatWidget({ enabled }: { enabled?: boolean }) {
  const pathname = usePathname();
  const [panelLoaded, setPanelLoaded] = useState(false);
  const [openSignal, setOpenSignal] = useState(0);

  const onGames = pathname === "/games" || pathname.startsWith("/games/");
  const onAi = pathname === "/ai" || pathname.startsWith("/ai/");
  const shouldHide = !enabled || onGames || onAi;

  const openChat = useCallback(() => {
    if (shouldHide) return;
    track("chat_open", { path: pathname });
    setPanelLoaded(true);
    setOpenSignal((signal) => signal + 1);
  }, [shouldHide, pathname]);

  // The navbar "Amin AI" button dispatches this event. Keep this listener in the
  // tiny shell so CopilotKit stays out of the initial route bundle.
  useEffect(() => {
    window.addEventListener("open-amin-ai-chat", openChat);
    return () => window.removeEventListener("open-amin-ai-chat", openChat);
  }, [openChat]);

  if (shouldHide) return null;

  if (panelLoaded) {
    return (
      <ChatWidgetPanel pathname={pathname} initiallyOpen={openSignal > 0} openSignal={openSignal} />
    );
  }

  return <ChatLauncher onClick={openChat} />;
}
