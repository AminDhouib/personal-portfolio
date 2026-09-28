import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { BOOKING_URL } from "@/data/nav";

interface BookCallCtaProps {
  title: string;
  body: string;
  /** Show Amin's headshot: used as the author card under blog posts. */
  showAvatar?: boolean;
}

// End-of-page call to action for the pages search visitors land on (project
// pages, blog posts), which otherwise end without a next step.
export function BookCallCta({ title, body, showAvatar }: BookCallCtaProps) {
  return (
    <aside className="mt-12 flex flex-col gap-5 rounded-xl border border-(--border) bg-(--card) p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        {showAvatar && (
          <Image
            src="/profile.jpg"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-full border border-(--border) object-cover"
          />
        )}
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-(--muted)">{body}</p>
        </div>
      </div>
      <a
        href={BOOKING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent-green px-5 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
      >
        Book a Call
        <ArrowRight className="h-4 w-4" />
      </a>
    </aside>
  );
}
