import type { LucideIcon } from "lucide-react";
import { Bot, Code2, Cloud, Database, ShieldCheck, TrendingUp } from "lucide-react";

export interface Service {
  title: string;
  description: string;
  tools: string[];
  icon: LucideIcon;
  accentColor: string;
}

export const services: readonly Service[] = Object.freeze([
  {
    title: "AI Automation",
    description: "Web scraping, AI agents, orchestration",
    tools: ["Python", "LangChain", "Selenium", "Playwright", "Pydoll", "Scrapy", "Make"],
    icon: Bot,
    accentColor: "var(--color-accent-green)",
  },
  {
    title: "Full Stack Development",
    description: "Web & mobile, end to end",
    tools: ["Next.js", "Prisma", "TypeScript", "Tailwind CSS", "Django", "FastAPI"],
    icon: Code2,
    accentColor: "var(--color-accent-blue)",
  },
  {
    title: "DevOps & Cloud",
    description: "CI/CD, infra, deployment",
    tools: ["Docker", "Docker Swarm", "Kubernetes", "Terraform", "AWS", "GCP", "Jenkins"],
    icon: Cloud,
    accentColor: "var(--color-accent-purple)",
  },
  {
    title: "Database Management",
    description: "Design, optimize, migrate",
    tools: ["PostgreSQL", "MongoDB", "Firebase", "Redis"],
    icon: Database,
    accentColor: "var(--color-accent-cyan)",
  },
  {
    title: "Security",
    description: "Pentesting, network, DevSecOps",
    tools: ["Burp Suite", "Wireshark", "Tailscale"],
    icon: ShieldCheck,
    accentColor: "var(--color-accent-amber)",
  },
  {
    title: "SEO & Analytics",
    description: "Rank higher, track what matters",
    tools: ["Google Analytics", "Google Search Console", "Google Tag Manager", "SEMrush", "Ahrefs", "Hotjar", "Lighthouse"],
    icon: TrendingUp,
    accentColor: "var(--color-accent-pink)",
  },
]);
