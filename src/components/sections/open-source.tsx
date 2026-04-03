"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { GitFork, Star, ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";

const ossProjects = [
  {
    name: "Caramel",
    description: "Open-source Honey alternative",
    logo: "/logos/caramel.png",
    github: "https://github.com/DevinoSolutions/caramel",
    forks: 45,
    stars: 234,
  },
  {
    name: "UpUp",
    description: "React file upload component",
    logo: "/logos/upup.png",
    github: "https://github.com/DevinoSolutions/upup",
    forks: 32,
    stars: 189,
  },
];

const ciTools = [
  "Prettier",
  "ESLint",
  "knip",
  "ruff",
  "pyright",
  "CodeRabbit",
];

// Pre-generate contribution levels (deterministic based on index)
const contributionLevels = Array.from({ length: 364 }, (_, i) => {
  // Deterministic pseudo-random based on index
  const hash = ((i * 2654435761) >>> 0) / 4294967296;
  return hash > 0.8 ? 1 : hash > 0.5 ? 0.6 : hash > 0.2 ? 0.3 : 0.1;
});

export function OpenSource() {
  return (
    <section id="opensource" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="06"
          title="Open Source"
          color="var(--color-accent-green)"
        />

        {/* OSS project cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {ossProjects.map((project, i) => (
            <motion.a
              key={project.name}
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group rounded-xl border border-(--border) bg-(--card) p-6 transition-all hover:border-accent-green/30"
            >
              <div className="flex items-start gap-4 mb-4">
                <Image
                  src={project.logo}
                  alt={`${project.name} logo`}
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight">
                    {project.name.toUpperCase()}
                  </h3>
                  <p className="text-sm text-(--muted)">
                    {project.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-4">
                <div className="flex items-center gap-1.5 text-sm text-(--muted)">
                  <GitFork className="h-4 w-4" />
                  <span>{project.forks}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-(--muted)">
                  <Star className="h-4 w-4" />
                  <span>{project.stars}</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 text-sm font-medium text-accent-green group-hover:gap-2 transition-all">
                View on GitHub
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.a>
          ))}
        </div>

        {/* GitHub Contribution Graph placeholder */}
        <motion.div
          className="rounded-xl border border-(--border) bg-(--card) p-6 mb-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h3 className="text-sm font-semibold text-(--muted) mb-4 uppercase tracking-wider">
            Contribution Graph
          </h3>
          {/* Grid of green squares — will be connected to GitHub API */}
          <div className="grid grid-cols-[repeat(52,1fr)] gap-1">
            {contributionLevels.map((level, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-sm"
                  style={{
                    backgroundColor: `rgba(34, 197, 94, ${level})`,
                  }}
                />
            ))}
          </div>
        </motion.div>

        {/* CI Stack */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs text-(--muted) uppercase tracking-wider mr-2">
            CI Stack:
          </span>
          {ciTools.map((tool) => (
            <span
              key={tool}
              className="rounded-full bg-(--surface) border border-(--border) px-3 py-1 text-xs text-(--muted)"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
