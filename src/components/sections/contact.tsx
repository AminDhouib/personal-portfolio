"use client";

import { motion } from "framer-motion";
import { ArrowRight, Heart, Mail } from "lucide-react";
import { CALENDLY_URL, socialLinks } from "@/data/nav";

function SocialIcon({ icon }: { icon: string }) {
  if (icon === "mail") return <Mail className="h-5 w-5" />;
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
    <section id="contact" className="py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
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
        <div className="mt-16 pt-8 border-t border-(--border)">
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
