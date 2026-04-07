"use client";

import { motion } from "framer-motion";
import { ArrowRight, Heart, Mail } from "lucide-react";
import { CALENDLY_URL, socialLinks } from "@/data/nav";

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
    </svg>
  );
}

function ContraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.5 16.5a7.44 7.44 0 0 1-5.25 2.25A7.493 7.493 0 0 1 3.75 12a7.493 7.493 0 0 1 7.5-6.75 7.44 7.44 0 0 1 5.25 2.25l-1.5 1.5a5.24 5.24 0 0 0-3.75-1.5A5.244 5.244 0 0 0 6 12.75 5.244 5.244 0 0 0 11.25 18c1.38 0 2.63-.54 3.54-1.41L16.5 16.5z"/>
    </svg>
  );
}

function SocialIcon({ icon }: { icon: string }) {
  if (icon === "mail") return <Mail className="h-5 w-5" />;
  if (icon === "linkedin") return <LinkedInIcon className="h-5 w-5" />;
  if (icon === "contra") return <ContraIcon className="h-5 w-5" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${icon}/888888`}
      alt={icon}
      className="h-5 w-5"
      loading="lazy"
    />
  );
}

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
        <div className="flex items-center justify-center gap-6 mt-12">
          {socialLinks.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--muted) hover:text-(--foreground) transition-colors"
              aria-label={link.name}
            >
              <SocialIcon icon={link.icon} />
            </a>
          ))}
          <a
            href="mailto:amin@devino.ca"
            className="text-(--muted) hover:text-(--foreground) transition-colors"
            aria-label="Email"
          >
            <Mail className="h-5 w-5" />
          </a>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8">
          <div className="section-divider mb-8" />
          <p className="text-xs text-(--muted)">
            &copy; {currentYear} Amin Dhouib / amindhou.com
          </p>
          <p className="text-xs text-(--muted)/60 mt-1 flex items-center justify-center gap-1">
            Hosted on a home server with <Heart className="h-3 w-3 text-accent-green" />
          </p>
        </div>
      </div>
    </section>
  );
}
