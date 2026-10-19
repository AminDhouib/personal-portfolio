"use client";

import { Share2, Check, Link } from "lucide-react";
import { useState, useEffect } from "react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  // The label fades in on every change after the first click, but not on first paint: the
  // server-rendered "Share" must never start at opacity 0.
  const [touched, setTouched] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // silent-ok: navigator.share rejects when the user dismisses the sheet; fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setTouched(true);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // min-w-28 (7rem) is wider than the longer state ("Copied!" with its icon, padding and
  // border is about 6.2rem at text-sm), so the button never changes width and the row it
  // sits in never shifts. The same width holds in the header and footer placements.
  // The live region is a sibling, not a child: a button's children are presentational for
  // assistive tech, so a status role inside it would not be announced reliably.
  return (
    <>
      <button
        onClick={() => {
          void handleShare();
        }}
        className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg border border-(--border) px-3 py-1.5 text-sm text-(--muted) transition-[color,border-color,scale] duration-(--motion-dur-fast) hover:border-(--muted)/40 hover:text-(--foreground) motion-safe:active:scale-[0.98]"
        title="Share this post"
      >
        <span
          key={copied ? "copied" : "idle"}
          className={
            touched
              ? "motion-fade-in inline-flex items-center gap-2"
              : "inline-flex items-center gap-2"
          }
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent-green" />
              <span className="text-accent-green">Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="h-3.5 w-3.5" />
              Share
            </>
          )}
        </span>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </>
  );
}

export function TableOfContents({
  entries,
}: {
  entries: { id: string; text: string; level: 2 | 3 }[];
}) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (entries.length === 0) return;
    const ids = entries.map((e) => e.id);
    const observers: IntersectionObserver[] = [];

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          if (entry.isIntersecting) setActiveId(id);
        },
        { rootMargin: "-20% 0px -70% 0px" },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <nav className="hidden lg:block" aria-label="Table of contents">
      <div className="sticky top-28">
        <p className="mb-3 text-xs font-bold tracking-wider text-(--muted) uppercase">
          On this page
        </p>
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className={`block text-sm leading-snug transition-colors ${
                  entry.level === 3 ? "pl-3" : ""
                } ${
                  activeId === entry.id
                    ? "font-medium text-accent-blue"
                    : "text-(--muted) hover:text-(--foreground)"
                }`}
              >
                {activeId === entry.id && (
                  <span className="mr-1.5 inline-block h-1 w-1 rounded-full bg-accent-blue align-middle" />
                )}
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-(--border) pt-4">
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-xs text-(--muted) transition-colors hover:text-(--foreground)"
          >
            <Link className="h-3 w-3" />
            Back to top
          </a>
        </div>
      </div>
    </nav>
  );
}
