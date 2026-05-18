"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { reviews, type Review } from "@/data/reviews";
import { SiIcon } from "@/components/ui/tech-icon";

import { LinkedInIcon } from "@/components/ui/social-links";

const SOURCE_ICON_SLUG: Record<Review["source"], string> = {
  Google: "google",
  LinkedIn: "linkedin",
  Upwork: "upwork",
  Contra: "contra",
};

function SourceBadge({ source, link }: { source: Review["source"]; link?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 text-xs text-(--muted) font-medium">
      {source === "LinkedIn" ? (
        <LinkedInIcon className="h-3.5 w-3.5" />
      ) : (
        <SiIcon slug={SOURCE_ICON_SLUG[source]} className="h-3.5 w-3.5" />
      )}
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
