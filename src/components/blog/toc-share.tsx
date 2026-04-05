"use client";

import { Share2, Check, Link } from "lucide-react";
import { useState } from "react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // fallthrough to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-3 py-1.5 text-sm text-(--muted) hover:text-(--foreground) hover:border-(--muted)/40 transition-all"
      title="Share this post"
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
    </button>
  );
}

export function TableOfContents({
  entries,
}: {
  entries: { id: string; text: string; level: 2 | 3 }[];
}) {
  if (entries.length === 0) return null;

  return (
    <nav className="hidden lg:block" aria-label="Table of contents">
      <div className="sticky top-28">
        <p className="text-xs font-bold uppercase tracking-wider text-(--muted) mb-3">
          On this page
        </p>
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id}>
              <a
                href={`#${entry.id}`}
                className={`block text-sm leading-snug text-(--muted) hover:text-(--foreground) transition-colors ${
                  entry.level === 3 ? "pl-3" : ""
                }`}
              >
                {entry.text}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-4 border-t border-(--border)">
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
          >
            <Link className="h-3 w-3" />
            Back to top
          </a>
        </div>
      </div>
    </nav>
  );
}
