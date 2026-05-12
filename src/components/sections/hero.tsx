"use client";

import Image from "next/image";
import { ChevronDown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { CALENDLY_URL } from "@/data/nav";

export function Hero() {
  const currentYear = new Date().getFullYear();

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full py-10 sm:py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 lg:gap-12 items-center">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p className="text-sm text-(--muted) mb-6 tracking-widest uppercase">
              Portfolio / {currentYear}
            </p>

            <h1 className="font-display mb-6" aria-label="Amin Dhouib">
              <span aria-hidden="true" className="block text-6xl sm:text-7xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-[0.9]">
                AMIN
              </span>
              <span aria-hidden="true" className="hero-name-suffix block text-6xl sm:text-7xl md:text-6xl lg:text-8xl font-extralight tracking-tighter leading-[0.9] mt-2">
                DHOUIB
              </span>
            </h1>

            {/* Role badges */}
            <div className="flex flex-wrap gap-4 mb-8">
              {[
                { label: "Engineer", color: "var(--color-accent-green)" },
                { label: "Founder", color: "var(--color-accent-blue)" },
                { label: "Builder", color: "var(--color-accent-purple)" },
              ].map((role) => (
                <div key={role.label} className="flex items-center gap-2">
                  <div
                    className="h-0.5 w-6 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  <span className="text-sm font-medium text-(--muted)">
                    {role.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-lg text-(--muted) max-w-md mb-10 leading-relaxed">
              &ldquo;I build apps people actually use &mdash; then self-host
              them on my home server.&rdquo;
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-6 py-3 text-base font-semibold text-black transition-all hover:brightness-110"
              >
                Book a Call
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#work"
                className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-6 py-3 text-base font-medium text-(--muted) transition-colors hover:text-(--foreground) hover:border-(--muted)"
              >
                Explore
                <ChevronDown className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          {/* Right: Profile photo — order-first so it appears above text on mobile */}
          <motion.div
            className="flex justify-center md:justify-end order-first md:order-last"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <div className="relative">
              <div className="w-48 h-48 sm:w-64 sm:h-64 lg:w-80 lg:h-80 rounded-full overflow-hidden glow-green border-2 border-accent-green/30">
                <Image
                  src="/profile.jpg"
                  alt="Amin Dhouib"
                  width={320}
                  height={320}
                  className="object-cover w-full h-full"
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
