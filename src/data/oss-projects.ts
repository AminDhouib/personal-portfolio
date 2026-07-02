// Lucide icon name used for tools without a brand logo. Mapped to the real
// component in the OpenSource section so this data module stays presentation-free
// (it is imported by a server component and a client component alike).
export type OssIcon = "EyeOff" | "BellRing" | "Cloud" | "LayoutGrid";

export interface OssProject {
  // Stable key used to look up live GitHub stats for this repo.
  key: string;
  name: string;
  description: string;
  // Brand logo (Caramel, UpUp) …
  logo?: string;
  logoWidth?: number;
  logoHeight?: number;
  // … or a lucide icon for tools without a brand logo.
  icon?: OssIcon;
  // Stack chips shown on the card (primary language first).
  tech: string[];
  // GitHub repo the live star/fork counts are fetched from; the card link is
  // derived as https://github.com/{owner}/{repo}.
  owner: string;
  repo: string;
  // Fallback star/fork counts shown until live GitHub stats resolve.
  forks: number;
  stars: number;
}

export const ossProjects: readonly OssProject[] = Object.freeze([
  {
    key: "caramel",
    name: "Caramel",
    description: "Open-source Honey alternative",
    logo: "/logos/caramel.png",
    logoWidth: 1830,
    logoHeight: 467,
    tech: ["TypeScript", "JavaScript", "Swift", "Browser Extension"],
    owner: "DevinoSolutions",
    repo: "caramel",
    forks: 45,
    stars: 234,
  },
  {
    key: "upup",
    name: "UpUp",
    description: "React file upload component",
    logo: "/logos/upup.png",
    logoWidth: 6400,
    logoHeight: 1366,
    tech: ["React", "TypeScript", "AWS S3", "Azure"],
    owner: "DevinoSolutions",
    repo: "upup",
    forks: 32,
    stars: 189,
  },
  {
    key: "stealth",
    name: "Stealth Chrome DevTools MCP",
    description:
      "Undetectable browser automation for AI agents via MCP — stealth Chrome with anti-detection profile management and full CDP access.",
    icon: "EyeOff",
    tech: ["Python", "nodriver", "CDP", "MCP"],
    owner: "DevinoSolutions",
    repo: "stealth-chrome-devtools-mcp",
    forks: 0,
    stars: 3,
  },
  {
    key: "notifier",
    name: "AI Agent Notifier",
    description:
      "Desktop & phone notifications for AI coding agents (Claude Code, Codex, Gemini CLI, Cursor). Toast + ntfy push, zero dependencies.",
    icon: "BellRing",
    tech: ["JavaScript", "Node.js", "ntfy"],
    owner: "DevinoSolutions",
    repo: "ai-agent-notifier",
    forks: 0,
    stars: 4,
  },
  {
    key: "dokploy",
    name: "Dokploy Community",
    description: "Open Source Alternative to Vercel, Netlify and Heroku.",
    icon: "Cloud",
    tech: ["TypeScript", "Docker", "Traefik"],
    owner: "DevinoSolutions",
    repo: "dokploy-community",
    forks: 0,
    stars: 7,
  },
  {
    key: "multideck",
    name: "MultiDeck",
    description:
      "Open every project in its own terminal and auto-tile them into a grid across all your monitors — DPI-correct on mixed-scale setups.",
    icon: "LayoutGrid",
    tech: ["PowerShell", "Claude Code", "Codex"],
    owner: "DevinoSolutions",
    repo: "multideck-ai-agents-manager",
    forks: 0,
    stars: 2,
  },
]);
