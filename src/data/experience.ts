/** A labeled cluster of bullets — used when one role spans distinct tracks. */
export interface HighlightGroup {
  label: string;
  items: string[];
}

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
  /** Flat list of accomplishments. Empty when the role uses grouped tracks instead. */
  highlights: string[];
  /** Optional labeled sub-tracks (rendered in place of `highlights` when present). */
  highlightGroups?: HighlightGroup[];
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
      "Successfully generated over $1M in project revenue, working with 100+ satisfied clients and earning an average 5-star rating.",
      "Developed many great B2B relationships and long-term client partnerships.",
      "Published several apps, including uNotes and Shorty, reaching a cumulative 20K monthly active users.",
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
      "Created videos and thumbnails using Adobe Photoshop and Premiere Pro.",
      "Formed inspirational content that has positively impacted over 100 people's mental and physical health.",
    ],
    skills: ["Video Editing", "Photoshop", "Premiere Pro", "Public Speaking"],
  },
  {
    role: "GIS Full Stack / Code Migration Modernization Porting Specialist",
    company: "Fujitsu",
    short: "F",
    brand: "fujitsu",
    accent: "#ff0000",
    type: "Full-time",
    period: "Nov 2022 – Apr 2024",
    location: "Ottawa, ON · Remote",
    highlights: [],
    highlightGroups: [
      {
        label: "GIS Full Stack Developer",
        items: [
          "Optimized spatial data storage and query management using PostGIS.",
          "Developed dynamic and interactive front-end features with jQuery and CSS.",
          "Ported old JS/jQuery code to Vue.js, building user interfaces and single-page applications (SPAs).",
          "Managed backend systems and data handling with SQLAlchemy.",
          "Automated development workflows and improved CI/CD processes with Jenkins and Azure.",
        ],
      },
      {
        label: "Code Migration Modernization Specialist",
        items: [
          "Migrated legacy COBOL code to C#.",
          "Converted COBOL code to Java for system modernization.",
          "Recreated frontend terminals using React.js.",
        ],
      },
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
      "Collaborated with the team to analyze requirements and design user stories and next steps toward our goals.",
      "Managed webapp hosting using AWS services (EC2, S3, RDS) and NGINX.",
      "Created and maintained Django REST APIs for data communication between frontend and backend.",
      "Managed PostgreSQL database migrations using Django's ORM.",
      "Implemented responsive and user-friendly UI components using React.js.",
      "Developed scripts to perform cronjobs and automate sending emails using the SendGrid API.",
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
      "Created a C# CLI program that programmatically allows users to share and manage files in the cloud.",
      "Designed key features in Visual Basic on embedded platforms for high-performance optical modules.",
      "Performed in-lab optical wave test experiments with various high-tech equipment.",
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
      "Created services using Java, Python, and Bash to manage the data of different cryptographic keys (McEliece, RSA, ECC, AES, and HSS) from Crypto4A's HSM (Hardware Security Module) and Yubico's YubiKey.",
      "Created test cases for Crypto4A's low-level C/C++ program that handles the HSM's hardware logic, achieving 80%+ code coverage.",
      "Developed JavaScript web apps that interfaced with Crypto4A's Java services using a REST API.",
      "Migrated Crypto4A's entire Java/Maven project from JDK 8 to JDK 11.",
      "Created custom terminal Linux commands that interfaced with the Java services.",
      "Supervised newly recruited students by performing professional code reviews and scheduling weekly meetings to assist them in their tasks.",
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
      "Laid the foundations for a Java application allowing DND to create, build, and run automated tests for their SOAP services.",
      "Worked with JUnit to create test cases, an Oracle MySQL database for managing DB data, and Hibernate to interface with the DB.",
    ],
    skills: ["Java", "JUnit", "Hibernate", "SQL"],
  },
];
