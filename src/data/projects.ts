export interface Project {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  story?: string[];
  heroImage?: string;
  heroVideo?: string;
  heroVideoPoster?: string;
  figmaEmbed?: string;
  logo: string;
  logoWidth: number;
  logoHeight: number;
  url: string;
  isOSS: boolean;
  githubUrl?: string;
  contraUrl?: string;
  /**
   * Set for client work Devino delivered (a named client, not a product Amin
   * runs). Client work has no analytics property, so it shows no MAU.
   */
  clientName?: string;
  /** The logo is a finished square app icon with its own background: render it untinted. */
  logoIsIcon?: boolean;
  /** Blog slug of the post that tells this project's story; the work page links to it. */
  relatedPost?: string;
  /** Static MAU used when GA4 has no reading. Omitted when the product has no known figure. */
  mauFallback?: number;
  mauGrowth?: string;
  gaPropertyDomain?: string;
  platforms: Platform[];
  techStack: string[];
}

export interface Platform {
  name: string;
  icon: string; // simple-icons slug
  url: string;
}

export const projects: readonly Project[] = Object.freeze([
  {
    slug: "shorty",
    name: "Shorty",
    tagline: "AI YouTube & Spotify Summarizer",
    description:
      "Turns videos, podcasts, and documents into quick, digestible takeaways. 50% month-over-month growth.",
    heroImage: "/screenshots/shorty.webp",
    heroVideo: "/videos/shorty-demo.mp4",
    heroVideoPoster: "/videos/shorty-poster.webp",
    logo: "/logos/shorty.png",
    logoWidth: 1687,
    logoHeight: 457,
    url: "https://aishorty.com",
    isOSS: false,
    contraUrl:
      "https://contra.com/p/QsA7PFlq-nextjs-figma-python-seleniumandtor-browser-ext-shorty",
    mauFallback: 55000,
    mauGrowth: "+50% MoM",
    gaPropertyDomain: "aishorty.com",
    platforms: [
      {
        name: "App Store",
        icon: "apple",
        url: "https://apps.apple.com/app/id6740627456",
      },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=ai.shortee.twa",
      },
      {
        name: "Chrome Web Store",
        icon: "googlechrome",
        url: "https://chromewebstore.google.com/detail/pndkkfhcfhhhebmmndaiohkbknenlchl",
      },
      {
        name: "Firefox Add-ons",
        icon: "firefox",
        url: "https://addons.mozilla.org/en-US/firefox/addon/shorty-ai-youtube-summarizer/",
      },
      {
        name: "Microsoft Store",
        icon: "microsoft",
        url: "https://apps.microsoft.com/detail/9nphlg2cfnwb",
      },
    ],
    techStack: ["Next.js", "Python", "Figma", "Selenium"],
    story: [
      "Shorty started as a personal frustration: I was spending hours watching YouTube videos and listening to podcasts just to extract a few key ideas. I built a Chrome extension that summarizes them in seconds.",
      "The technical challenge was getting clean transcripts from YouTube, Spotify, and arbitrary podcast feeds. I built Python microservices with Selenium + TOR rotation to scrape and process content without hitting rate limits.",
      "After launching on the Chrome Web Store, growth accelerated 50% month-over-month as creators started sharing it. The extension is now available on iOS, Android, Firefox, and the Microsoft Store.",
    ],
  },
  {
    slug: "unotes",
    name: "uNotes",
    tagline: "100K+ docs shared by students",
    description:
      "Community-driven note-sharing platform with 100,000+ user-uploaded university docs. Free alternative to Chegg, CourseHero, StuDocu.",
    heroImage: "/screenshots/unotes.webp",
    logo: "/logos/unotes.png",
    logoWidth: 727,
    logoHeight: 129,
    url: "https://unotes.net",
    isOSS: false,
    contraUrl: "https://contra.com/p/bve7Lces-nextjs-typescript-aws-u-notes",
    mauFallback: 65000,
    gaPropertyDomain: "unotes.net",
    platforms: [
      {
        name: "App Store",
        icon: "apple",
        url: "https://apps.apple.com/app/id6477337434",
      },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=net.unotes.twa",
      },
      {
        name: "Microsoft Store",
        icon: "microsoft",
        url: "https://apps.microsoft.com/detail/9nsmfdd0r238",
      },
      { name: "Web", icon: "globe", url: "https://unotes.net" },
    ],
    techStack: ["Next.js", "TypeScript", "AWS"],
    story: [
      "uNotes was born from a conversation with university students who were paying $30/month for CourseHero just to access past exams and lab reports. The content was created by students — it shouldn't be paywalled.",
      "I built a community platform where students can upload and download notes, exams, and assignments for free. The key insight was making it searchable by university, course code, and professor — not just generic file dumps.",
      "uNotes now has 100,000+ documents from universities across Canada and the US, and is available on the App Store, Google Play, Microsoft Store, and web.",
    ],
  },
  {
    slug: "caramel",
    name: "Caramel",
    tagline: "Open-source Honey alternative",
    description:
      "Browser extension that automatically applies the best coupon code at checkout, without selling data or hijacking creators' commissions.",
    heroImage: "/screenshots/caramel.webp",
    logo: "/logos/caramel.png",
    logoWidth: 1830,
    logoHeight: 467,
    url: "https://grabcaramel.com",
    isOSS: true,
    githubUrl: "https://github.com/DevinoSolutions/caramel",
    relatedPost: "caramel-open-source-story",
    contraUrl:
      "https://contra.com/p/v3Ek6YPZ-caramel-open-source-alternative-to-honey-coupon-finder",
    mauFallback: 3000,
    gaPropertyDomain: "grabcaramel.com",
    platforms: [
      {
        name: "App Store",
        icon: "apple",
        url: "https://apps.apple.com/app/id6741873881",
      },
      {
        name: "Chrome Web Store",
        icon: "googlechrome",
        url: "https://chromewebstore.google.com/detail/gaimofgglbackoimfjopicmbmnlccfoe",
      },
      {
        name: "Firefox Add-ons",
        icon: "firefox",
        url: "https://addons.mozilla.org/en-US/firefox/addon/grabcaramel/",
      },
    ],
    techStack: ["JavaScript", "iOS", "macOS"],
    story: [
      "After the FTC published findings that Honey was hijacking affiliate commissions from content creators, I decided to build the transparent, honest alternative. Caramel is fully open-source — anyone can audit what it does.",
      "The core challenge was building a coupon-finding system that works across thousands of different checkout flows. The content script uses URL pattern matching and DOM observation to detect and inject coupon codes.",
      "Getting into Safari on iOS required building a full Swift wrapper app. The App Store review took 3 weeks and 2 rejections. Worth it — the iOS Safari market was significant. Caramel is now live on Chrome, Firefox, and Safari.",
    ],
  },
  {
    slug: "upup",
    name: "UpUp",
    tagline: "React file uploader NPM component",
    description:
      "Open-source, free, and secure React file upload component with cloud storage integrations (Google Drive, OneDrive, S3).",
    heroImage: "/screenshots/upup.webp",
    logo: "/logos/upup.png",
    logoWidth: 6400,
    logoHeight: 1366,
    url: "https://useupup.com",
    isOSS: true,
    githubUrl: "https://github.com/DevinoSolutions/upup",
    contraUrl:
      "https://contra.com/p/ZQl3WYFY-g-drive-one-drive-s3-integrations-open-react-file-uploader",
    mauFallback: 10,
    gaPropertyDomain: "useupup.com",
    platforms: [
      {
        name: "npm",
        icon: "npm",
        url: "https://www.npmjs.com/package/@upupjs/core",
      },
      {
        name: "GitHub",
        icon: "github",
        url: "https://github.com/DevinoSolutions/upup",
      },
    ],
    techStack: ["React", "TypeScript", "S3", "Google Drive"],
    story: [
      "UpUp started because every client project needed file uploads, and every solution was either overpriced, locked to one cloud provider, or a security risk. I built a drop-in React component that handles all three.",
      "The architecture supports simultaneous uploads to S3, Google Drive, and OneDrive with a unified API. The component handles chunking for large files, retry logic, and progress tracking out of the box.",
      "After open-sourcing on GitHub and publishing to npm, the component was adopted by dozens of projects. The documentation site (useupup.com) drives organic installs through search.",
    ],
  },
  {
    slug: "getitdone",
    name: "GetItDone",
    tagline: "Team check-ins, tasks, time tracking",
    description:
      "One dashboard for daily check-ins, task updates, time tracking. Skip stand-ups and stop tool-hopping.",
    heroImage: "/screenshots/getitdone.webp",
    logo: "/logos/getitdone.png",
    logoWidth: 1646,
    logoHeight: 445,
    url: "https://nowgetitdone.com",
    isOSS: false,
    mauFallback: 5,
    gaPropertyDomain: "nowgetitdone.com",
    platforms: [{ name: "Web", icon: "globe", url: "https://nowgetitdone.com" }],
    techStack: ["Next.js", "TypeScript", "Prisma"],
    story: [
      "GetItDone came from managing multiple development teams at Devino Solutions. Between Jira, Slack standups, time trackers, and task boards, the overhead was killing productivity.",
      "The app consolidates async standups (no more scheduling 15-minute meetings), task updates, and time tracking into a single dashboard. Teams submit daily check-ins in 2 minutes instead of meeting for 15.",
      "Built on Next.js with Prisma for the data layer.",
    ],
  },
  {
    slug: "postify",
    name: "Postify",
    tagline: "AI social media scheduler",
    description:
      "Write a post once, tailor it per platform with an AI copilot, then schedule or publish it to X, LinkedIn, Instagram, TikTok, YouTube and more from one dashboard.",
    heroImage: "/screenshots/postify.webp",
    logo: "/logos/postify.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://usepostify.com",
    isOSS: false,
    platforms: [
      { name: "Web", icon: "globe", url: "https://usepostify.com" },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=com.usepostify.app",
      },
      {
        name: "Microsoft Store",
        icon: "microsoft",
        url: "https://apps.microsoft.com/detail/9nhhh4mqxx4f",
      },
    ],
    techStack: ["Next.js", "TypeScript", "React", "Prisma", "PostgreSQL"],
    story: [
      "Postify is one of the products I build through Devino Solutions: a social media scheduler built around one loop. Compose once, tailor the post for each platform, then schedule or publish. It connects to X, LinkedIn, Facebook, Instagram, Threads, TikTok, Pinterest, YouTube, Bluesky and Reddit.",
      "Scheduled posts land on a calendar with day, week, month and agenda views, and background workers handle publishing, token refresh, inbox sync and analytics snapshots. An AI copilot inside the composer is tuned to the channel you are writing for, and an MCP server lets outside assistants create drafts and reschedule posts.",
      "It is a Next.js and TypeScript app on PostgreSQL with Prisma, with the Android app built on Capacitor and a Windows app on the Microsoft Store.",
    ],
  },
  {
    slug: "superbooks",
    name: "SuperBooks",
    tagline: "AI bookkeeping for small businesses",
    description:
      "Connect your bank accounts and let AI categorize each transaction and match it to its receipt or invoice, so the books keep up without manual reconciliation.",
    heroImage: "/screenshots/superbooks.webp",
    logo: "/logos/superbooks.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://superbooks.io",
    isOSS: false,
    platforms: [
      { name: "Web", icon: "globe", url: "https://superbooks.io" },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=com.devino.superbooks",
      },
    ],
    techStack: ["Next.js", "TypeScript", "React", "Prisma", "Stripe"],
    story: [
      "SuperBooks is AI bookkeeping and accounting software for small businesses, built through Devino Solutions and now in beta. Bank connections run through Plaid, each transaction is categorized with AI, and a matching engine suggests the receipt or invoice it belongs to.",
      "Receipts arrive through an inbox that collects documents from Gmail and Outlook. It also sends invoices, including recurring ones, handles multi-currency accounts, and syncs with QuickBooks, Xero and Fortnox.",
      "For developers there is a documented API with TypeScript and Python SDKs, and an MCP server lets AI assistants work with the books directly. It is a Turborepo monorepo with a Next.js web app, a tRPC API, Prisma and Stripe billing.",
    ],
  },
  {
    slug: "bioflow",
    name: "BioFlow",
    tagline: "A link-in-bio page that builds itself",
    description:
      "A link-in-bio tool with an AI agent that builds the page, connects the tools you already use and keeps every link current on its own.",
    heroImage: "/screenshots/bioflow.webp",
    logo: "/logos/bioflow.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://getbioflow.com",
    isOSS: false,
    platforms: [
      { name: "Web", icon: "globe", url: "https://getbioflow.com" },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=com.devino.bioflow",
      },
      {
        name: "Microsoft Store",
        icon: "microsoft",
        url: "https://apps.microsoft.com/detail/9n699lqbnxsj",
      },
    ],
    techStack: ["Next.js", "TypeScript", "React", "Prisma"],
    story: [
      "BioFlow is a link-in-bio tool where an AI agent does the page building. You describe who you are and what you want, the agent asks a few questions and ships a page, and you keep changing it by talking to it instead of dragging blocks around.",
      "It connects to 10 sources, including YouTube, Shopify, Instagram, TikTok, Calendly, Mailchimp and Google Calendar, so a new video, product or event shows up on the page without anyone editing it. An MCP server with 12 tools lets Claude, ChatGPT or your own agent read pages and analytics and create, edit and schedule drafts.",
      "It is a pnpm and Turborepo monorepo: a Next.js web app with a tRPC API and Prisma, plus a worker service for connector syncs and scheduled publishing. The Android app wraps the web app with Capacitor.",
    ],
  },
  {
    slug: "dodomain",
    name: "DoDomain",
    tagline: "Custom domains for SaaS, minus the DNS support queue",
    description:
      "A custom-domain API and hosted connect flow for SaaS products: your users connect their own domain, DoDomain verifies the DNS and your app gets a signed webhook.",
    heroImage: "/screenshots/dodomain.webp",
    logo: "/logos/dodomain.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://dodomain.io",
    isOSS: false,
    platforms: [
      { name: "Web", icon: "globe", url: "https://dodomain.io" },
      {
        name: "Google Play",
        icon: "googleplay",
        url: "https://play.google.com/store/apps/details?id=io.dodomain.app",
      },
      {
        name: "Microsoft Store",
        icon: "microsoft",
        url: "https://apps.microsoft.com/detail/9p3kbjkxv92p",
      },
    ],
    techStack: ["Next.js", "TypeScript", "React", "Prisma", "PostgreSQL"],
    story: [
      "DoDomain is the layer a SaaS embeds so its users can connect a domain they already own. When a customer wants the product on their own domain, the SaaS opens DoDomain's connect flow and DoDomain handles the DNS instead of walking each customer through records by email.",
      "It picks the smoothest path for each DNS provider: Cloudflare one-click, the Domain Connect standard, or guided setup as the fallback that works everywhere. Records are checked against the domain's authoritative nameservers, and the app is told over a webhook signed with HMAC-SHA256 and a timestamp.",
      "Integrators get a REST API, a Node SDK, an embeddable widget and React bindings on npm, plus an MCP server with 7 tools. BioFlow, another of our products, connects its users' custom domains through it.",
    ],
  },
  {
    slug: "bitbuy",
    name: "Bitbuy",
    tagline: "A CMS-driven crypto converter landing system",
    description:
      "Client work through Devino: a scalable Webflow CMS template that powers 1,000+ crypto and fiat conversion pages for Bitbuy Canada, driven by the page slug.",
    heroImage: "/screenshots/bitbuy.webp",
    logo: "/logos/bitbuy.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://bitbuy.ca/en-ca/convert/ethereum-to-usd",
    isOSS: false,
    clientName: "Bitbuy",
    platforms: [
      {
        name: "Live page",
        icon: "globe",
        url: "https://bitbuy.ca/en-ca/convert/ethereum-to-usd",
      },
    ],
    techStack: ["Webflow", "JavaScript", "CMS", "Technical SEO"],
    story: [
      "For Bitbuy Canada, we built a conversion landing-page system they can use to advertise specific crypto and fiat pairs on Contra and through search.",
      "Instead of hard-coding each page, the slug controls the whole experience for that pair, for example ethereum-to-usd or bitcoin-to-cad. Each slug maps to a CMS entry that defines the titles, meta description, headings, on-page copy, FAQs and CTAs, so 1,000+ variants of USD, CAD and crypto pairs run from a single layout.",
    ],
  },
  {
    slug: "syncara",
    name: "Syncara",
    tagline: "A Figma-first MVP for Canadian healthcare",
    description:
      "Client work through Devino: an interactive Figma MVP for Syncara, a Canadian healthcare platform, validated with a clickable prototype before any code was written.",
    heroImage: "/screenshots/syncara.webp",
    logo: "/logos/syncara.png",
    logoWidth: 128,
    logoHeight: 128,
    logoIsIcon: true,
    url: "https://embed.figma.com/proto/bwVTdgcsiVhndxdcbzdzBy/Syncara?embed-host=contra.com&footer=false&theme=light&viewport-controls=true&node-id=505-8701",
    isOSS: false,
    clientName: "Syncara",
    platforms: [
      {
        name: "Figma prototype",
        icon: "figma",
        url: "https://embed.figma.com/proto/bwVTdgcsiVhndxdcbzdzBy/Syncara?embed-host=contra.com&footer=false&theme=light&viewport-controls=true&node-id=505-8701",
      },
    ],
    techStack: ["Figma", "Photoshop", "Illustrator", "Next.js"],
    story: [
      "We developed Syncara's MVP Phase 1 entirely in Figma, creating interactive wireframes that cover appointments, medications, providers and medical conditions, with no code involved. That let the client explore the platform and gather feedback early, without investing in development.",
      "We also established the brand identity, refining assets in Photoshop and designing the logo in Figma, and used Figma's prototyping to demonstrate subscription flows and navigation through a fully clickable design.",
      "With the prototype validated, the engagement moved from UI/UX into Next.js development, carrying the same design system straight into the build.",
    ],
  },
]);
