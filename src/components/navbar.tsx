"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  Bookmark,
  Home,
  Briefcase,
  Layers,
  BookOpen,
  Star,
  Gamepad2,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { navItems, BOOKING_URL } from "@/data/nav";
import { SocialLinks } from "@/components/ui/social-links";

const NAV_ICONS: Record<string, LucideIcon> = {
  hero: Home,
  work: Briefcase,
  services: Layers,
  blog: BookOpen,
  reviews: Star,
  game: Gamepad2,
  ai: Sparkles,
};

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isGames = pathname === "/games" || pathname.startsWith("/games/");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Scroll detection for backdrop blur. Threshold lifted from 20→64
  // (one navbar height) so trivial scroll jitter at the very top of the
  // page doesn't toggle the bg/border on and off.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Body scroll lock while the mobile menu is open. Without this, the page
  // scrolls behind the fixed panel/backdrop, leaving the menu visually
  // floating over unrelated content. Restore the previous overflow on
  // close so we don't trample any other lock the app may have set.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Close the menu automatically on route change so the panel never
  // outlives a navigation (e.g. tapping a link, then using the back button).
  useEffect(() => {
    const id = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // Scroll-spy with IntersectionObserver
  useEffect(() => {
    const sectionIds = navItems.map((i) => i.sectionId);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: "-40% 0px -50% 0px" },
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <nav
      className={`fixed top-0 right-0 left-0 z-70 transition-[background-color,backdrop-filter] duration-500 ease-out ${
        scrolled ? "bg-(--background)/80 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo — "AMIN GAMES" with subtle rainbow shimmer on /games */}
          <Link
            href={isGames ? "/games" : "/"}
            className="font-display text-lg font-black tracking-tight"
          >
            {isGames ? (
              <>
                AMIN{" "}
                <span
                  className="nav-games-shimmer bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #ec4899, #f59e0b, #22c55e, #6366f1, #ec4899)",
                    backgroundSize: "200% 100%",
                    animation: "amin-games-shimmer 6s linear infinite",
                  }}
                >
                  GAMES
                </span>
              </>
            ) : (
              "AMIN DHOUIB"
            )}
          </Link>

          {/* Desktop nav links — hidden only on /games routes */}
          {!isGames && (
            <div className="hidden items-center gap-7 xl:flex">
              {navItems.map((item) => {
                const Icon = NAV_ICONS[item.sectionId];
                const sharedClass = `relative flex items-center gap-1.5 text-sm font-medium transition-colors duration-200`;
                const aiContent = (
                  <span
                    className="nav-games-shimmer flex items-center gap-1.5 bg-clip-text font-semibold text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg,#a855f7,#6366f1,#3b82f6,#06b6d4,#ec4899,#a855f7)",
                      backgroundSize: "250% 100%",
                      animation: "amin-games-shimmer 3s linear infinite",
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#a855f7" }} />
                    {item.label}
                  </span>
                );
                if (item.isAI) {
                  return (
                    <button
                      key={item.sectionId}
                      onClick={() => window.dispatchEvent(new CustomEvent("open-amin-ai-chat"))}
                      className={`${sharedClass} cursor-pointer`}
                    >
                      {aiContent}
                    </button>
                  );
                }
                const resolvedHref =
                  !isHome && item.href.startsWith("#") ? `/${item.href}` : item.href;
                const isActive = isHome
                  ? activeSection === item.sectionId
                  : resolvedHref === pathname;
                return (
                  <Link
                    key={item.sectionId}
                    href={resolvedHref}
                    className={`${sharedClass} ${
                      isActive ? "text-(--foreground)" : "text-(--muted) hover:text-(--foreground)"
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                    {item.label}
                    {isActive && (
                      <span className="absolute right-0 -bottom-1 left-0 h-0.5 rounded-full bg-accent-green" />
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right side: theme toggle + CTA + mobile burger */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="rounded-lg p-2 text-(--muted) transition-colors hover:bg-(--surface) hover:text-(--foreground)"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}

            {/* Share / bookmark — uses Web Share API when available (most modern
                browsers including desktop Chrome/Edge/Safari), falls back to a
                Ctrl+D hint on browsers without it (Firefox desktop). */}
            {mounted && (
              <button
                onClick={() => {
                  if (navigator.share) {
                    // silent-ok: navigator.share rejects when the user dismisses the share sheet
                    navigator
                      .share({ title: document.title, url: window.location.href })
                      .catch(() => undefined);
                  } else {
                    alert("Press Ctrl+D (Cmd+D on Mac) to bookmark this page!");
                  }
                }}
                className="rounded-lg p-2 text-(--muted) transition-colors hover:bg-(--surface) hover:text-(--foreground)"
                aria-label="Share or bookmark this page"
                title="Share or bookmark this page"
              >
                <Bookmark className="h-4 w-4" />
              </button>
            )}

            {/* CTA — swaps to a portfolio link on /games so players can find
                the author without a calendar prompt interrupting playtime */}
            {isGames ? (
              <Link
                href="/"
                className="hidden items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold text-(--foreground) transition-all hover:border-accent-green hover:bg-(--surface-hover) sm:inline-flex"
              >
                Who made these games?
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-110 sm:inline-flex"
              >
                Book a Call
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}

            {/* Mobile burger */}
            {/* Mobile burger — visible on all non-games pages */}
            {!isGames && (
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="rounded-lg p-2 text-(--muted) hover:text-(--foreground) xl:hidden"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile slide-out panel */}
      <AnimatePresence>
        {!isGames && mobileOpen && (
          <>
            {/* Backdrop — viewport-sized via w-screen/h-screen because the
                navbar's `backdrop-blur` makes the nav itself a containing
                block for fixed descendants, which would otherwise clip the
                backdrop and panel to the navbar's 64px height. */}
            <motion.div
              className="fixed top-0 left-0 z-60 h-screen w-screen bg-black/60 xl:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            {/* Panel — h-screen + inline backgroundColor for guaranteed
                full-height solid fill regardless of containing-block quirks. */}
            <motion.div
              className="fixed top-0 right-0 z-70 flex h-screen w-72 flex-col border-l border-(--border) xl:hidden"
              style={{ backgroundColor: "var(--background)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-(--border) px-5 py-4">
                <span className="font-display text-sm font-black tracking-tight">AMIN DHOUIB</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-(--muted) transition-colors hover:bg-(--surface) hover:text-(--foreground)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 space-y-1 px-4 py-6">
                {navItems.map((item, i) => {
                  const Icon = NAV_ICONS[item.sectionId];
                  return (
                    <motion.div
                      key={item.sectionId}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      {item.isAI ? (
                        <button
                          onClick={() => {
                            setMobileOpen(false);
                            window.dispatchEvent(new CustomEvent("open-amin-ai-chat"));
                          }}
                          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors hover:bg-(--surface)"
                        >
                          <span
                            className="nav-games-shimmer flex items-center gap-2 bg-clip-text font-semibold text-transparent"
                            style={{
                              backgroundImage:
                                "linear-gradient(90deg,#a855f7,#6366f1,#3b82f6,#06b6d4,#ec4899,#a855f7)",
                              backgroundSize: "250% 100%",
                              animation: "amin-games-shimmer 3s linear infinite",
                            }}
                          >
                            <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#a855f7" }} />
                            {item.label}
                          </span>
                        </button>
                      ) : (
                        <Link
                          href={!isHome && item.href.startsWith("#") ? `/${item.href}` : item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                            (isHome ? activeSection === item.sectionId : item.href === pathname)
                              ? "bg-accent-green/10 text-accent-green"
                              : "text-(--muted) hover:bg-(--surface) hover:text-(--foreground)"
                          }`}
                        >
                          {Icon && <Icon className="h-4 w-4 shrink-0" />}
                          {item.label}
                        </Link>
                      )}
                    </motion.div>
                  );
                })}
              </nav>

              {/* Social links */}
              <SocialLinks size="h-4 w-4" limit={4} className="flex items-center gap-4 px-5 pb-3" />

              {/* CTA */}
              <div className="px-4 pb-8">
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-3 text-sm font-semibold text-black"
                  onClick={() => setMobileOpen(false)}
                >
                  Book a Call
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}
