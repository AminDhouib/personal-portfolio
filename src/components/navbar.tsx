"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu, X, ArrowRight, Bookmark } from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { navItems, CALENDLY_URL, socialLinks } from "@/data/nav";

function LinkedInIconNav() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>
  );
}

function ContraIconNav() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.5 16.5a7.44 7.44 0 0 1-5.25 2.25A7.493 7.493 0 0 1 3.75 12a7.493 7.493 0 0 1 7.5-6.75 7.44 7.44 0 0 1 5.25 2.25l-1.5 1.5a5.24 5.24 0 0 0-3.75-1.5A5.244 5.244 0 0 0 6 12.75 5.244 5.244 0 0 0 11.25 18c1.38 0 2.63-.54 3.54-1.41L16.5 16.5z"/>
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  // Scroll detection for backdrop blur
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-spy with IntersectionObserver
  useEffect(() => {
    const sectionIds = navItems.map((i) => i.sectionId);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { rootMargin: "-40% 0px -50% 0px" }
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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-(--background)/80 backdrop-blur-xl border-b border-(--border)"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="font-display text-lg font-black tracking-tight"
          >
            AMIN DHOUIB
          </Link>

          {/* Desktop nav links — only show on homepage */}
          {isHome && (
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.sectionId}
                href={item.href}
                className={`relative text-sm font-medium transition-colors duration-200 ${
                  activeSection === item.sectionId
                    ? "text-(--foreground)"
                    : "text-(--muted) hover:text-(--foreground)"
                }`}
              >
                {item.label}
                {activeSection === item.sectionId && (
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent-green rounded-full" />
                )}
              </Link>
            ))}
          </div>
          )}

          {/* Right side: theme toggle + CTA + mobile burger */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            {mounted && (
              <button
                onClick={toggleTheme}
                className="rounded-lg p-2 text-(--muted) hover:text-(--foreground) hover:bg-(--surface) transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Bookmark */}
            {mounted && (
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: document.title, url: window.location.href }).catch(() => {});
                  } else {
                    alert("Press Ctrl+D (Cmd+D on Mac) to bookmark this page!");
                  }
                }}
                className="rounded-lg p-2 text-(--muted) hover:text-(--foreground) hover:bg-(--surface) transition-colors"
                aria-label="Bookmark"
                title="Bookmark this page"
              >
                <Bookmark className="h-4 w-4" />
              </button>
            )}

            {/* CTA */}
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-110"
            >
              Book a Call
              <ArrowRight className="h-3.5 w-3.5" />
            </a>

            {/* Mobile burger */}
            {/* Mobile burger — only on homepage */}
            {isHome && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden rounded-lg p-2 text-(--muted) hover:text-(--foreground)"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile slide-out panel */}
      <AnimatePresence>
        {isHome && mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            {/* Panel */}
            <motion.div
              className="fixed top-0 right-0 h-full w-72 bg-(--background) border-l border-(--border) z-50 md:hidden flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-(--border)">
                <span className="font-display text-sm font-black tracking-tight">
                  AMIN DHOUIB
                </span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-1.5 text-(--muted) hover:text-(--foreground) hover:bg-(--surface) transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 px-4 py-6 space-y-1">
                {navItems.map((item, i) => (
                  <motion.div
                    key={item.sectionId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors ${
                        activeSection === item.sectionId
                          ? "bg-accent-green/10 text-accent-green"
                          : "text-(--muted) hover:text-(--foreground) hover:bg-(--surface)"
                      }`}
                    >
                      {activeSection === item.sectionId && (
                        <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
                      )}
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {/* Social links */}
              <div className="px-5 pb-3 flex items-center gap-4">
                {socialLinks.slice(0, 4).map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--muted) hover:text-(--foreground) transition-colors"
                    aria-label={link.name}
                  >
                    {link.icon === "linkedin" ? (
                      <LinkedInIconNav />
                    ) : link.icon === "contra" ? (
                      <ContraIconNav />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://cdn.simpleicons.org/${link.icon}/888888`}
                        alt={link.name}
                        className="h-4 w-4"
                      />
                    )}
                  </a>
                ))}
              </div>

              {/* CTA */}
              <div className="px-4 pb-8">
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-3 text-sm font-semibold text-black w-full"
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
