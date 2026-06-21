export interface ExperienceItem {
  role: string;
  company: string;
  /** Short monogram for the medallion when no logo or brand glyph exists (1–3 chars). */
  short: string;
  /** Real logo image in /public — takes precedence over brand/monogram. */
  logo?: string;
  /** simple-icons slug rendered in the medallion when the company has a real brand mark. */
  brand?: string;
  /** CSS color driving the medallion, spine, company name, and Current marker. */
  accent: string;
  type?: string;
  period: string;
  location?: string;
  current?: boolean;
  highlights: string[];
  skills: string[];
}

// Career history, newest-first (mirrors the LinkedIn ordering).
export const experience: ExperienceItem[] = [
  {
    role: "Founder & CEO",
    company: "Devino",
    short: "D",
    logo: "/logos/companies/devino.png",
    accent: "var(--color-accent-blue)",
    type: "Full-time",
    period: "Jan 2023 – Present",
    location: "Ottawa, ON · Remote",
    current: true,
    highlights: [
      "Generated over $1M in project revenue across 100+ clients with a 5-star average rating.",
      "Published apps including uNotes and Shorty, reaching ~20K cumulative monthly active users.",
    ],
    skills: ["Leadership", "Full-Stack", "Product", "B2B Sales"],
  },
  {
    role: "Content Creator (Motivational Speaker)",
    company: "YouTube",
    short: "YT",
    brand: "youtube",
    accent: "#ff0000",
    type: "Self-employed",
    period: "Sep 2022 – Present",
    current: true,
    highlights: [
      "Produce videos and thumbnails with Adobe Photoshop and Premiere Pro.",
      "Created inspirational content that has positively impacted 100+ people's mental health.",
    ],
    skills: ["Video Editing", "Photoshop", "Premiere Pro", "Public Speaking"],
  },
  {
    role: "GIS Full Stack / Code Migration Modernization Specialist",
    company: "Fujitsu",
    short: "F",
    brand: "fujitsu",
    accent: "#ff0000",
    type: "Full-time",
    period: "Nov 2022 – Apr 2024",
    location: "Ottawa, ON · Remote",
    highlights: [
      "Optimized spatial data storage and queries with PostGIS and built interactive front-ends in jQuery.",
      "Ported legacy JS/jQuery to Vue.js single-page apps and automated CI/CD with Jenkins and Azure.",
      "Modernized legacy COBOL into C# and Java, recreating terminals in React.",
    ],
    skills: ["Vue.js", "C#", "PostGIS", "SQLAlchemy", "Jenkins", "Azure"],
  },
  {
    role: "Senior Full Stack Developer (React + Django)",
    company: "Math ANEX (acquired by Amplify)",
    short: "MA",
    logo: "/logos/companies/mathanex.png",
    accent: "var(--color-accent-purple)",
    type: "Full-time",
    period: "Mar 2023 – Jun 2023",
    location: "Remote",
    highlights: [
      "Built and maintained Django REST APIs and responsive React user interfaces.",
      "Managed AWS hosting (EC2, S3, RDS) behind NGINX with PostgreSQL migrations via Django ORM.",
    ],
    skills: ["React", "Django", "AWS", "PostgreSQL", "NGINX"],
  },
  {
    role: "DevOps Engineer",
    company: "Levio",
    short: "L",
    logo: "/logos/companies/levio.png",
    accent: "var(--color-accent-amber)",
    type: "Contract",
    period: "Mar 2023 – May 2023",
    location: "Ottawa, ON · Remote",
    highlights: [
      "Owned DevOps workflows and CI/CD pipelines on a Bitbucket-based stack.",
    ],
    skills: ["DevOps", "Bitbucket", "CI/CD"],
  },
  {
    role: "Research Development Software Engineer",
    company: "Lumentum",
    short: "Lm",
    logo: "/logos/companies/lumentum.png",
    accent: "var(--color-accent-cyan)",
    type: "Contract",
    period: "May 2021 – Sep 2021",
    location: "Ottawa, ON · Hybrid",
    highlights: [
      "Built a C# CLI to share and manage files in the cloud.",
      "Designed embedded Visual Basic features for high-performance optical modules and ran in-lab optical wave tests.",
    ],
    skills: ["C#", "Visual Basic", "Fiber Optics", "Embedded"],
  },
  {
    role: "CyberSecurity Software Developer",
    company: "Crypto4A Technologies",
    short: "C4",
    logo: "/logos/companies/crypto4a.png",
    accent: "var(--color-accent-green)",
    type: "Contract",
    period: "Jan 2020 – Dec 2020",
    location: "Ottawa, ON · Hybrid",
    highlights: [
      "Managed cryptographic keys (RSA, ECC, AES, McEliece, HSS) from an HSM and Yubico YubiKeys via Java, Python and Bash.",
      "Wrote test cases for low-level C/C++ HSM logic to 80%+ coverage and migrated the Java/Maven project from JDK8 to JDK11.",
    ],
    skills: ["Java", "Python", "C/C++", "Cryptography", "HSM"],
  },
  {
    role: "Java Software Engineer",
    company: "Department of National Defence",
    short: "DND",
    logo: "/logos/companies/dnd.png",
    accent: "var(--color-accent-blue)",
    type: "Internship",
    period: "May 2019 – Sep 2019",
    location: "Ottawa, ON · On-site",
    highlights: [
      "Laid the foundations for a Java application to build and run automated SOAP-service tests.",
      "Wrote JUnit test cases against an Oracle/MySQL database with Hibernate.",
    ],
    skills: ["Java", "JUnit", "Hibernate", "SQL"],
  },
];
