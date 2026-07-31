import type { Metadata } from "next";
import { AiPageChat } from "@/components/chat/ai-page-chat";

const SITE_ORIGIN = "https://amindhou.com";

const DESCRIPTION =
  "Chat with Amin Dhouib's AI assistant — ask about his projects, services, and how to work together.";

export const metadata: Metadata = {
  title: "Amin AI",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/ai`,
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/ai`,
    title: "Amin AI — ask about Amin Dhouib's work",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Amin AI" }],
  },
};

export default function AminAIPage() {
  return (
    <main className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 py-6">
        {/* The page was a bare chat shell: no heading and no crawlable copy, so
            search engines had nothing to index beyond the title tag. */}
        <header className="mb-4 shrink-0">
          <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Amin AI</h1>
          <p className="mt-1 text-sm text-(--muted)">
            Ask about Amin&apos;s projects, services, and availability — the assistant answers from
            the same grounding that powers this site. Want a human? Ask it to put you in touch.
          </p>
        </header>
        {/* CopilotChat sizes itself with h-full, so it needs a box that owns the
            leftover height rather than competing with the header for it. */}
        <div className="min-h-0 flex-1">
          <AiPageChat />
        </div>
      </div>
    </main>
  );
}
