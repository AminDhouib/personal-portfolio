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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-(--muted)">
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
      className="transition-colors hover:text-(--foreground)"
    >
      {inner}
    </Link>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const [profileOk, setProfileOk] = useState(true);
  const [logoOk, setLogoOk] = useState(true);

  const {
    name,
    position,
    company,
    companyLogo,
    profileImage,
    rating,
    comment,
    companyLink,
    linkedin,
    link,
    source,
  } = review;
  // Most company logos already work with .logo-tinted (white in dark mode,
  // original colors in light mode). Expert Partners' logo is a white-on-
  // transparent silhouette though, so it needs the silhouette filter to
  // remain visible on a white card in light mode.
  const logoClass =
    companyLogo === "/reviews/companies/ep.webp" ? "logo-silhouette" : "logo-tinted";

  return (
    <div className="relative mb-4 break-inside-avoid rounded-[20px] border border-(--border) bg-(--card) p-7">
      {/* Author header */}
      <div className="mb-5 flex items-start gap-4">
        {profileImage && profileOk ? (
          <Image
            src={profileImage}
            alt={name}
            width={52}
            height={52}
            className="shrink-0 rounded-xl object-cover"
            onError={() => setProfileOk(false)}
          />
        ) : (
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-(--muted)/20 text-lg font-bold text-(--foreground)">
            {name.charAt(0)}
          </div>
        )}

        <div className="min-w-0">
          {companyLogo && logoOk ? (
            companyLink ? (
              <Link
                href={companyLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-1 inline-block"
              >
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
                className={`h-5 w-auto ${logoClass} mb-1 object-contain`}
                onError={() => setLogoOk(false)}
              />
            )
          ) : null}

          <div className="flex items-center gap-1.5 text-sm leading-tight font-semibold">
            {linkedin ? (
              <Link
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-[#0a66c2]"
                aria-label={`${name}'s LinkedIn profile`}
              >
                {name}
                <LinkedInIcon className="h-3.5 w-3.5 shrink-0 text-(--muted)" />
              </Link>
            ) : (
              <span>{name}</span>
            )}
          </div>
          {(position || company) && (
            <p className="mt-0.5 text-xs text-(--muted)">
              {position}
              {position && company && !companyLogo ? " · " : ""}
              {!companyLogo || !logoOk ? (
                companyLink ? (
                  <Link
                    href={companyLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium transition-colors hover:text-(--foreground)"
                  >
                    {company}
                  </Link>
                ) : (
                  company
                )
              ) : null}
            </p>
          )}
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm leading-relaxed whitespace-pre-line text-(--foreground)">{comment}</p>

      {/* Stars + source */}
      <div className="mt-4 flex items-center justify-between">
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
      className="w-full columns-1 md:columns-2"
    >
      {sorted.map((review, i) => (
        <ReviewCard key={`${review.name}-${i}`} review={review} />
      ))}
    </motion.div>
  );
}
