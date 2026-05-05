import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { ReviewsClient } from "./reviews-client";

export const metadata = {
  title: "Reviews — Amin Dhouib",
  description: "Client reviews and testimonials for Amin Dhouib / Devino.",
};

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

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
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

        <ReviewsClient />
      </div>
    </div>
  );
}
