"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu, X, ArrowRight } from "lucide-react";
import { useTheme } from "next-themes";
import { navItems, CALENDLY_URL } from "@/data/nav";

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

      {/* Mobile menu */}
      {isHome && mobileOpen && (
        <div className="md:hidden bg-(--background)/95 backdrop-blur-xl border-t border-(--border)">
          <div className="px-4 py-4 space-y-3">
            {navItems.map((item) => (
              <Link
                key={item.sectionId}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block text-base font-medium py-2 transition-colors ${
                  activeSection === item.sectionId
                    ? "text-accent-green"
                    : "text-(--muted)"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-3 text-sm font-semibold text-black w-full mt-4"
            >
              Book a Call
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
