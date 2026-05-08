import Link from "next/link";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";
import { ReviewsClient } from "./reviews-client";
import { CALENDLY_URL } from "@/data/nav";

export const metadata = {
  title: "Reviews",
  description: "Client reviews and testimonials for Amin Dhouib / Devino.",
};

const trustStats = [
  { value: "5/5", label: "On Google" },
  { value: "5/5", label: "On Contra" },
  { value: "100%", label: "Job Success On Upwork" },
  { value: "100+", label: "Satisfied Clients" },
];

export default function ReviewsPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tight mb-2">
              Client Reviews
            </h1>
            <p className="text-(--muted)">
              What clients say about working with Amin.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-accent-amber text-accent-amber" />
              ))}
            </div>
            <span className="text-sm font-semibold">5.0</span>
            <span className="text-sm text-(--muted)">· 11 reviews</span>
          </div>
        </div>

        {/* Trust bar — stats + CTA */}
        <div
          className="relative rounded-2xl border border-accent-blue/20 px-6 py-10 sm:px-10 sm:py-12 mb-12 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(15,23,42,0.6) 60%, rgba(15,23,42,0.85) 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,0.35), transparent 70%)",
            }}
            aria-hidden
          />
          <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-4 text-center">
            {trustStats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-4xl sm:text-5xl font-black tracking-tight mb-2">
                  {s.value}
                </div>
                <div className="text-sm text-(--muted)">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="relative text-center text-base text-(--foreground)/90 mt-10 max-w-2xl mx-auto">
            Let me exceed your expectations and make you my next happy client.
          </p>
          <div className="relative flex justify-center mt-6">
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-(--foreground) text-(--background) px-7 py-3 text-sm font-semibold hover:brightness-110 transition-all"
            >
              Let&apos;s Talk
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <ReviewsClient />
      </div>
    </div>
  );
}
