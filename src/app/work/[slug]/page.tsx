import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { projects } from "@/data/projects";

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${icon.toLowerCase()}`}
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

        {/* Live MAU */}
        <div className="flex items-center gap-2 mb-8 p-4 rounded-lg bg-(--card) border border-(--border)">
          <span className="relative flex h-2.5 w-2.5">
            <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green" />
          </span>
          <span className="text-base font-semibold">
            {project.mauFallback >= 1000
              ? `${(project.mauFallback / 1000).toFixed(1)}K`
              : project.mauFallback}{" "}
            monthly active users
          </span>
          {project.mauGrowth && (
            <span className="text-sm text-accent-green font-medium">
              {project.mauGrowth}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-base text-(--foreground) leading-relaxed mb-8">
          {project.description}
        </p>

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
        </div>
      </div>
    </div>
  );
}
