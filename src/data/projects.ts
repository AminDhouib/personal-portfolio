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
  url: string;
  isOSS: boolean;
  githubUrl?: string;
  contraUrl?: string;
  mauFallback: number;
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

export const projects: Project[] = [
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
    url: "https://aishorty.com",
    isOSS: false,
    contraUrl:
      "https://contra.com/p/QsA7PFlq-nextjs-figma-python-seleniumandtor-browser-ext-shorty",
    mauFallback: 2100,
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
    tagline: "30K+ docs shared by students",
    description:
      "Community-driven note-sharing platform with 30,000+ user-uploaded university docs. Free alternative to Chegg, CourseHero, StuDocu.",
    heroImage: "/screenshots/unotes.webp",
    logo: "/logos/unotes.png",
    url: "https://unotes.net",
    isOSS: false,
    contraUrl:
      "https://contra.com/p/bve7Lces-nextjs-typescript-aws-u-notes",
    mauFallback: 5000,
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
      "uNotes now has 30,000+ documents from universities across Canada and the US, with 5,000+ monthly active users. It's available on the App Store, Google Play, Microsoft Store, and web.",
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
    url: "https://grabcaramel.com",
    isOSS: true,
    githubUrl: "https://github.com/DevinoSolutions/caramel",
    contraUrl:
      "https://contra.com/p/v3Ek6YPZ-caramel-open-source-alternative-to-honey-coupon-finder",
    mauFallback: 800,
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
    url: "https://useupup.com",
    isOSS: true,
    githubUrl: "https://github.com/DevinoSolutions/upup",
    contraUrl:
      "https://contra.com/p/ZQl3WYFY-g-drive-one-drive-s3-integrations-open-react-file-uploader",
    mauFallback: 1200,
    gaPropertyDomain: "useupup.com",
    platforms: [
      {
        name: "npm",
        icon: "npm",
        url: "https://www.npmjs.com/package/@upup-company/upup",
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
    logo: "/logos/getitdone.png",
    url: "https://nowgetitdone.com",
    isOSS: false,
    mauFallback: 500,
    gaPropertyDomain: "nowgetitdone.com",
    platforms: [
      { name: "Web", icon: "globe", url: "https://nowgetitdone.com" },
    ],
    techStack: ["Next.js", "TypeScript", "Prisma"],
    story: [
      "GetItDone came from managing multiple development teams at Devino Solutions. Between Jira, Slack standups, time trackers, and task boards, the overhead was killing productivity.",
      "The app consolidates async standups (no more scheduling 15-minute meetings), task updates, and time tracking into a single dashboard. Teams submit daily check-ins in 2 minutes instead of meeting for 15.",
      "Built on Next.js with Prisma for the data layer. Currently at 500 MAU with steady growth from B2B referrals.",
    ],
  },
];
