import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Globe, AppWindow } from "lucide-react";
import { projects } from "@/data/projects";
import { fetchMAU } from "@/lib/ga4";

// ISR: revalidate every 24h so live MAU stays fresh
export const revalidate = 86400;

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return {};
  return {
    title: `${project.name} — Amin Dhouib`,
    description: project.description,
  };
}

function PlatformIcon({ icon }: { icon: string }) {
  if (icon === "globe") return <Globe className="h-4 w-4" />;
  if (icon === "microsoft") return <AppWindow className="h-4 w-4" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${icon.toLowerCase()}/888888`}
      alt={icon}
      className="h-4 w-4"
      loading="lazy"
    />
  );
}

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Work
        </Link>

        {/* Header */}
        <div className="flex items-start gap-6 mb-8">
          <Image
            src={project.logo}
            alt={`${project.name} logo`}
            width={80}
            height={80}
            className="rounded-xl"
          />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-4xl font-black tracking-tight">
                {project.name}
              </h1>
              {project.isOSS && (
                <span className="rounded-full bg-accent-green/10 border border-accent-green/20 px-3 py-1 text-xs font-bold text-accent-green uppercase">
                  Open Source
                </span>
              )}
            </div>
            <p className="text-lg text-(--muted) mt-2">{project.tagline}</p>
          </div>
        </div>

        {/* Hero: video > image > geometric fallback */}
        <div className="mb-8 rounded-xl border border-(--border) bg-gradient-to-br from-(--card) to-(--surface) overflow-hidden">
          {project.heroVideo ? (
            <video
              src={project.heroVideo}
              poster={project.heroVideoPoster}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-auto"
            />
          ) : project.heroImage ? (
            <Image
              src={project.heroImage}
              alt={`${project.name} screenshot`}
              width={1200}
              height={630}
              className="w-full h-auto"
              priority
            />
          ) : (
            <div className="h-52 flex items-center justify-center relative">
              <div className="absolute inset-0 overflow-hidden opacity-5">
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full border-2 border-accent-green" />
                <div className="absolute -bottom-4 -left-4 w-32 h-32 rotate-45 border-2 border-accent-blue" />
              </div>
              <div className="text-center z-10">
                <div className="text-5xl font-black text-(--foreground) font-display tracking-tighter mb-2 opacity-10">
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
        <div className="flex items-center gap-2 mb-8 p-4 rounded-lg bg-(--card) border border-(--border)">
          <span className="relative flex h-2.5 w-2.5">
            <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green" />
          </span>
          <span className="text-base font-semibold">
            {displayMAU >= 1000
              ? `${(displayMAU / 1000).toFixed(1)}K`
              : displayMAU}{" "}
            monthly active users
          </span>
          {project.mauGrowth && (
            <span className="text-sm text-accent-green font-medium">
              {project.mauGrowth}
            </span>
          )}
          {isLive && (
            <span className="ml-auto text-xs text-accent-green/60 font-medium">
              live · last 30 days
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-base text-(--foreground) leading-relaxed mb-8">
          {project.description}
        </p>

        {/* Story */}
        {project.story && project.story.length > 0 && (
          <div className="mb-8 space-y-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-(--muted) mb-3">
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
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-(--muted) mb-3">
              Interactive Prototype
            </h2>
            <div className="rounded-xl border border-(--border) overflow-hidden bg-(--card)" style={{ aspectRatio: "16/9" }}>
              <iframe
                src={project.figmaEmbed}
                className="w-full h-full"
                allowFullScreen
                title={`${project.name} Figma prototype`}
              />
            </div>
          </div>
        )}

        {/* Tech stack */}
        <div className="mb-8">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-(--muted) mb-3">
            Tech Stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {project.techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-full bg-(--surface) border border-(--border) px-3 py-1 text-sm"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Platforms */}
        <div className="mb-8">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-(--muted) mb-3">
            Available On
          </h2>
          <div className="flex flex-wrap gap-4">
            {project.platforms.map((platform) => (
              <a
                key={platform.name}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-(--card) border border-(--border) px-4 py-2 text-sm hover:border-(--muted)/30 transition-colors"
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
            className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-5 py-2.5 text-sm font-semibold text-black hover:brightness-110 transition-all"
          >
            Visit {project.name}
          </a>
          {project.githubUrl && (
            <a
              href={project.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-5 py-2.5 text-sm font-medium hover:border-(--muted)/30 transition-colors"
            >
              View on GitHub
            </a>
          )}
          {project.contraUrl && (
            <a
              href={project.contraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-5 py-2.5 text-sm font-medium hover:border-(--muted)/30 transition-colors"
            >
              Case Study on Contra
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
