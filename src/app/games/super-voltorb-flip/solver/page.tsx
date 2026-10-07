import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  breadcrumbNode,
  faqPageNode,
  graph,
  serializeJsonLd,
  webApplicationNode,
} from "@/lib/structured-data";
import { SolverClient } from "./solver-client";
import {
  GAME_PATH,
  SOLVER_DESCRIPTION,
  SOLVER_DISCLAIMER,
  SOLVER_FAQ,
  SOLVER_INTRO,
  SOLVER_PATH,
  SOLVER_SECTIONS,
  SOLVER_TITLE,
} from "./solver-content";

const SITE_ORIGIN = "https://amindhou.com";
const CANONICAL = `${SITE_ORIGIN}${SOLVER_PATH}`;
const SOCIAL_TITLE = "Voltorb Flip Solver, a free tool by Amin Dhouib";

// No images key at all: Next applies the segment's opengraph-image.tsx only
// while openGraph and twitter leave the key unset, and Twitter then inherits
// the Open Graph image.
export const metadata: Metadata = {
  title: SOLVER_TITLE,
  description: SOLVER_DESCRIPTION,
  alternates: {
    canonical: CANONICAL,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: SOCIAL_TITLE,
    description: SOLVER_DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SOLVER_DESCRIPTION,
  },
};

const H2 = "mt-12 font-display text-2xl font-black tracking-tight";
const BODY = "text-(--foreground)/85";

export default function VoltorbSolverPage() {
  const jsonLd = graph(
    webApplicationNode({
      name: "Voltorb Flip Solver",
      description: SOLVER_DESCRIPTION,
      path: SOLVER_PATH,
    }),
    faqPageNode(SOLVER_FAQ, `${CANONICAL}#faq`),
    breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Games", path: "/games" },
      { name: "Super Voltorb Flip", path: GAME_PATH },
      { name: "Solver", path: SOLVER_PATH },
    ]),
  );

  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href={GAME_PATH}
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Super Voltorb Flip
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight">Voltorb Flip Solver</h1>
        <p className={`mt-4 max-w-2xl leading-relaxed ${BODY}`}>{SOLVER_INTRO}</p>

        <div className="mt-8">
          <SolverClient />
        </div>

        <div className="max-w-3xl leading-relaxed">
          {SOLVER_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className={H2}>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className={`mt-4 ${BODY}`}>
                  {paragraph}
                </p>
              ))}
              {section.list ? (
                <ul className={`mt-4 list-disc space-y-1.5 pl-5 ${BODY}`}>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <section id="faq" aria-labelledby="solver-faq">
            <h2 id="solver-faq" className={H2}>
              Questions
            </h2>
            <div className="mt-4 space-y-5">
              {SOLVER_FAQ.map((entry) => (
                <div key={entry.question}>
                  <h3 className="font-semibold">{entry.question}</h3>
                  <p className={`mt-1 ${BODY}`}>{entry.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-12">
            <Link
              href={GAME_PATH}
              className="font-semibold underline underline-offset-2 hover:text-(--foreground)"
            >
              Play Super Voltorb Flip
            </Link>
          </p>
          <p className="mt-6 text-sm text-(--muted)">{SOLVER_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
