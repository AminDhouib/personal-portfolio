import type { GameContent } from "./types";

export const failoverContent: GameContent = {
  seoTitle: "Failover: Cloud Architecture Survival Game",
  seoDescription:
    "Play Failover free. Build a cloud from firewalls, load balancers, servers and databases, wire it to the Internet and keep it up as traffic grows.",
  genre: ["Simulation", "Strategy"],
  playMode: "SinglePlayer",
  intro:
    "Failover is a free cloud architecture game. You start with $500, an empty grid and the Internet at one edge. Traffic arrives as requests of different kinds: static files, reads, writes, uploads, searches, later AI inference, and a steady share of malicious ones. Every request needs a path through services you build and link together. Answered requests earn money and reputation; dropped ones cost both. The run lasts as long as your design does.",
  howToPlay: [
    "Pick a service from the Build menu and click an empty tile to place it. Each one costs money up front and upkeep while it runs.",
    "Choose Link, then click a source and a target to send traffic from one to the other. Start from the Internet; a link only goes where the request types allow.",
    "A first design that works: Internet to Firewall to Load Balancer to Compute, with a database behind Compute.",
    "Select a service to see its tier and health, and upgrade it when it runs hot.",
    "Watch money and reputation. The run ends when reputation reaches zero or the account falls $1,000 into the red.",
    "Press Daily for today's Daily Incident: the same traffic and trouble for everyone that UTC day. A finished run can be posted to the daily board.",
    "Share copies a link to your build, and Save keeps a run in this browser. Sandbox Mode has a large budget and no failure.",
  ],
  controls: [
    {
      input: "Mouse",
      action: "Click a tile to place or pick, drag to pan, and use the wheel to zoom.",
    },
    {
      input: "Touch",
      action:
        "Tap to pick. A placement or a demolish asks you to confirm. Two fingers pan and pinch to zoom.",
    },
    { input: "1, 2, 3", action: "The Select, Link and Demolish tools. Escape cancels." },
    { input: "WASD or arrow keys", action: "Pan the board." },
    {
      input: "Q, E and T",
      action: "Turn the board a quarter left or right, and switch to the top-down view.",
    },
    {
      input: "Space",
      action: "Pause or resume. The speed buttons run the game at 1x, 2x or 3x.",
    },
  ],
  strategy: [
    "Put a Firewall first. Malicious requests that get through cost money and reputation.",
    "Spread the load before it hurts: add a Load Balancer and more Compute, or upgrade.",
    "Cache what you can. A Memory Cache answers repeat reads cheaply, and a CDN serves static files.",
    "Keep cash for incidents. Cost spikes, bursts and outages arrive without warning.",
  ],
  facts: [
    {
      label: "Services",
      value: "26 types, from firewalls and load balancers to GPU clusters and substations",
    },
    { label: "Starting budget", value: "$500" },
    { label: "Run ends", value: "Reputation at zero, or $1,000 in debt" },
    {
      label: "Simulation",
      value: "20 fixed steps per second from a seed, so a run replays exactly",
    },
    {
      label: "In this version",
      value:
        "Survival, a Daily Incident with a leaderboard, Sandbox Mode, saves and shared builds. The campaign is not in yet.",
    },
    { label: "Sound", value: "Synthesized in your browser, off until you turn it on" },
  ],
  faq: [
    {
      question: "Do I need to know cloud architecture to play Failover?",
      answer:
        "No. Each service does one job, and the link rules only let you connect what makes sense. Playing teaches the rest.",
    },
    {
      question: "Why are my requests failing?",
      answer:
        "Usually there is no path for that kind of request, or a node is over capacity. Writes need a database and uploads need file storage.",
    },
    {
      question: "Is there a campaign or a daily challenge?",
      answer:
        "There is a daily challenge. The Daily Incident is the same for everyone each UTC day, and the server replays your actions before it ranks your score. There is no campaign yet.",
    },
    {
      question: "What is Failover based on?",
      answer:
        "Failover is a port of Server Survival by Kostyantyn Pshenychnyy, an open source game under the MIT license. The simulation was ported to TypeScript; the graphics, sound and words are new.",
    },
  ],
  credits: [
    {
      label: "Original game",
      detail: "Based on Server Survival by Kostyantyn Pshenychnyy (MIT)",
      href: "https://github.com/pshenok/server-survival",
    },
    {
      label: "Game",
      detail: "TypeScript port, wireframe scene and sound by Amin Dhouib",
    },
  ],
};
