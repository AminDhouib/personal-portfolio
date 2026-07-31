import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Globe, AppWindow } from "lucide-react";
import type { Metadata } from "next";
import { SiIcon } from "@/components/ui/tech-icon";
import { projects } from "@/data/projects";
import { fetchMAU } from "@/lib/ga4";

// ISR: revalidate every 24h so live MAU stays fresh
export const revalidate = 86400;

const SITE_ORIGIN = "https://amindhou.com";

// Map common tech names to Simple Icons slugs (lowercase)
const TECH_ICON_MAP: Record<string, string> = {
  "next.js": "nextdotjs",
  nextjs: "nextdotjs",
  react: "react",
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  docker: "docker",
  prisma: "prisma",
  django: "django",
  fastapi: "fastapi",
  "tailwind css": "tailwindcss",
  tailwindcss: "tailwindcss",
  figma: "figma",
  selenium: "selenium",
  terraform: "terraform",
  postgresql: "postgresql",
  mongodb: "mongodb",
  redis: "redis",
  firebase: "firebase",
  ios: "apple",
  macos: "apple",
  swift: "swift",
  "node.js": "nodedotjs",
  nodejs: "nodedotjs",
  rust: "rust",
  "google drive": "googledrive",
  npm: "npm",
  github: "github",
};

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return {};
  return {
    title: project.name,
    description: project.description,
    alternates: {
      canonical: `${SITE_ORIGIN}/work/${slug}`,
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    // Per-project card: without this every /work/* page shared the root
    // layout's site-wide openGraph title. The og:image still comes from the
    // co-located opengraph-image.tsx, same as the blog post pages.
    openGraph: {
      type: "website",
      url: `${SITE_ORIGIN}/work/${slug}`,
      title: `${project.name} — work by Amin Dhouib`,
      description: project.description,
      siteName: "Amin Dhouib",
      locale: "en_US",
    },
  };
}

function PlatformIcon({ icon }: { icon: string }) {
  if (icon === "globe") return <Globe className="h-4 w-4" />;
  if (icon === "microsoft") return <AppWindow className="h-4 w-4" />;
  return <SiIcon slug={icon.toLowerCase()} className="h-4 w-4" />;
}

export default async function WorkDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) notFound();

  // Fetch live MAU from GA4 (falls back to null if not configured)
  const liveMAU = await fetchMAU(slug);
  const displayMAU = liveMAU ?? project.mauFallback;
  const isLive = liveMAU !== null;

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/#work"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Work
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-start gap-6">
          <div className="flex shrink-0 items-center" style={{ minHeight: 56 }}>
            <Image
              src={project.logo}
              alt={`${project.name} logo`}
              width={project.logoWidth}
              height={project.logoHeight}
              className="logo-tinted"
              style={{ width: 96, height: "auto" }}
            />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-4xl font-black tracking-tight">{project.name}</h1>
              {project.isOSS && (
                <span className="rounded-full border border-accent-green/20 bg-accent-green/10 px-3 py-1 text-xs font-bold text-accent-green uppercase">
                  Open Source
                </span>
              )}
            </div>
            <p className="mt-2 text-lg text-(--muted)">{project.tagline}</p>
          </div>
        </div>

        {/* Hero: video > image > geometric fallback */}
        <div className="mb-8 overflow-hidden rounded-xl border border-(--border) bg-gradient-to-br from-(--card) to-(--surface)">
          {project.heroVideo ? (
            <video
              src={project.heroVideo}
              poster={project.heroVideoPoster}
              autoPlay
              muted
              loop
              playsInline
              className="h-auto w-full"
            />
          ) : project.heroImage ? (
            <Image
              src={project.heroImage}
              alt={`${project.name} screenshot`}
              width={1200}
              height={630}
              className="h-auto w-full"
              priority
            />
          ) : (
            <div className="relative flex h-52 items-center justify-center">
              <div className="absolute inset-0 overflow-hidden opacity-5">
                <div className="absolute -top-8 -right-8 h-48 w-48 rounded-full border-2 border-accent-green" />
                <div className="absolute -bottom-4 -left-4 h-32 w-32 rotate-45 border-2 border-accent-blue" />
              </div>
              <div className="z-10 text-center">
                <div className="mb-2 font-display text-5xl font-black tracking-tighter text-(--foreground) opacity-10">
                  {project.name.toUpperCase()}
                </div>
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent-blue hover:underline"
                >
                  {project.url.replace("https://", "")}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Live MAU */}
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-(--border) bg-(--card) p-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green" />
          </span>
          <span className="text-base font-semibold">
            {displayMAU >= 1000 ? `${(displayMAU / 1000).toFixed(1)}K` : displayMAU} monthly active
            users
          </span>
          {project.mauGrowth && (
            <span className="text-sm font-medium text-accent-green">{project.mauGrowth}</span>
          )}
          {isLive && (
            <span className="ml-auto text-xs font-medium text-accent-green/60">
              live · last 30 days
            </span>
          )}
        </div>

        {/* Description */}
        <p className="mb-8 text-base leading-relaxed text-(--foreground)">{project.description}</p>

        {/* Story */}
        {project.story && project.story.length > 0 && (
          <div className="mb-8 space-y-4">
            <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
              The Story
            </h2>
            {project.story.map((paragraph, i) => (
              <p key={i} className="text-base leading-relaxed text-(--foreground)">
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {/* Figma prototype embed */}
        {project.figmaEmbed && (
          <div className="mb-8">
            <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
              Interactive Prototype
            </h2>
            <div
              className="overflow-hidden rounded-xl border border-(--border) bg-(--card)"
              style={{ aspectRatio: "16/9" }}
            >
              <iframe
                src={project.figmaEmbed}
                className="h-full w-full"
                allowFullScreen
                title={`${project.name} Figma prototype`}
              />
            </div>
          </div>
        )}

        {/* Tech stack */}
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
            Tech Stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => {
              const iconSlug = TECH_ICON_MAP[tech.toLowerCase()];
              return (
                <span
                  key={tech}
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1 text-sm"
                >
                  {iconSlug && <SiIcon slug={iconSlug} className="h-3.5 w-3.5" />}
                  {tech}
                </span>
              );
            })}
          </div>
        </div>

        {/* Platforms */}
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
            Available On
          </h2>
          <div className="flex flex-wrap gap-4">
            {project.platforms.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-(--border) bg-(--card) px-4 py-2 text-sm transition-colors hover:border-(--muted)/30"
              >
                <PlatformIcon icon={platform.icon} />
                {platform.name}
              </a>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-4">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-5 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
          >
            Visit {project.name}
          </a>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-5 py-2.5 text-sm font-medium transition-colors hover:border-(--muted)/30"
            >
              View on GitHub
            </a>
          )}
          {project.contraUrl && (
            <a
              href={project.contraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-5 py-2.5 text-sm font-medium transition-colors hover:border-(--muted)/30"
            >
              Case Study on Contra
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
