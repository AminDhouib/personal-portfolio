"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { GraduationCap, Languages } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SiIcon } from "@/components/ui/tech-icon";

const techLogos = [
  "react",
  "typescript",
  "python",
  "docker",
  "googlecloud",
  "prisma",
  "django",
  "terraform",
  "nextdotjs",
  "nodedotjs",
  "tailwindcss",
  "postgresql",
  "mongodb",
  "redis",
  "fastapi",
  "rust",
  "threedotjs",
  "figma",
  "selenium",
  "jenkins",
];

export function Background() {
  // Duplicate for infinite scroll
  const scrollLogos = [...techLogos, ...techLogos];

  return (
    <section id="background" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="07" title="Background" color="var(--color-accent-cyan)" />

        <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-2">
          {/* Education */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-4 flex items-center gap-3">
              <GraduationCap className="h-5 w-5 text-accent-cyan" />
              <h3 className="font-display text-lg font-bold">Education</h3>
            </div>
            <div className="flex items-start gap-4">
              <Image
                src="/logos/companies/uottawa.png"
                alt="University of Ottawa"
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-full"
              />
              <div>
                <p className="text-base font-semibold">University of Ottawa</p>
                <p className="text-sm text-(--muted)">BASc Computer Software Engineering</p>
                <p className="mt-1 text-sm font-medium text-accent-green">Summa Cum Laude (A+)</p>
              </div>
            </div>
          </motion.div>

          {/* Languages */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="mb-4 flex items-center gap-3">
              <Languages className="h-5 w-5 text-accent-cyan" />
              <h3 className="font-display text-lg font-bold">Languages</h3>
            </div>
            <p className="text-sm text-(--muted)">
              <span className="font-medium text-(--foreground)">Fluent:</span> English, French
            </p>
            <p className="mt-1 text-sm text-(--muted)">
              <span className="font-medium text-(--foreground)">Working:</span> Arabic
            </p>
          </motion.div>
        </div>
      </div>

      {/* Tech logo marquee */}
      <div className="marquee-container overflow-hidden">
        <div className="animate-marquee flex items-center gap-12 py-4">
          {scrollLogos.map((slug, i) => (
            <SiIcon
              key={`${slug}-${i}`}
              slug={slug}
              className="h-8 w-8 shrink-0 text-(--muted) opacity-40 transition-opacity hover:opacity-100"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
