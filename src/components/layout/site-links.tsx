import Link from "next/link";

// Plain links to every top-level page. The navbar mostly scrolls to homepage
// sections, so without these /work, /blog and /ai had almost no crawlable
// internal links pointing at them.
const SITE_LINKS = [
  { label: "Work", href: "/work" },
  { label: "Blog", href: "/blog" },
  { label: "Reviews", href: "/reviews" },
  { label: "Games", href: "/games" },
  { label: "Amin AI", href: "/ai" },
  { label: "RSS", href: "/feed.xml" },
] as const;

export function SiteLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Site pages" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {SITE_LINKS.map((link) => (
          <li key={link.href}>
            {/* The feed is not a page: a plain anchor, so the router does not try to render it. */}
            {link.href === "/feed.xml" ? (
              <a
                href={link.href}
                className="inline-block py-1 text-xs text-(--muted) transition-colors hover:text-(--foreground)"
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                className="inline-block py-1 text-xs text-(--muted) transition-colors hover:text-(--foreground)"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
