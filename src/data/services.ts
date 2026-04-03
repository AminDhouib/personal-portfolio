import type { LucideIcon } from "lucide-react";
import { Bot, Code2, Cloud, Database, ShieldCheck } from "lucide-react";

export interface Service {
  title: string;
  description: string;
  tools: string;
  icon: LucideIcon;
  accentColor: string;
}

export const services: Service[] = [
  {
    title: "AI Automation",
    description: "Web scraping, AI agents, orchestration",
    tools: "Python / LangChain / Scrapy / Make",
    icon: Bot,
    accentColor: "var(--color-accent-green)",
  },
  {
    title: "Full Stack Development",
    description: "Web & mobile, end to end",
    tools: "Next.js / Prisma / TypeScript / Django / FastAPI",
    icon: Code2,
    accentColor: "var(--color-accent-blue)",
  },
  {
    title: "DevOps & Cloud",
    description: "CI/CD, infra, deployment",
    tools: "Docker / AWS / Terraform / Jenkins",
    icon: Cloud,
    accentColor: "var(--color-accent-purple)",
  },
  {
    title: "Database Management",
    description: "Design, optimize, migrate",
    tools: "PostgreSQL / MongoDB / Firebase / Redis",
    icon: Database,
    accentColor: "var(--color-accent-cyan)",
  },
  {
    title: "Security",
    description: "Pentesting, network, DevSecOps",
    tools: "Burp Suite / Wireshark / Tailscale",
    icon: ShieldCheck,
    accentColor: "var(--color-accent-amber)",
  },
];
