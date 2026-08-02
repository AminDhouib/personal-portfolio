"use client";

import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { SocialLinks } from "@/components/ui/social-links";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-(--border) py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 text-center sm:px-6 lg:px-8">
        <SocialLinks size="h-4 w-4" showEmail className="flex items-center gap-5" />
        <p className="text-xs text-(--muted)">&copy; {currentYear} Amin Dhouib / amindhou.com</p>
        <p className="flex items-center gap-1 text-xs text-(--muted)">
          Hosted on a home server with <Heart className="h-3 w-3 text-accent-green" />
        </p>
      </div>
    </footer>
  );
}
