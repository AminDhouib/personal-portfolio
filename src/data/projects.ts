export interface Project {
  slug: string;
  name: string;
  tagline: string;
  description: string;
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
  },
  {
    slug: "unotes",
    name: "uNotes",
    tagline: "30K+ docs shared by students",
    description:
      "Community-driven note-sharing platform with 30,000+ user-uploaded university docs. Free alternative to Chegg, CourseHero, StuDocu.",
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
  },
  {
    slug: "caramel",
    name: "Caramel",
    tagline: "Open-source Honey alternative",
    description:
      "Browser extension that automatically applies the best coupon code at checkout, without selling data or hijacking creators' commissions.",
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
  },
  {
    slug: "upup",
    name: "UpUp",
    tagline: "React file uploader NPM component",
    description:
      "Open-source, free, and secure React file upload component with cloud storage integrations (Google Drive, OneDrive, S3).",
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
  },
];
