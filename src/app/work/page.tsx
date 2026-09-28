import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { BookCallCta } from "@/components/ui/book-call-cta";
import { projects } from "@/data/projects";
import { SITE_ORIGIN } from "@/data/profile";
import { breadcrumbNode, graph, projectListNode, serializeJsonLd } from "@/lib/structured-data";

const DESCRIPTION =
  "Products Amin Dhouib has built and self-hosts: AI summarizers, a student notes platform, an open-source Honey alternative, a React file uploader and a team check-in tool.";

export const metadata: Metadata = {
  title: "Work",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/work`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/work`,
    title: "Work — products built by Amin Dhouib",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Work" }],
  },
};

const jsonLd = graph(
  {
    "@type": "CollectionPage",
    "@id": `${SITE_ORIGIN}/work#page`,
    url: `${SITE_ORIGIN}/work`,
    name: "Work by Amin Dhouib",
    description: DESCRIPTION,
    mainEntity: projectListNode(projects),
  },
  breadcrumbNode([
    { name: "Home", path: "/" },
    { name: "Work", path: "/work" },
  ]),
);

// The hub the /work/<slug> pages hang off. It used to 404, so the obvious
// parent URL of every project page was a dead end.
export default function WorkPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Work</h1>
        <p className="mb-10 text-(--muted)">
          Products I have designed, built and run in production, most of them self-hosted on my home
          server.
        </p>

        <ul className="border-t border-(--border)">
          {projects.map((project) => (
            <li key={project.slug} className="border-b border-(--border)">
              <Link href={`/work/${project.slug}`} className="group flex items-start gap-5 py-8">
                <div className="flex w-20 shrink-0 items-center pt-1">
                  <Image
                    src={project.logo}
                    alt=""
                    width={project.logoWidth}
                    height={project.logoHeight}
                    className="logo-tinted"
                    style={{ width: 80, height: "auto" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold tracking-tight transition-colors group-hover:text-accent-blue">
                      {project.name}
                    </h2>
                    {project.isOSS && (
                      <span className="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-[10px] font-bold text-accent-green uppercase">
                        Open Source
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-(--foreground)">{project.tagline}</p>
                  <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                    {project.description}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-(--muted) transition-all group-hover:translate-x-1 group-hover:text-accent-blue" />
              </Link>
            </li>
          ))}
        </ul>

        <BookCallCta
          title="Want something like this built?"
          body="I build web, mobile and AI products for clients through Devino Solutions. A 15-minute call is the quickest way to scope yours."
        />
      </div>
    </div>
  );
}
