"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { projects } from "@/data/projects";

function PlatformIcon({ icon }: { icon: string }) {
  // For "globe" use Lucide icon, for others render Simple Icons SVG
  if (icon === "globe") {
    return <Globe className="h-4 w-4" />;
  }
  // Use Simple Icons — external CDN, can't use next/image
  const siSlug = icon.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${siSlug}`}
      alt={icon}
      className="h-4 w-4"
      loading="lazy"
    />
  );
}

export function Work() {
  return (
    <section id="work" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="03" title="Work" color="var(--color-accent-blue)" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((project, i) => (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`group relative rounded-xl border border-(--border) bg-(--card) p-6 transition-all hover:border-(--muted)/30 ${
                project.slug === "getitdone" ? "md:col-span-2" : ""
              }`}
            >
              <Link href={`/work/${project.slug}`} className="block">
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
                    {project.mauFallback >= 1000
                      ? `${(project.mauFallback / 1000).toFixed(1)}K`
                      : project.mauFallback}{" "}
                    MAU
                  </span>
                  {project.mauGrowth && (
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
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="text-xs text-(--muted)/60 text-center mt-8">
          All MAU numbers updated dynamically — last 30 days
        </p>
      </div>
    </section>
  );
}
