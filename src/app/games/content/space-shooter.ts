import type { GameContent } from "./types";

export const spaceShooterContent: GameContent = {
  seoTitle: "Orbital Dodge: Free 3D Asteroid Dodging Game",
  seoDescription:
    "Play Orbital Dodge free in your browser: steer a 3D ship through an asteroid field, dodge, shoot, fight bosses and unlock ships. Mouse, keys or touch.",
  genre: ["Arcade", "Shooter"],
  playMode: "SinglePlayer",
  intro:
    "Orbital Dodge is a free 3D arcade game that runs in your browser. You fly a ship through an endless asteroid field. The cannons fire on their own, so your job is to steer: line up rocks to shoot, weave around the rest, and grab coins and power-ups. Bosses appear later in a run. Between runs you spend coins in a shop. The game needs WebGL.",
  howToPlay: [
    "Press Play, then steer with your mouse, WASD, the arrow keys or your finger.",
    "Slide under asteroids so the automatic cannons break them for points and coins.",
    "Dodge everything you cannot shoot, because one hit ends the run unless a shield protects you.",
    "Fly into power-ups for a shield, triple shot, rapid fire, plasma, warp drive or a coin magnet.",
    "When the run ends, enter a pilot name to submit your score, or fly again.",
    "After your first run, open the Shop and spend your coins.",
  ],
  controls: [
    {
      input: "Mouse",
      action: "Move the pointer over the game to steer",
    },
    {
      input: "WASD or arrow keys",
      action: "Move the ship",
    },
    {
      input: "Double-tap A / D or Left / Right",
      action: "Dash sideways, untouchable, 2 second cooldown",
    },
    {
      input: "Touch: drag",
      action: "Steer the ship with your finger",
    },
    {
      input: "Touch: tap far from the ship",
      action: "Dash toward the tap",
    },
    {
      input: "Pause button",
      action: "Pause the run; switching tabs also pauses",
    },
  ],
  strategy: [
    "Cannons fire straight ahead, so slide under the rock you want to hit. Kills in a row build a combo: 1.5x at 3, 2x at 5, 3x at 10, 5x at 20 and 10x at 40.",
    "A combo resets after four seconds without a kill. The Combo Sustain upgrade adds a second per level.",
    "Skim past an asteroid without touching it for 15 bonus points.",
    "From about 20 seconds in, walls of asteroids with a gap appear. Bullets do nothing to walls, so head for the gap early.",
    "You start with 500 coins. Level 1 of any upgrade costs 100.",
  ],
  facts: [
    {
      label: "Run",
      value: "Endless; one hit ends it unless protected",
    },
    {
      label: "Bosses",
      value: "8 boss types, the first at 1,500 m",
    },
    {
      label: "Shop",
      value: "5 upgrades, 6 consumables, 5 ships, 13 cosmetics",
    },
    {
      label: "Saves",
      value: "Coins and unlocks save in your browser",
    },
    {
      label: "Leaderboard",
      value: "Top 8 pilots shown after each run",
    },
    {
      label: "Requires",
      value: "A browser with WebGL",
    },
  ],
  faq: [
    {
      question: "Is Orbital Dodge free?",
      answer:
        "Yes. It is free to play in your browser, with no download and no account. Coins are earned in the game.",
    },
    {
      question: "Can I play Orbital Dodge on my phone?",
      answer:
        "Yes. Drag a finger to steer and tap far from the ship to dash. The game still needs WebGL.",
    },
    {
      question: "Why does Orbital Dodge need WebGL?",
      answer:
        "The game is a 3D scene drawn with three.js, which needs WebGL. If it is off, you see a message instead of the game. Try another browser or turn on hardware acceleration.",
    },
    {
      question: "How do I unlock new ships?",
      answer:
        "Finish one run, then open the Shop and its Ships tab. The Falcon is free. The Juggernaut costs 5,000 coins, the Phantom 8,000, the Scavenger 12,000 and the Void Prototype 20,000.",
    },
    {
      question: "Does Orbital Dodge save my progress?",
      answer:
        "Coins, upgrades, ships and trophies are stored in your browser. Clearing site data resets them. Scores reach the leaderboard only when you press Submit.",
    },
  ],
  credits: [
    {
      label: "Game design and code",
      detail: "First-party game by Amin Dhouib.",
      href: "https://amindhou.com",
    },
    {
      label: "Built with",
      detail: "three.js and React Three Fiber draw the 3D scene.",
      href: "https://threejs.org",
    },
    {
      label: "Audio",
      detail:
        "Music and sound effects are generated in your browser with the Web Audio API; no audio files are used.",
    },
  ],
};
