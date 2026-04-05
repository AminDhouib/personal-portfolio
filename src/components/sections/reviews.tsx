"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { reviews } from "@/data/reviews";

export function Reviews() {
  // Duplicate for infinite scroll effect
  const scrollReviews = [...reviews, ...reviews];

  return (
    <section id="reviews" className="py-24 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="05"
          title="What Clients Say"
          color="var(--color-accent-amber)"
        />
      </div>

      {/* Auto-scrolling marquee */}
      <div className="relative marquee-container">
        <div className="flex gap-6 animate-marquee py-2">
          {scrollReviews.map((review, i) => (
            <div
              key={`${review.name}-${i}`}
              className="shrink-0 w-[340px] rounded-xl border border-(--border) bg-(--card) p-6 hover:border-(--muted)/30 transition-colors"
            >
              {/* Quote */}
              <p className="text-sm text-(--foreground) leading-relaxed mb-4 line-clamp-4">
                &ldquo;{review.comment}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                {review.profileImage && (
                  <Image
                    src={review.profileImage}
                    alt={review.name}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold">{review.name}</p>
                  <p className="text-xs text-(--muted)">
                    {review.position}
                    {review.company ? `, ${review.company}` : ""}
                  </p>
                </div>
              </div>

              {/* Bottom accent line */}
              <div className="mt-4 h-px w-full bg-accent-amber/20" />
            </div>
          ))}
        </div>
      </div>

      {/* Rating summary */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-10">
        <div className="flex items-center justify-center gap-2">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className="h-4 w-4 fill-accent-amber text-accent-amber"
              />
            ))}
          </div>
          <span className="text-sm font-semibold">5.0 avg</span>
          <span className="text-sm text-(--muted)">
            / 81 reviews on Contra
          </span>
        </div>
      </div>
    </section>
  );
}
