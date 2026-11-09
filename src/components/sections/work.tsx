"use client";

import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/ui/reveal";
import { Globe, AppWindow } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SiIcon } from "@/components/ui/tech-icon";
import { projects, type Project } from "@/data/projects";

function PlatformIcon({ icon }: { icon: string }) {
  if (icon === "globe") return <Globe className="h-4 w-4" />;
  if (icon === "microsoft") return <AppWindow className="h-4 w-4" />;
  return <SiIcon slug={icon} className="h-4 w-4" />;
}

function formatMAU(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const products = projects.filter((p) => !p.clientName);
const clientWork = projects.filter((p) => p.clientName);

function ProjectGrid({
  items,
  mauData,
}: {
  items: readonly Project[];
  mauData?: Record<string, number | null>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {items.map((project, i) => {
        // A lone last card spans the row instead of leaving a hole.
        const spansRow = items.length % 2 === 1 && i === items.length - 1;
        const liveMAU = mauData?.[project.slug] ?? null;
        const displayMAU = liveMAU ?? project.mauFallback ?? null;
        return (
          <Reveal
            key={project.slug}
            y={20}
            margin={-50}
            delay={(i % 4) * 0.1}
            className={`group relative overflow-hidden rounded-xl border border-(--border) bg-(--card) transition-colors hover:border-(--muted)/30 ${
              spansRow ? "md:col-span-2" : ""
            }`}
          >
            <Link href={`/work/${project.slug}`} className="block">
              {/* Thumbnail */}
              {project.heroImage ? (
                <div className="relative h-52 w-full overflow-hidden bg-(--surface)">
                  <Image
                    src={project.heroImage}
                    alt={`${project.name} screenshot`}
                    fill
                    className="object-cover object-top transition-transform duration-500 motion-safe:group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority={i === 0}
                  />
                  <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-(--card)" />
                </div>
              ) : (
                <div className="flex h-28 items-center justify-center bg-linear-to-br from-(--surface) to-(--card) opacity-30">
                  <span className="font-display text-3xl font-black tracking-tighter">
                    {project.name.toUpperCase()}
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Header: Logo + Name + OSS badge */}
                <div className="mb-4 flex items-start gap-4">
                  <div className="flex shrink-0 items-center" style={{ minHeight: 36 }}>
                    <Image
                      src={project.logo}
                      alt={`${project.name} logo`}
                      width={project.logoWidth}
                      height={project.logoHeight}
                      className={project.logoIsIcon ? "rounded-lg" : "logo-tinted"}
                      style={{ width: project.logoIsIcon ? 40 : 56, height: "auto" }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg font-bold tracking-tight">
                        {project.name.toUpperCase()}
                      </h3>
                      {project.isOSS && (
                        <span className="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-[10px] font-bold text-accent-green uppercase">
                          OSS
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-(--muted)">{project.tagline}</p>
                  </div>
                </div>

                {/* Live MAU, or the client for client work */}
                {project.clientName ? (
                  <p className="mb-4 text-sm font-medium text-accent-blue">
                    Client work for {project.clientName}
                  </p>
                ) : displayMAU !== null ? (
                  <div className="mb-4 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green" />
                    </span>
                    <span className="text-sm font-medium">{formatMAU(displayMAU)} MAU</span>
                    {liveMAU ? (
                      <span className="text-xs font-medium text-accent-green/80">live</span>
                    ) : null}
                    {!liveMAU && project.mauGrowth && (
                      <span className="text-xs font-medium text-accent-green">
                        {project.mauGrowth}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Platform badges */}
                <div className="flex flex-wrap gap-3">
                  {project.platforms.map((platform) => (
                    <span
                      key={platform.name}
                      className="inline-flex items-center gap-1.5 text-xs text-(--muted) transition-colors hover:text-(--foreground)"
                      title={platform.name}
                    >
                      <PlatformIcon icon={platform.icon} />
                      <span className="hidden sm:inline">{platform.name}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* /p-6 */}
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}

export function Work({ mauData }: { mauData?: Record<string, number | null> }) {
  return (
    <section id="work" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="03" title="Work" color="var(--color-accent-blue)" />

        <ProjectGrid items={products} mauData={mauData} />

        <p className="mt-8 text-center text-xs text-(--muted)">
          All MAU numbers updated dynamically — last 30 days
        </p>

        <h3 className="mt-16 mb-6 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
          Client work through Devino
        </h3>
        <ProjectGrid items={clientWork} />
      </div>
    </section>
  );
}
