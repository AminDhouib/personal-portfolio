import type { GameContent } from "./types";

export const hextrisContent: GameContent = {
  seoTitle: "Hextris Online: Free Hexagon Puzzle Game",
  seoDescription:
    "Play Hextris free in your browser: rotate the hexagon, match 3 or more colored blocks, chain combos and keep every side clear. No download needed.",
  genre: ["Puzzle", "Arcade"],
  playMode: "SinglePlayer",
  intro:
    "Hextris is a fast hexagon puzzle game that runs in your browser. Colored blocks fall toward a central hexagon from six directions. You rotate the hexagon to catch each block on the side you want, then match three or more of the same color to clear them. Clears build combos and a momentum meter, and the play area slowly tightens, so every minute you last is harder than the one before.",
  howToPlay: [
    "Click, tap or press Space, Enter, an arrow key or A, S, D to start.",
    "Rotate the hexagon with the arrow keys or A and D, or tap the left or right half of the screen.",
    "Catch each falling block on a side that already holds blocks of its color.",
    "Match three or more connected blocks of one color to clear them and score.",
    "Clear again quickly to raise your combo multiplier.",
    "Keep every side below the outer ring, because one overfull side ends the run.",
  ],
  controls: [
    {
      input: "Left arrow or A",
      action: "Rotate left",
    },
    {
      input: "Right arrow or D",
      action: "Rotate right",
    },
    {
      input: "Down arrow or S (hold)",
      action: "Make blocks fall four times faster",
    },
    {
      input: "Space or P",
      action: "Pause or resume",
    },
    {
      input: "F",
      action: "Panic Clear when the momentum meter is full",
    },
    {
      input: "Click or tap the left or right half",
      action: "Rotate left or right",
    },
  ],
  strategy: [
    "Matches are connected groups, and they can cross into a neighboring side. Stack the same color next to itself to let groups join.",
    "Each clear scores the number of blocks squared, times your combo. Five blocks at 2x is 50 points, so bigger groups pay far more than several small ones.",
    "Bombs appear once you have reached a 3x combo, and rainbow blocks at 5x. A rainbow matches any color, and a bomb in a match wipes its whole side.",
    "The momentum meter fills as you clear. At 100 percent, Panic Clear removes every block for 30 points each, so save it for a crisis.",
    "After your first rotation the limit shrinks by one block every 60 seconds, from 12 down to 4. A countdown warns you ten seconds before.",
  ],
  facts: [
    {
      label: "Board",
      value: "6 sides and 4 block colors",
    },
    {
      label: "Match rule",
      value: "3 or more connected blocks of one color",
    },
    {
      label: "Stack limit",
      value: "12 blocks per side, shrinking to 4",
    },
    {
      label: "Saves",
      value: "Your best 3 scores stay in your browser",
    },
    {
      label: "Leaderboard",
      value: "Optional; top 8 shown after a run",
    },
    {
      label: "Phones",
      value: "Yes, touch controls and fullscreen play",
    },
  ],
  faq: [
    {
      question: "Is Hextris free to play?",
      answer: "Yes. It is free, runs in your browser and needs no download or account.",
    },
    {
      question: "How do you play Hextris on a phone?",
      answer:
        "Tap the left half of the screen to rotate left and the right half to rotate right. On touch devices the game goes fullscreen when a run starts, and the fullscreen button exits it.",
    },
    {
      question: "How does scoring work in Hextris?",
      answer:
        "Each clear scores the number of blocks squared, multiplied by your combo. Emptying the whole board with a clear of 10 or more blocks adds a Clean Sweep bonus of 1,000 times your combo.",
    },
    {
      question: "What ends a Hextris run?",
      answer:
        "A run ends when any one side holds more blocks than the current limit. The limit starts at 12 and tightens by one every 60 seconds once you start rotating, down to a minimum of 4.",
    },
  ],
  credits: [
    {
      label: "Based on",
      detail:
        "Based on Hextris by Logan Engstrom, Garrett Finucane, Noah Moroze and Michael Yang, licensed GPL-3.0.",
      href: "https://github.com/Hextris/hextris",
    },
    {
      label: "Licence",
      detail:
        "This modified Hextris is licensed GPL-3.0 and comes with no warranty. Source code for this version.",
      href: "https://github.com/AminDhouib/personal-portfolio/tree/main/src/components/game/hextris",
    },
  ],
};
