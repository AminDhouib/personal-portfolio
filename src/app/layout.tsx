import type { Metadata, Viewport } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Extensionless on purpose: the file-convention route (src/app/opengraph-image.tsx)
// serves /opengraph-image; the .png-suffixed path 404s.
const ogImage = "https://amindhou.com/opengraph-image";

// Name first, then the role and company people search for alongside it; the
// description states the entity facts in one declarative sentence.
const TITLE = "Amin Dhouib — Full-Stack Engineer & Founder of Devino Solutions";
const DESCRIPTION =
  "Amin Dhouib is an Ottawa full-stack engineer and the CEO & CTO of Devino Solutions. He builds apps like Shorty, uNotes and Caramel, then self-hosts them.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s — Amin Dhouib",
  },
  description: DESCRIPTION,
  metadataBase: new URL("https://amindhou.com"),
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  keywords: [
    "Amin Dhouib",
    "Full Stack Developer",
    "Software Engineer",
    "Devino Solutions",
    "Ottawa Developer",
    "Next.js",
    "TypeScript",
    "Python",
    "React",
    "AI Automation",
  ],
  authors: [{ name: "Amin Dhouib", url: "https://amindhou.com" }],
  creator: "Amin Dhouib",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://amindhou.com",
    siteName: "Amin Dhouib",
    locale: "en_US",
    type: "website",
    images: [
      { url: ogImage, width: 1200, height: 630, alt: "Amin Dhouib — Engineer, Founder, Builder" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
  ],
};

import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { ChatWidget } from "@/components/chat/widget";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { ConversionTracker } from "@/components/analytics/conversion-tracker";
import {
  companyNode,
  graph,
  personNode,
  serializeJsonLd,
  websiteNode,
} from "@/lib/structured-data";

// Site-wide entity graph. Page-level blocks (ProfilePage, FAQPage and the
// project list on the homepage, BlogPosting, breadcrumbs) reference the
// Person by @id.
const jsonLd = graph(personNode(), companyNode(), websiteNode());

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
        <GoogleAnalytics />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* Skip-to-content link — visible only on keyboard focus, lets keyboard
              users bypass the navbar and jump straight to the page's main content. */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:rounded-lg focus:bg-accent-green focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
          >
            Skip to main content
          </a>
          <Navbar />
          <div id="main-content" tabIndex={-1} className="contents">
            {children}
          </div>
          <SiteFooter />
          <ChatWidget enabled />
          <ConversionTracker />
        </Providers>
      </body>
    </html>
  );
}
