import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ReviewsClient } from "./reviews-client";
import { BOOKING_URL } from "@/data/nav";

const SITE_ORIGIN = "https://amindhou.com";

const DESCRIPTION = "Client reviews and testimonials for Amin Dhouib / Devino.";

export const metadata = {
  title: "Reviews",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/reviews`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/reviews`,
    title: "Client Reviews — Amin Dhouib",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Reviews" }],
  },
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
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <div className="mb-10">
          <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Client Reviews</h1>
          <p className="text-(--muted)">What clients say about working with Amin.</p>
        </div>

        <ReviewsClient />

        {/* Trust bar — stats + CTA. Sits below the reviews so the visitor
            ends on a strong call to action. Gradient adapts to theme. */}
        <div className="trust-bar relative mt-12 overflow-hidden rounded-2xl border border-(--border) px-6 py-10 sm:px-10 sm:py-12">
          <div className="trust-bar-glow pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative grid grid-cols-1 gap-x-4 gap-y-8 text-center sm:grid-cols-3">
            {trustStats.map((s) => (
              <div key={s.label}>
                <div className="mb-2 font-display text-4xl font-black tracking-tight sm:text-5xl">
                  {s.value}
                </div>
                <div className="text-sm text-(--muted)">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="relative mx-auto mt-10 max-w-2xl text-center text-base text-(--foreground)/90">
            Let me exceed your expectations and make you my next happy client.
          </p>
          <div className="relative mt-6 flex justify-center">
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-(--foreground) px-7 py-3 text-sm font-semibold text-(--background) transition-all hover:brightness-110"
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
