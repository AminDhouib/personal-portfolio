import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { SITE_ORIGIN, profile } from "@/data/profile";

// A factual page: every sentence describes what the code does today. When the analytics,
// monitoring, chat or leads code changes, change the matching section in the same commit
// (the inventory lives in DESIGN.md's "Lead identification" register entry).

const DESCRIPTION =
  "What amindhou.com collects, where it goes, and how to ask about it: analytics, session recordings, the AI chat, contact details and the games.";

export const metadata = {
  title: "Privacy",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/privacy`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/privacy`,
    title: "Privacy | Amin Dhouib",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Privacy" }],
  },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-2xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-3 text-(--muted)">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <div className="mb-10">
          <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Privacy</h1>
          <p className="text-(--muted)">
            This page lists what amindhou.com collects and where it goes. The site is run by Amin
            Dhouib and hosted on his own servers. Last updated October 15, 2026.
          </p>
        </div>

        <Section title="Analytics">
          <p>
            The site counts visits with PostHog, which we host ourselves at posthog.devino.ca. It
            records page views, when you leave a page, clicks on the page, and a few named events:
            clicking Book a Call, an email link or a social link, opening the AI chat, and sending
            your contact details through the chat. PostHog keeps an identifier in your
            browser&apos;s storage so it can tell repeat visits apart.
          </p>
          <p>
            While you browse, the site also notes how your visit started, for the length of that
            browser session: the campaign tags in the link you followed, the site you came from and
            the first page you opened. This stays in your browser, and it is sent along only if you
            give your contact details through the chat (see Your contact details).
          </p>
        </Section>

        <Section title="Session recordings and error monitoring">
          <p>
            PostHog records a share of visits (about 1 in 10) as a replay of the page, so we can see
            how the site is used. Sentry, also hosted by us, records 5% of visits the same way, plus
            any visit where an error happens. Sentry starts recording after your first interaction
            with the page.
          </p>
          <p>
            Both tools mask everything typed into input fields. Text already on the page is not
            hidden, so text the page shows you, including chat messages, can appear in a recording.
          </p>
          <p>
            Sentry also receives error reports: the error, the page address, and basic browser and
            device details. Its traffic goes through this site&apos;s own /monitoring address rather
            than straight from your browser.
          </p>
        </Section>

        <Section title="Google Analytics">
          <p>
            The site can load Google Analytics 4 (Google&apos;s gtag.js script). When it is switched
            on, it sends page views and the same named events to Google. Google Analytics never
            receives your name or email from this site.
          </p>
        </Section>

        <Section title="The AI chat">
          <p>
            Messages you send to the Amin AI chat go through this site&apos;s server to an AI model
            provider (OpenRouter, which passes them to an Anthropic Claude model) so it can write a
            reply. The site does not keep the conversation in its own database. The provider&apos;s
            own terms apply to what it receives, so please leave out anything you would not want an
            AI provider to see.
          </p>
        </Section>

        <Section title="Your contact details">
          <p>
            The chat can ask for your name and email when you want to get in touch. If you give
            them, the site saves your name, email, an optional note, which chat you used, the page
            you were on and the time, and emails the same details to Amin so he can reply.
          </p>
          <p>
            When you give your name and email through the chat to be contacted, they are saved so
            Amin can reply, and they are linked to your visit in our own (self-hosted) analytics,
            including how you arrived: campaign source, medium, referrer and landing page. Your
            email identifies you in PostHog. The note you write is not sent to analytics. Google
            Analytics never receives your name or email.
          </p>
        </Section>

        <Section title="Games and leaderboards">
          <p>
            The games keep saves, settings and best scores in your browser&apos;s local storage, on
            your device. The site also remembers your theme choice there. None of this is sent to
            the server unless you post a score.
          </p>
          <p>
            Posting a score sends the name you type, the score and the details of the run. The
            arcade games also create a random player ID and secret token in your browser; the server
            stores that ID, a hash of the token, your name, your scores and when you set them, so
            your scores stay yours. The Password Game boards store the name you enter with the time.
            An older set of leaderboards is kept as a read-only archive.
          </p>
          <p>
            To limit abuse, the server counts requests per IP address in memory. That count is not
            written to the database and resets when the server restarts.
          </p>
        </Section>

        <Section title="Questions and deletion">
          <p>
            To ask what is held about you, or to have your contact details removed, email{" "}
            <a
              href={`mailto:${profile.email}`}
              className="text-(--foreground) underline underline-offset-2"
            >
              {profile.email}
            </a>
            . Links from this site to other sites, such as the booking page and social profiles, are
            covered by those sites&apos; own policies.
          </p>
        </Section>
      </div>
    </div>
  );
}
