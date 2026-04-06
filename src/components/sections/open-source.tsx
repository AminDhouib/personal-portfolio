"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { GitFork, Star, ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import type { RepoStats, ContributionDay } from "@/lib/github";

interface OSSProject {
  name: string;
  description: string;
  logo: string;
  github: string;
  forks: number;
  stars: number;
}

const ossDefaults: OSSProject[] = [
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
  { name: "Prettier", icon: "prettier" },
  { name: "ESLint", icon: "eslint" },
  { name: "knip", icon: null },
  { name: "ruff", icon: "astral" },
  { name: "pyright", icon: null },
  { name: "CodeRabbit", icon: "coderabbit" },
];

// Generate deterministic fallback contribution data
const fallbackContributions: ContributionDay[] = Array.from(
  { length: 364 },
  (_, i) => {
    const hash = ((i * 2654435761) >>> 0) / 4294967296;
    const count = hash > 0.8 ? 8 : hash > 0.5 ? 4 : hash > 0.2 ? 1 : 0;
    const level = (hash > 0.8 ? 4 : hash > 0.5 ? 2 : hash > 0.2 ? 1 : 0) as
      | 0
      | 1
      | 2
      | 3
      | 4;
    return { date: "", count, level };
  }
);

const levelColor: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "rgba(34,197,94,0.06)",
  1: "rgba(34,197,94,0.25)",
  2: "rgba(34,197,94,0.50)",
  3: "rgba(34,197,94,0.75)",
  4: "rgba(34,197,94,1.0)",
};

interface Props {
  caramelStats?: RepoStats;
  upupStats?: RepoStats;
  contributions?: ContributionDay[];
}

export function OpenSource({ caramelStats, upupStats, contributions }: Props) {
  const projects: OSSProject[] = [
    {
      ...ossDefaults[0],
      forks: caramelStats?.forks ?? ossDefaults[0].forks,
      stars: caramelStats?.stars ?? ossDefaults[0].stars,
    },
    {
      ...ossDefaults[1],
      forks: upupStats?.forks ?? ossDefaults[1].forks,
      stars: upupStats?.stars ?? ossDefaults[1].stars,
    },
  ];

  const graph = contributions?.length ? contributions : fallbackContributions;
  // Take last 364 days (52 weeks × 7)
  const graphDays = graph.slice(-364);

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
          {projects.map((project, i) => (
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
                  <p className="text-sm text-(--muted)">{project.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-6 mb-4">
                <div className="flex items-center gap-1.5 text-sm text-(--muted)">
                  <GitFork className="h-4 w-4" />
                  <span>{project.forks.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-(--muted)">
                  <Star className="h-4 w-4" />
                  <span>{project.stars.toLocaleString()}</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 text-sm font-medium text-accent-green group-hover:gap-2 transition-all">
                View on GitHub
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.a>
          ))}
        </div>

        {/* GitHub Contribution Graph */}
        <motion.div
          className="rounded-xl border border-(--border) bg-(--card) p-6 mb-8 overflow-x-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h3 className="text-sm font-semibold text-(--muted) mb-4 uppercase tracking-wider">
            Contribution Graph
            {contributions?.length ? (
              <span className="ml-2 text-accent-green/60 normal-case font-normal">
                — live from GitHub
              </span>
            ) : null}
          </h3>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(52, minmax(10px, 1fr))" }}
          >
            {Array.from({ length: 52 }, (_, col) =>
              Array.from({ length: 7 }, (__, row) => {
                const idx = col * 7 + row;
                const day = graphDays[idx];
                if (!day) return null;
                return (
                  <div
                    key={`${col}-${row}`}
                    className="aspect-square rounded-sm min-w-[10px]"
                    style={{ backgroundColor: levelColor[day.level] }}
                    title={day.date ? `${day.date}: ${day.count} contributions` : undefined}
                  />
                );
              })
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-3 justify-end">
            <span className="text-xs text-(--muted)">Less</span>
            {([0, 1, 2, 3, 4] as const).map((l) => (
              <div
                key={l}
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: levelColor[l] }}
              />
            ))}
            <span className="text-xs text-(--muted)">More</span>
          </div>
        </motion.div>

        {/* CI Stack */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-xs text-(--muted) uppercase tracking-wider mr-2">
            CI Stack:
          </span>
          {ciTools.map((tool) => (
            <span
              key={tool.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-(--surface) border border-(--border) px-3 py-1 text-xs text-(--muted)"
            >
              {tool.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://cdn.simpleicons.org/${tool.icon}/888888`}
                  alt={tool.name}
                  className="h-3 w-3"
                  loading="lazy"
                />
              )}
              {tool.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
