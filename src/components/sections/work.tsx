"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Globe, AppWindow } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { projects } from "@/data/projects";

function PlatformIcon({ icon }: { icon: string }) {
  if (icon === "globe") return <Globe className="h-4 w-4" />;
  if (icon === "microsoft") return <AppWindow className="h-4 w-4" />;
  const siSlug = icon.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${siSlug}/888888`}
      alt={icon}
      className="h-4 w-4"
      loading="lazy"
    />
  );
}

function formatMAU(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function Work({ mauData }: { mauData?: Record<string, number | null> }) {
  return (
    <section id="work" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="03" title="Work" color="var(--color-accent-blue)" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project, i) => {
            const liveMAU = mauData?.[project.slug] ?? null;
            const displayMAU = liveMAU ?? project.mauFallback;
            return (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`group relative rounded-xl border border-(--border) bg-(--card) overflow-hidden transition-all hover:border-(--muted)/30 ${
                project.slug === "getitdone" ? "md:col-span-2" : ""
              }`}
            >
              <Link href={`/work/${project.slug}`} className="block">
                {/* Thumbnail */}
                {project.heroImage ? (
                  <div className="relative w-full h-40 overflow-hidden bg-(--surface)">
                    <Image
                      src={project.heroImage}
                      alt={`${project.name} screenshot`}
                      fill
                      className="object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-(--card)" />
                  </div>
                ) : (
                  <div className="h-28 bg-gradient-to-br from-(--surface) to-(--card) flex items-center justify-center opacity-30">
                    <span className="font-display text-3xl font-black tracking-tighter">
                      {project.name.toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="p-6">
                {/* Header: Logo + Name + OSS badge */}
                <div className="flex items-start gap-4 mb-4">
                  <Image
                    src={project.logo}
                    alt={`${project.name} logo`}
                    width={48}
                    height={48}
                    className="rounded-lg"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold tracking-tight">
                        {project.name.toUpperCase()}
                      </h3>
                      {project.isOSS && (
                        <span className="rounded-full bg-accent-green/10 border border-accent-green/20 px-2 py-0.5 text-[10px] font-bold text-accent-green uppercase">
                          OSS
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-(--muted) mt-1">
                      {project.tagline}
                    </p>
                  </div>
                </div>

                {/* Live MAU */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="relative flex h-2 w-2">
                    <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green" />
                  </span>
                  <span className="text-sm font-medium">
                    {formatMAU(displayMAU)} MAU
                  </span>
                  {liveMAU ? (
                    <span className="text-xs text-accent-green/60 font-medium">live</span>
                  ) : null}
                  {!liveMAU && project.mauGrowth && (
                    <span className="text-xs text-accent-green font-medium">
                      {project.mauGrowth}
                    </span>
                  )}
                </div>

                {/* Platform badges */}
                <div className="flex flex-wrap gap-3">
                  {project.platforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
                      title={platform.name}
                    >
                      <PlatformIcon icon={platform.icon} />
                      <span className="hidden sm:inline">{platform.name}</span>
                    </span>
                  ))}
                </div>
                </div>{/* /p-6 */}
              </Link>
            </motion.div>
            );
          })}
        </div>

        <p className="text-xs text-(--muted)/60 text-center mt-8">
          All MAU numbers updated dynamically — last 30 days
        </p>
      </div>
    </section>
  );
}
