import type { FaqEntry } from "@/data/faq";

// The solver page's copy and FAQ as data. Server-safe (no component imports);
// every claim must be true of src/components/game/super-voltorb-flip/solver.ts.

export const SOLVER_PATH = "/games/super-voltorb-flip/solver";
export const GAME_PATH = "/games/super-voltorb-flip";

export const SOLVER_TITLE = "Voltorb Flip Solver: Tile Odds From Your Clues";
export const SOLVER_DESCRIPTION =
  "Free Voltorb Flip solver. Enter the row and column clues from your board and see the exact Voltorb odds for every tile, plus the safest tile to flip next.";

export const SOLVER_INTRO =
  "Type the ten clue pairs from your Voltorb Flip board and this solver shows, for every tile, the chance it is a Voltorb, a 1, a 2 or a 3. It marks the tiles that are safe, the tiles that can only be a 1 or a Voltorb, and the best tile to flip next. It runs in your browser and nothing you type is sent anywhere.";

export const SOLVER_DISCLAIMER =
  "Fan recreation of the Voltorb Flip minigame from Pokemon HeartGold and SoulSilver. Not affiliated with or endorsed by Nintendo, Creatures Inc. or GAME FREAK inc.";

export interface SolverSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export const SOLVER_SECTIONS: SolverSection[] = [
  {
    heading: "How to use the solver",
    list: [
      "Type each row's coin total and Voltorb count into the two boxes at the end of that row, and each column's into the two boxes under it. The top box is the coin total and the bottom box is the Voltorb count.",
      "Pick your level if you know it. Leave it on Not sure otherwise.",
      "Tap a tile you have already flipped to enter its number. Tapping again steps it through 1, 2, 3 and back to face down.",
      "Once all ten clues are in, the grid shows each tile's chance of hiding a Voltorb, with the safest useful tile marked Flip next.",
    ],
  },
  {
    heading: "How to read the clues",
    paragraphs: [
      "The top number of a clue is the sum of the coin tiles in that line, and the bottom number counts the Voltorbs in it.",
    ],
    list: [
      "A line with 0 Voltorbs is safe to flip all the way.",
      "When a line's coins plus its Voltorbs equal 5, the line holds only 1s and Voltorbs, so it has nothing worth flipping.",
      "When a line has one Voltorb and its coins are 4, every other tile in it is a 1.",
      "A column's clue and a row's clue together narrow a tile far more than either does alone, which is what the solver works out for all twenty-five tiles at once.",
    ],
  },
  {
    heading: "Why the odds are exact",
    paragraphs: [
      "The solver lists every arrangement of Voltorbs, 1s, 2s and 3s that fits all ten clues at once, along with any tiles you have flipped. A tile shown as 0% cannot be a Voltorb in any of those arrangements, so, given the clues you entered, it is safe.",
    ],
  },
  {
    heading: "How the game deals boards",
    paragraphs: [
      "Each level picks one of ten fixed board recipes, which say how many Voltorbs, 2s and 3s the board gets. The game also deals a board again when it gives away too many multipliers in lines that have no Voltorb.",
      "The solver weights every arrangement by how likely the game is to deal it, using the 80 recipes and the re-deal rule from the HeartGold and SoulSilver code, so its odds match the real game instead of treating every arrangement as equally likely. If your clues fit no recipe, which can be a typo or a board from a different game, it says so and counts every arrangement equally.",
    ],
  },
  {
    heading: "A strategy that works",
    list: [
      "Flip every safe tile first.",
      "Then flip the tiles the solver marks as possible 2s or 3s, starting with the lowest Voltorb odds.",
      "Ignore tiles that can only be a 1 or a Voltorb.",
      "Quit to bank your coins when every remaining choice is risky.",
    ],
  },
];

export const SOLVER_FAQ: FaqEntry[] = [
  {
    question: "Is this Voltorb Flip solver free?",
    answer:
      "Yes. It is free, needs no account, and runs entirely in your browser. Nothing you enter is stored or sent to a server.",
  },
  {
    question: "Does it work for HeartGold and SoulSilver?",
    answer:
      "Yes. It is built from those games' board rules: the ten board recipes per level and the re-deal rule for boards that give away too many free multipliers.",
  },
  {
    question: "Why does a tile say less than 1% instead of 0%?",
    answer:
      "Because a Voltorb is still possible there. The solver only shows 0% when no arrangement that fits your clues puts a Voltorb on that tile, and it never rounds a possible Voltorb down to 0%.",
  },
  {
    question: "What does the level setting change?",
    answer:
      "It limits the board recipes to that level's ten. Not sure uses all 80 recipes, so more boards are possible and the odds spread out more.",
  },
  {
    question: "Why does it say the clues do not fit?",
    answer:
      "Either a line's coins cannot fit its Voltorb count, or the row and column totals disagree, or a tile you marked as flipped contradicts the clues. Check the numbers for a typo.",
  },
];
