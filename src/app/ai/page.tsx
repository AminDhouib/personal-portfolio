import type { Metadata } from "next";
import { AiPageChat } from "@/components/chat/ai-page-chat";

export const metadata: Metadata = {
  title: "Amin AI",
  description:
    "Chat with Amin Dhouib's AI assistant — ask about his projects, services, and how to work together.",
};

export default function AminAIPage() {
  return (
    <main className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 py-6">
        <AiPageChat />
      </div>
    </main>
  );
}
