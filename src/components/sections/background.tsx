"use client";

import { motion } from "framer-motion";
import { GraduationCap, Languages } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";

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
        <SectionHeading
          number="07"
          title="Background"
          color="var(--color-accent-cyan)"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
          {/* Education */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap className="h-5 w-5 text-accent-cyan" />
              <h3 className="font-display text-lg font-bold">Education</h3>
            </div>
            <p className="text-base font-semibold">University of Ottawa</p>
            <p className="text-sm text-(--muted)">
              BASc Computer Software Engineering
            </p>
            <p className="text-sm text-accent-green font-medium mt-1">
              Summa Cum Laude (A+)
            </p>
          </motion.div>

          {/* Languages */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <Languages className="h-5 w-5 text-accent-cyan" />
              <h3 className="font-display text-lg font-bold">Languages</h3>
            </div>
            <p className="text-sm text-(--muted)">
              <span className="text-(--foreground) font-medium">
                Fluent:
              </span>{" "}
              English, French
            </p>
            <p className="text-sm text-(--muted) mt-1">
              <span className="text-(--foreground) font-medium">
                Working:
              </span>{" "}
              Arabic
            </p>
          </motion.div>
        </div>
      </div>

      {/* Tech logo marquee */}
      <div className="overflow-hidden marquee-container">
        <div className="flex gap-12 items-center animate-marquee py-4">
          {scrollLogos.map((slug, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${slug}-${i}`}
              src={`https://cdn.simpleicons.org/${slug}/888888`}
              alt={slug}
              className="h-8 w-8 shrink-0 opacity-40 hover:opacity-100 transition-opacity"
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
