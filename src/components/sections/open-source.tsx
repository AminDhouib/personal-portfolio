"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion } from "framer-motion";
import { GitFork, Star, ArrowRight, EyeOff, BellRing } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SiIcon, TechIcon } from "@/components/ui/tech-icon";
import type { RepoStats, ContributionDay } from "@/lib/github";

interface OSSProject {
  name: string;
  description: string;
  // Brand logo (Caramel, UpUp) …
  logo?: string;
  logoWidth?: number;
  logoHeight?: number;
  // … or a lucide icon for tools without a brand logo.
  icon?: LucideIcon;
  // Stack chips shown on the card (primary language first).
  tech: string[];
  github: string;
  forks: number;
  stars: number;
}

const ossDefaults: OSSProject[] = [
  {
    name: "Caramel",
    description: "Open-source Honey alternative",
    logo: "/logos/caramel.png",
    logoWidth: 1830,
    logoHeight: 467,
    tech: ["TypeScript", "JavaScript", "Swift", "Browser Extension"],
    github: "https://github.com/DevinoSolutions/caramel",
    forks: 45,
    stars: 234,
  },
  {
    name: "UpUp",
    description: "React file upload component",
    logo: "/logos/upup.png",
    logoWidth: 6400,
    logoHeight: 1366,
    tech: ["React", "TypeScript", "AWS S3", "Azure"],
    github: "https://github.com/DevinoSolutions/upup",
    forks: 32,
    stars: 189,
  },
  {
    name: "Stealth Chrome DevTools MCP",
    description:
      "Undetectable browser automation for AI agents via MCP — stealth Chrome with anti-detection profile management and full CDP access.",
    icon: EyeOff,
    tech: ["Python", "nodriver", "CDP", "MCP"],
    github: "https://github.com/DevinoSolutions/stealth-chrome-devtools-mcp",
    forks: 0,
    stars: 3,
  },
  {
    name: "AI Agent Notifier",
    description:
      "Desktop & phone notifications for AI coding agents (Claude Code, Codex, Gemini CLI, Cursor). Toast + ntfy push, zero dependencies.",
    icon: BellRing,
    tech: ["JavaScript", "Node.js", "ntfy"],
    github: "https://github.com/DevinoSolutions/ai-agent-notifier",
    forks: 0,
    stars: 4,
  },
];

const ciTools = [
  { name: "Prettier", icon: "prettier" },
  { name: "ESLint", icon: "eslint" },
  { name: "knip", icon: "knip" },
  { name: "ruff", icon: "ruff" },
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// GitHub-style hover label, e.g. "3 contributions on Tuesday, June 17, 2025".
function contributionLabel(day: ContributionDay): string {
  const phrase =
    day.count === 0
      ? "No contributions"
      : `${day.count} contribution${day.count === 1 ? "" : "s"}`;
  if (!day.date) return phrase;
  const [y, m, d] = day.date.split("-").map(Number);
  // Parse as UTC so the weekday/label never shifts by the viewer's timezone.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${phrase} on ${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

interface Props {
  caramelStats?: RepoStats;
  upupStats?: RepoStats;
  stealthStats?: RepoStats;
  notifierStats?: RepoStats;
  contributions?: ContributionDay[];
}

export function OpenSource({
  caramelStats,
  upupStats,
  stealthStats,
  notifierStats,
  contributions,
}: Props) {
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
    {
      ...ossDefaults[2],
      forks: stealthStats?.forks ?? ossDefaults[2].forks,
      stars: stealthStats?.stars ?? ossDefaults[2].stars,
    },
    {
      ...ossDefaults[3],
      forks: notifierStats?.forks ?? ossDefaults[3].forks,
      stars: notifierStats?.stars ?? ossDefaults[3].stars,
    },
  ];

  const graph = contributions?.length ? contributions : fallbackContributions;
  // Take last 364 days (52 weeks × 7)
  const graphDays = graph.slice(-364);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <section id="opensource" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="04"
          title="Open Source"
          color="var(--color-accent-green)"
        />

        {/* OSS project cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {projects.map((project, i) => {
            const Icon = project.icon;
            return (
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
                <div
                  className="shrink-0 flex items-center justify-center"
                  style={{ minHeight: 36, width: 56 }}
                >
                  {project.logo ? (
                    <Image
                      src={project.logo}
                      alt={`${project.name} logo`}
                      width={project.logoWidth ?? 56}
                      height={project.logoHeight ?? 24}
                      className="logo-tinted"
                      style={{ width: 56, height: "auto" }}
                    />
                  ) : Icon ? (
                    <span className="flex h-10 w-14 items-center justify-center rounded-lg border border-accent-green/20 bg-accent-green/10">
                      <Icon
                        className="h-5 w-5 text-accent-green"
                        strokeWidth={2}
                      />
                    </span>
                  ) : null}
                </div>
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

              {/* Tech stack */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {project.tech.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md border border-(--border) bg-(--surface) px-2 py-0.5 text-[11px] text-(--muted)"
                  >
                    <TechIcon name={t} />
                  </span>
                ))}
              </div>

              <div className="inline-flex items-center gap-1 text-sm font-medium text-accent-green group-hover:gap-2 transition-all">
                View on GitHub
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.a>
            );
          })}
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
            {Array.from({ length: 7 }, (_, row) =>
              Array.from({ length: 52 }, (__, col) => {
                const idx = col * 7 + row;
                const day = graphDays[idx];
                if (!day) return null;
                return (
                  <div
                    key={`${col}-${row}`}
                    className="aspect-square rounded-sm min-w-[10px] cursor-pointer transition-shadow hover:ring-1 hover:ring-inset hover:ring-(--foreground)"
                    style={{ backgroundColor: levelColor[day.level] }}
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        text: contributionLabel(day),
                        x: r.left + r.width / 2,
                        y: r.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
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
          {tooltip
            ? createPortal(
                <div
                  role="tooltip"
                  className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full rounded-md border border-(--border) bg-(--surface) px-2.5 py-1.5 text-xs font-medium text-(--foreground) shadow-lg whitespace-nowrap"
                  style={{ left: tooltip.x, top: tooltip.y - 8 }}
                >
                  {tooltip.text}
                </div>,
                document.body,
              )
            : null}
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
                <SiIcon slug={tool.icon} className="h-3 w-3" />
              )}
              {tool.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
