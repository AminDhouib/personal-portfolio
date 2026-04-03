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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <p className="text-sm text-(--muted) mb-6 tracking-widest uppercase">
              Portfolio / {currentYear}
            </p>

            <h1 className="font-display mb-6">
              <span className="block text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9]">
                AMIN
              </span>
              <span className="block text-6xl sm:text-7xl lg:text-8xl font-extralight tracking-tighter leading-[0.9] mt-2">
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

          {/* Right: Profile photo */}
          <motion.div
            className="flex justify-center lg:justify-end"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          >
            <div className="relative">
              <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-full overflow-hidden glow-green border-2 border-accent-green/30">
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
