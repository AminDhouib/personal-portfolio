import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ReviewsClient } from "./reviews-client";
import { BOOKING_URL } from "@/data/nav";

export const metadata = {
  title: "Reviews",
  description: "Client reviews and testimonials for Amin Dhouib / Devino.",
};

const trustStats = [
  { value: "5/5", label: "On Contra" },
  { value: "100%", label: "Job Success On Upwork" },
  { value: "50+", label: "Satisfied Clients" },
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

        <div className="mb-10">
          <h1 className="font-display text-4xl font-black tracking-tight mb-2">
            Client Reviews
          </h1>
          <p className="text-(--muted)">
            What clients say about working with Amin.
          </p>
        </div>

        <ReviewsClient />

        {/* Trust bar — stats + CTA. Sits below the reviews so the visitor
            ends on a strong call to action. Gradient adapts to theme. */}
        <div className="trust-bar relative rounded-2xl border border-(--border) px-6 py-10 sm:px-10 sm:py-12 mt-12 overflow-hidden">
          <div className="trust-bar-glow pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-y-8 gap-x-4 text-center">
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
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-(--foreground) text-(--background) px-7 py-3 text-sm font-semibold hover:brightness-110 transition-all"
            >
              Let&apos;s Talk
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
