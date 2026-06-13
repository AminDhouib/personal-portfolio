"use client";

import { motion } from "framer-motion";
import { ArrowRight, Heart } from "lucide-react";
import { CALENDLY_URL } from "@/data/nav";
import { SocialLinks } from "@/components/ui/social-links";

export function Contact() {
  const currentYear = new Date().getFullYear();

  return (
    <section id="contact" className="py-32 section-gradient">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm text-(--muted) mb-6 tracking-widest uppercase">
            11 — Contact
          </p>
          <h2 className="font-display text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-8">
            LET&apos;S
            <br />
            BUILD.
          </h2>

          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-8 py-4 text-lg font-bold text-black transition-all hover:brightness-110"
          >
            Book a Call
            <ArrowRight className="h-5 w-5" />
          </a>
        </motion.div>

        {/* Social icons */}
        <SocialLinks size="h-5 w-5" showEmail className="flex items-center justify-center gap-6 mt-12" />

        {/* Footer */}
        <footer className="mt-16 pt-8">
          <div className="section-divider mb-8" />
          <p className="text-xs text-(--muted)">
            &copy; {currentYear} Amin Dhouib / amindhou.com
          </p>
          <p className="text-xs text-(--muted)/60 mt-1 flex items-center justify-center gap-1">
            Hosted on a home server with <Heart className="h-3 w-3 text-accent-green" />
          </p>
        </footer>
      </div>
    </section>
  );
}
