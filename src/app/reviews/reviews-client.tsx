"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ArrowUpRight } from "lucide-react";
import { reviews, type Review } from "@/data/reviews";

function ReviewCard({ review }: { review: Review }) {
  const [profileOk, setProfileOk] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  const { name, position, company, companyLogo, profileImage, rating, comment, companyLink, link, source } = review;

  return (
    <div className="break-inside-avoid relative bg-(--card) border border-(--border) rounded-[20px] mb-4 p-7">
      {link && (
        <Link
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 text-(--muted) hover:text-(--foreground) hover:translate-x-0.5 hover:-translate-y-0.5 transition-all duration-200"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}

      {/* Author header */}
      <div className="flex items-start gap-4 mb-5">
        {profileImage && profileOk ? (
          <Image
            src={profileImage}
            alt={name}
            width={52}
            height={52}
            className="rounded-xl object-cover shrink-0"
            onError={() => setProfileOk(false)}
          />
        ) : (
          <div className="h-[52px] w-[52px] rounded-xl bg-(--muted)/20 text-(--foreground) text-lg font-bold flex items-center justify-center shrink-0">
            {name.charAt(0)}
          </div>
        )}

        <div className="min-w-0">
          {companyLogo && logoOk ? (
            companyLink ? (
              <Link href={companyLink} target="_blank" className="inline-block mb-1">
                <Image
                  src={companyLogo}
                  alt={company ?? ""}
                  width={120}
                  height={24}
                  className="h-5 w-auto brightness-0 dark:invert object-contain"
                  onError={() => setLogoOk(false)}
                />
              </Link>
            ) : (
              <Image
                src={companyLogo}
                alt={company ?? ""}
                width={120}
                height={24}
                className="h-5 w-auto brightness-0 dark:invert object-contain mb-1"
                onError={() => setLogoOk(false)}
              />
            )
          ) : null}

          <p className="text-sm font-semibold leading-tight">{name}</p>
          {(position || company) && (
            <p className="text-xs text-(--muted) mt-0.5">
              {position}
              {position && company && !companyLogo ? " · " : ""}
              {!companyLogo || !logoOk
                ? companyLink
                  ? <Link href={companyLink} target="_blank" className="font-medium hover:text-(--foreground) transition-colors">{company}</Link>
                  : company
                : null}
            </p>
          )}
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm text-(--foreground) leading-relaxed whitespace-pre-line">{comment}</p>

      {/* Stars + source */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex gap-0.5">
          {Array.from({ length: rating }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-accent-amber text-accent-amber" />
          ))}
        </div>
        <span className="text-[11px] text-(--muted) font-medium tracking-wide uppercase">{source}</span>
      </div>
    </div>
  );
}

export function ReviewsClient() {
  const sorted = [...reviews].sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="columns-3 lg:columns-2 md:columns-1 w-full"
    >
      {sorted.map((review, i) => (
        <ReviewCard key={`${review.name}-${i}`} review={review} />
      ))}
    </motion.div>
  );
}
