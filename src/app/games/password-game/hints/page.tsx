import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { breadcrumbNode, faqPageNode, graph, serializeJsonLd } from "@/lib/structured-data";
import {
  EVENT_HINTS,
  PG2_HINTS_DESCRIPTION,
  PG2_HINTS_FAQ,
  PG2_HINTS_INTRO,
  PG2_HINTS_PATH,
  PG2_HINTS_TITLE,
  PG2_PATH,
  RULE_HINTS,
} from "./hints-content";

const SITE_ORIGIN = "https://amindhou.com";
const CANONICAL = `${SITE_ORIGIN}${PG2_HINTS_PATH}`;
const SOCIAL_TITLE = "Password Game 2 Hints, a free guide by Amin Dhouib";
const ORIGINAL_URL = "https://neal.fun/password-game/";

// No images key at all: Next applies the segment's opengraph-image.tsx only
// while openGraph and twitter leave the key unset, and Twitter then inherits
// the Open Graph image.
export const metadata: Metadata = {
  title: PG2_HINTS_TITLE,
  description: PG2_HINTS_DESCRIPTION,
  alternates: {
    canonical: CANONICAL,
  },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: SOCIAL_TITLE,
    description: PG2_HINTS_DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: PG2_HINTS_DESCRIPTION,
  },
};

const jsonLd = graph(
  faqPageNode(PG2_HINTS_FAQ, `${CANONICAL}#faq`),
  breadcrumbNode([
    { name: "Home", path: "/" },
    { name: "Games", path: "/games" },
    { name: "Password Game 2", path: PG2_PATH },
    { name: "Hints", path: PG2_HINTS_PATH },
  ]),
);

const H2 = "mt-12 font-display text-2xl font-black tracking-tight";
const BODY = "text-(--foreground)/85";
const DETAILS = "rounded-lg border border-(--border) px-4 py-3";
const SUMMARY = "cursor-pointer font-semibold marker:text-(--muted)";

export default function PasswordGameHintsPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href={PG2_PATH}
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the game
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight">
          Password Game 2: Rules and Hints
        </h1>
        <p className={`mt-4 max-w-2xl leading-relaxed ${BODY}`}>{PG2_HINTS_INTRO}</p>

        <div className="max-w-3xl leading-relaxed">
          <section>
            <h2 className={H2}>The rules</h2>
            <div className="mt-4 space-y-3">
              {Object.entries(RULE_HINTS).map(([id, rule], i) => (
                <details key={id} data-rule={id} className={DETAILS}>
                  <summary className={SUMMARY}>
                    Rule {i + 1}: {rule.title}
                  </summary>
                  <ol className={`mt-3 list-decimal space-y-2 pl-5 ${BODY}`}>
                    {rule.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </section>

          <section>
            <h2 className={H2}>The events</h2>
            <p className={`mt-4 ${BODY}`}>
              Events arrive on a schedule and are not part of the numbered rules. Some add a rule of
              their own while they last.
            </p>
            <div className="mt-4 space-y-3">
              {Object.entries(EVENT_HINTS).map(([id, event]) => (
                <details key={id} data-event={id} className={DETAILS}>
                  <summary className={SUMMARY}>{event.title}</summary>
                  <p className={`mt-3 ${BODY}`}>{event.tip}</p>
                </details>
              ))}
            </div>
          </section>

          <section id="faq" aria-labelledby="hints-faq">
            <h2 id="hints-faq" className={H2}>
              Questions
            </h2>
            <div className="mt-4 space-y-5">
              {PG2_HINTS_FAQ.map((entry) => (
                <div key={entry.question}>
                  <h3 className="font-semibold">{entry.question}</h3>
                  <p className={`mt-1 ${BODY}`}>{entry.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <p className="mt-12">
            <Link
              href={PG2_PATH}
              className="font-semibold underline underline-offset-2 hover:text-(--foreground)"
            >
              Play The Password Game 2
            </Link>
          </p>
          <p className="mt-6 text-sm text-(--muted)">
            An independent tribute to{" "}
            <a
              href={ORIGINAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-(--foreground)"
            >
              The Password Game by Neal Agarwal
            </a>
            , not affiliated with neal.fun.
          </p>
        </div>
      </div>
    </div>
  );
}
