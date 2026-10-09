import type { GameContent } from "./types";

export const failoverContent: GameContent = {
  seoTitle: "Failover: Cloud Architecture Survival Game",
  seoDescription:
    "Play Failover free. Build a cloud from firewalls, load balancers, servers and databases, wire it to the Internet and keep it up as traffic grows.",
  genre: ["Simulation", "Strategy"],
  playMode: "SinglePlayer",
  intro:
    "Failover is a free cloud architecture game. You start with $500, an empty grid and the Internet at one edge. Traffic arrives as requests of different kinds: static files, reads, writes, uploads, searches, later some AI inference, and a steady share of malicious ones. Every request needs a path through services you build and link together. Answered requests earn money and reputation; dropped ones cost both. The traffic keeps growing, incidents strike, and the run lasts as long as your design does.",
  howToPlay: [
    "Pick a service from the Build menu and click an empty tile to place it. Each one costs money up front and upkeep while it runs.",
    "Choose Link, then click a source and a target to send traffic from one to the other. Start from the Internet; a link only goes where the request types allow.",
    "A first design that works: Internet to Firewall to Load Balancer to Compute, with a database and file storage behind Compute.",
    "Select a service to see its tier and health, and upgrade it when it runs hot.",
    "Watch money and reputation. The run ends when reputation reaches zero or the account falls $1,000 into the red.",
  ],
  controls: [
    {
      input: "Mouse",
      action:
        "Click a tile to place the armed service or pick a node, drag to pan, and use the wheel to zoom.",
    },
    {
      input: "Touch",
      action:
        "Tap to pick. A placement or a demolish asks you to confirm. Drag with two fingers to pan and pinch to zoom.",
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
    "Spread the load before it hurts. A node over capacity drops what it cannot queue, so add a Load Balancer and more Compute, or upgrade.",
    "Cache what you can. A Memory Cache in front of the database answers repeat reads cheaply, and a CDN serves static files.",
    "Keep cash for incidents. Cost spikes, traffic bursts, capacity drops and outages arrive at random.",
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
      value: "A fixed 20 steps per second of game time from a seed, so a run replays exactly",
    },
    {
      label: "In this version",
      value:
        "Survival free play. The campaign, a daily incident, saves and sharing are not in yet.",
    },
    { label: "Sound", value: "Synthesized in your browser, off until you turn it on" },
  ],
  faq: [
    {
      question: "Do I need to know cloud architecture to play Failover?",
      answer:
        "No. Each service does one job, and the link rules only let you connect what makes sense. Knowing why a load balancer sits in front of servers helps, and playing teaches it.",
    },
    {
      question: "Why are my requests failing?",
      answer:
        "Usually there is no path for that kind of request, or a node is over capacity. Writes need a database, uploads need file storage, and a busy node drops what it cannot queue.",
    },
    {
      question: "Is there a campaign or a daily challenge?",
      answer: "Not in this version, which is survival free play on a fresh board each run.",
    },
    {
      question: "What is Failover based on?",
      answer:
        "Failover is a port of Server Survival by Kostyantyn Pshenychnyy, an open source game under the MIT license. The simulation was ported to TypeScript; the graphics, the sound and the words are new.",
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
      detail: "Game: TypeScript port, wireframe scene and sound by Amin Dhouib",
    },
  ],
};
