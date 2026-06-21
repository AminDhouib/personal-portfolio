import {
  siApple,
  siBurpsuite,
  siCoderabbit,
  siDjango,
  siDocker,
  siEslint,
  siFastapi,
  siFigma,
  siFirebase,
  siFirefox,
  siGithub,
  siGoogle,
  siGooglechrome,
  siGooglecloud,
  siGoogledrive,
  siGoogleplay,
  siInstagram,
  siJavascript,
  siJenkins,
  siKnip,
  siKubernetes,
  siLangchain,
  siMake,
  siMongodb,
  siNextdotjs,
  siNodedotjs,
  siNpm,
  siPostgresql,
  siPrettier,
  siPrisma,
  siPython,
  siReact,
  siRedis,
  siRuff,
  siRust,
  siScrapy,
  siSelenium,
  siSwift,
  siTailwindcss,
  siTailscale,
  siTerraform,
  siThreedotjs,
  siTypescript,
  siUpwork,
  siWireshark,
  siYoutube,
} from "simple-icons";

type SimpleIcon = { path: string; title: string };

const SIMPLE_ICONS: Record<string, SimpleIcon> = {
  apple: siApple,
  burpsuite: siBurpsuite,
  coderabbit: siCoderabbit,
  django: siDjango,
  docker: siDocker,
  eslint: siEslint,
  fastapi: siFastapi,
  figma: siFigma,
  firebase: siFirebase,
  firefox: siFirefox,
  github: siGithub,
  google: siGoogle,
  googlechrome: siGooglechrome,
  googlecloud: siGooglecloud,
  googledrive: siGoogledrive,
  googleplay: siGoogleplay,
  instagram: siInstagram,
  javascript: siJavascript,
  jenkins: siJenkins,
  knip: siKnip,
  kubernetes: siKubernetes,
  langchain: siLangchain,
  make: siMake,
  mongodb: siMongodb,
  nextdotjs: siNextdotjs,
  nodedotjs: siNodedotjs,
  npm: siNpm,
  postgresql: siPostgresql,
  prettier: siPrettier,
  prisma: siPrisma,
  python: siPython,
  react: siReact,
  redis: siRedis,
  ruff: siRuff,
  rust: siRust,
  scrapy: siScrapy,
  selenium: siSelenium,
  swift: siSwift,
  tailwindcss: siTailwindcss,
  tailscale: siTailscale,
  terraform: siTerraform,
  threedotjs: siThreedotjs,
  typescript: siTypescript,
  upwork: siUpwork,
  wireshark: siWireshark,
  youtube: siYoutube,
};

const TOOL_TO_SLUG: Record<string, string> = {
  python: "python",
  langchain: "langchain",
  selenium: "selenium",
  // playwright + pydoll: no simple-icons entry in v16.14 — chip renders text only.
  scrapy: "scrapy",
  make: "make",
  "next.js": "nextdotjs",
  prisma: "prisma",
  typescript: "typescript",
  react: "react",
  javascript: "javascript",
  "node.js": "nodedotjs",
  swift: "swift",
  "tailwind css": "tailwindcss",
  django: "django",
  fastapi: "fastapi",
  docker: "docker",
  // Docker Swarm shares Docker's brand icon (no separate Swarm logo upstream).
  "docker swarm": "docker",
  kubernetes: "kubernetes",
  terraform: "terraform",
  // AWS dropped from simple-icons (trademark policy). Chip renders text only.
  gcp: "googlecloud",
  jenkins: "jenkins",
  postgresql: "postgresql",
  mongodb: "mongodb",
  firebase: "firebase",
  redis: "redis",
  tailscale: "tailscale",
  wireshark: "wireshark",
  "burp suite": "burpsuite",
};

function getSimpleIcon(slug: string) {
  return SIMPLE_ICONS[slug.toLowerCase()];
}

export function SiIcon({ slug, className }: { slug: string; className?: string }) {
  const icon = getSimpleIcon(slug);
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
}

export function TechIcon({ name }: { name: string }) {
  const slug = TOOL_TO_SLUG[name.toLowerCase()];
  const icon = slug ? getSimpleIcon(slug) : undefined;

  return (
    <span className="inline-flex items-center gap-1">
      {icon && (
        <svg
          viewBox="0 0 24 24"
          width="0.8em"
          height="0.8em"
          fill="currentColor"
          aria-hidden="true"
          className="shrink-0 opacity-75"
        >
          <path d={icon.path} />
        </svg>
      )}
      {name}
    </span>
  );
}
