import type { Metadata } from "next";
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
    description:
      "I build apps people actually use, then self-host them on my home server.",
    url: "https://amindhou.com",
    siteName: "Amin Dhouib",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Amin Dhouib — Engineer, Founder, Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Amin Dhouib — Engineer, Founder, Builder",
    description:
      "I build apps people actually use, then self-host them on my home server.",
    images: ["/og.png"],
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

import { Navbar } from "@/components/navbar";

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
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
