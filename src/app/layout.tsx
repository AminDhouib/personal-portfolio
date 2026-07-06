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

const ogImage = "https://amindhou.com/opengraph-image.png";

export const metadata: Metadata = {
  title: {
    default: "Amin Dhouib — Engineer, Founder, Builder",
    template: "%s — Amin Dhouib",
  },
  description:
    "Personal portfolio of Amin Dhouib — CEO & CTO of Devino Solutions. I build apps people actually use, then self-host them on my home server.",
  metadataBase: new URL("https://amindhou.com"),
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
    title: "Amin Dhouib — Engineer, Founder, Builder",
    description: "I build apps people actually use, then self-host them on my home server.",
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
    title: "Amin Dhouib — Engineer, Founder, Builder",
    description: "I build apps people actually use, then self-host them on my home server.",
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

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": "https://amindhou.com/#person",
      name: "Amin Dhouib",
      url: "https://amindhou.com",
      jobTitle: "CEO & CTO",
      worksFor: {
        "@type": "Organization",
        name: "Devino Solutions",
        url: "https://devino.ca",
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Ottawa",
        addressCountry: "CA",
      },
      sameAs: [
        "https://github.com/AminDhouib",
        "https://linkedin.com/in/amin-dhouib",
        "https://youtube.com/@amin_dhou",
        "https://contra.com/amin",
      ],
      image: "https://amindhou.com/amin.jpg",
    },
    {
      "@type": "WebSite",
      "@id": "https://amindhou.com/#website",
      url: "https://amindhou.com",
      name: "Amin Dhouib",
      publisher: { "@id": "https://amindhou.com/#person" },
    },
    {
      "@type": "ItemList",
      "@id": "https://amindhou.com/#projects",
      name: "Projects by Amin Dhouib",
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://amindhou.com/work/shorty" },
        { "@type": "ListItem", position: 2, url: "https://amindhou.com/work/unotes" },
        { "@type": "ListItem", position: 3, url: "https://amindhou.com/work/caramel" },
        { "@type": "ListItem", position: 4, url: "https://amindhou.com/work/upup" },
        { "@type": "ListItem", position: 5, url: "https://amindhou.com/work/getitdone" },
      ],
    },
  ],
};

import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { ChatWidget } from "@/components/chat/widget";

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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
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
        </Providers>
      </body>
    </html>
  );
}
