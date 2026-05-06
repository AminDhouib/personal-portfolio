import * as si from "simple-icons";

type SIRecord = Record<string, { path: string; title: string } | undefined>;
const icons = si as unknown as SIRecord;

const TOOL_TO_SLUG: Record<string, string> = {
  python: "siPython",
  langchain: "siLangchain",
  scrapy: "siScrapy",
  make: "siMake",
  "next.js": "siNextdotjs",
  prisma: "siPrisma",
  typescript: "siTypescript",
  django: "siDjango",
  fastapi: "siFastapi",
  docker: "siDocker",
  aws: "siAmazonwebservices",
  terraform: "siTerraform",
  jenkins: "siJenkins",
  postgresql: "siPostgresql",
  mongodb: "siMongodb",
  firebase: "siFirebase",
  redis: "siRedis",
  tailscale: "siTailscale",
  wireshark: "siWireshark",
};

export function TechIcon({ name }: { name: string }) {
  const slug = TOOL_TO_SLUG[name.toLowerCase()];
  const icon = slug ? icons[slug] : undefined;

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
