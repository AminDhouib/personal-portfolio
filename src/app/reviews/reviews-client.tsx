"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { reviews, type Review } from "@/data/reviews";
import { SiIcon } from "@/components/ui/tech-icon";

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>
  );
}

const SOURCE_ICON_SLUG: Record<Review["source"], string> = {
  Google: "google",
  LinkedIn: "linkedin",
  Upwork: "upwork",
  Contra: "contra",
};

function SourceBadge({ source, link }: { source: Review["source"]; link?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 text-xs text-(--muted) font-medium">
      <SiIcon slug={SOURCE_ICON_SLUG[source]} className="h-3.5 w-3.5" />
      From {source}
    </span>
  );
  if (!link) return inner;
  return (
    <Link
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`See review on ${source}`}
      className="hover:text-(--foreground) transition-colors"
    >
      {inner}
    </Link>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const [profileOk, setProfileOk] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  const { name, position, company, companyLogo, profileImage, rating, comment, companyLink, linkedin, link, source } = review;
  // Most company logos already work with .logo-tinted (white in dark mode,
  // original colors in light mode). Expert Partners' logo is a white-on-
  // transparent silhouette though, so it needs the silhouette filter to
  // remain visible on a white card in light mode.
  const logoClass =
    companyLogo === "/reviews/companies/ep.webp"
      ? "logo-silhouette"
      : "logo-tinted";

  return (
    <div className="break-inside-avoid relative bg-(--card) border border-(--border) rounded-[20px] mb-4 p-7">

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
              <Link href={companyLink} target="_blank" rel="noopener noreferrer" className="inline-block mb-1">
                <Image
                  src={companyLogo}
                  alt={company ?? ""}
                  width={120}
                  height={24}
                  className={`h-5 w-auto ${logoClass} object-contain`}
                  onError={() => setLogoOk(false)}
                />
              </Link>
            ) : (
              <Image
                src={companyLogo}
                alt={company ?? ""}
                width={120}
                height={24}
                className={`h-5 w-auto ${logoClass} object-contain mb-1`}
                onError={() => setLogoOk(false)}
              />
            )
          ) : null}

          <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
            {linkedin ? (
              <Link
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#0a66c2] transition-colors inline-flex items-center gap-1.5"
                aria-label={`${name}'s LinkedIn profile`}
              >
                {name}
                <LinkedInIcon className="h-3.5 w-3.5 text-(--muted) shrink-0" />
              </Link>
            ) : (
              <span>{name}</span>
            )}
          </div>
          {(position || company) && (
            <p className="text-xs text-(--muted) mt-0.5">
              {position}
              {position && company && !companyLogo ? " · " : ""}
              {!companyLogo || !logoOk
                ? companyLink
                  ? <Link href={companyLink} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-(--foreground) transition-colors">{company}</Link>
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
        <SourceBadge source={source} link={link} />
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
      className="columns-1 md:columns-2 w-full"
    >
      {sorted.map((review, i) => (
        <ReviewCard key={`${review.name}-${i}`} review={review} />
      ))}
    </motion.div>
  );
}
