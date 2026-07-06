"use client";

import Image from "next/image";
import { ChevronDown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { BOOKING_URL } from "@/data/nav";

export function Hero() {
  const currentYear = new Date().getFullYear();

  return (
    <section id="hero" className="relative flex min-h-screen items-center overflow-hidden pt-16">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-10 lg:gap-12">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p className="mb-6 text-sm tracking-widest text-(--muted) uppercase">
              Portfolio / {currentYear}
            </p>

            <h1 className="mb-6 font-display" aria-label="Amin Dhouib">
              <span
                aria-hidden="true"
                className="block text-6xl leading-[0.9] font-black tracking-tighter sm:text-7xl md:text-6xl lg:text-8xl"
              >
                AMIN
              </span>
              <span
                aria-hidden="true"
                className="hero-name-suffix mt-2 block text-6xl leading-[0.9] font-extralight tracking-tighter sm:text-7xl md:text-6xl lg:text-8xl"
              >
                DHOUIB
              </span>
            </h1>

            {/* Role badges */}
            <div className="mb-8 flex flex-wrap gap-4">
              {[
                { label: "Engineer", color: "var(--color-accent-green)" },
                { label: "Founder", color: "var(--color-accent-blue)" },
                { label: "Builder", color: "var(--color-accent-purple)" },
              ].map((role) => (
                <div key={role.label} className="flex items-center gap-2">
                  <div className="h-0.5 w-6 rounded-full" style={{ backgroundColor: role.color }} />
                  <span className="text-sm font-medium text-(--muted)">{role.label}</span>
                </div>
              ))}
            </div>

            <p className="mb-10 max-w-md text-lg leading-relaxed text-(--muted)">
              &ldquo;I build apps people actually use &mdash; then self-host them on my home
              server.&rdquo;
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-6 py-3 text-base font-semibold text-black transition-all hover:brightness-110"
              >
                Book a Call
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#work"
                className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-6 py-3 text-base font-medium text-(--muted) transition-colors hover:border-(--muted) hover:text-(--foreground)"
              >
                Explore
                <ChevronDown className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          {/* Right: Profile photo — order-first so it appears above text on mobile */}
          <motion.div
            className="order-first flex justify-center md:order-last md:justify-end"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <div className="relative">
              <div className="glow-green h-48 w-48 overflow-hidden rounded-full border-2 border-accent-green/30 sm:h-64 sm:w-64 lg:h-80 lg:w-80">
                <Image
                  src="/profile.jpg"
                  alt="Amin Dhouib"
                  width={320}
                  height={320}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
