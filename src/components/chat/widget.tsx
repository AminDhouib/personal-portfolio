"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";

const ChatWidgetPanel = dynamic(() => import("./widget-panel").then((mod) => mod.ChatWidgetPanel), {
  ssr: false,
  loading: () => null,
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

  // Below sm the launcher is an icon-only circle: page content scrolls under
  // this fixed corner, and on a phone the full pill hid a whole FAQ toggle or
  // the end of a footer line. The label stays in the accessibility tree.
  return (
    <button
      type="button"
      onClick={openChat}
      className="fixed right-5 bottom-5 z-50 inline-flex size-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-black/80 text-sm font-semibold text-white shadow-2xl shadow-black/30 backdrop-blur transition hover:border-white/30 hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue sm:size-auto sm:px-4 sm:py-3"
      aria-label="Open Amin AI chat"
    >
      <Sparkles className="h-4 w-4 text-accent-blue" aria-hidden />
      <span className="sr-only sm:not-sr-only">Amin AI</span>
    </button>
  );
}
