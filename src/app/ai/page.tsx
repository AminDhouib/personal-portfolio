import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export const metadata = {
  title: "Amin AI",
  description: "AI-powered tools by Amin Dhouib — coming soon.",
};

export default function AminAIPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, #a855f7 0%, #3b82f6 40%, transparent 80%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 text-center max-w-lg">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="rounded-2xl p-4 border"
            style={{
              background:
                "linear-gradient(135deg, #a855f720, #3b82f620, #06b6d420)",
              borderColor: "#a855f740",
            }}
          >
            <Sparkles className="h-10 w-10" style={{ color: "#a855f7" }} />
          </div>
        </div>

        {/* Title */}
        <h1
          className="font-display text-5xl font-black tracking-tight mb-4 bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(90deg,#a855f7,#6366f1,#3b82f6,#06b6d4,#ec4899,#a855f7)",
            backgroundSize: "250% 100%",
            animation: "amin-games-shimmer 3s linear infinite",
          }}
        >
          Amin AI
        </h1>

        <p className="text-lg text-(--muted) mb-3 leading-relaxed">
          AI-powered tools built by Amin Dhouib.
        </p>
        <p className="text-sm text-(--muted)/60 mb-10">
          Coming soon — stay tuned.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to portfolio
        </Link>
      </div>
    </div>
  );
}
