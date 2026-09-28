"use client";

import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { SocialLinks } from "@/components/ui/social-links";
import { SiteLinks } from "./site-links";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const currentYear = new Date().getFullYear();

  // pb-24 below sm: the last line has to clear the fixed chat launcher in the
  // bottom-right corner (bottom-5 plus its 48px height) once the page is
  // scrolled to the end.
  return (
    <footer className="mt-auto border-t border-(--border) pt-8 pb-24 sm:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6 lg:px-8">
        <SocialLinks size="h-4 w-4" showEmail className="flex items-center gap-5" />
        <SiteLinks />
        <p className="text-xs text-(--muted)">&copy; {currentYear} Amin Dhouib / amindhou.com</p>
        <p className="flex items-center gap-1 text-xs text-(--muted)">
          Hosted on a home server with <Heart className="h-3 w-3 text-accent-green" />
        </p>
      </div>
    </footer>
  );
}
