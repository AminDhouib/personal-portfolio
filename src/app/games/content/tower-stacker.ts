import type { GameContent } from "./types";

export const towerStackerContent: GameContent = {
  seoTitle: "Tower Stacker: Free Online Block Stacking Game",
  seoDescription:
    "Play Tower Stacker online for free. Tap to drop swinging blocks and build the tallest tower you can. Three misses end the run. No download needed.",
  genre: ["Arcade", "Casual"],
  playMode: "SinglePlayer",
  intro:
    "Tower Stacker is a free one-tap arcade game. A crane swings a block overhead, and you tap to drop it onto the tower below. Land it well for bonus points, miss and you lose a life, and you only get three. The swing widens as the tower grows, and the tower itself starts to sway. It is a port of the open source tower_game by iamkun, with a live score display and a leaderboard.",
  howToPlay: [
    "Press Start Build to begin.",
    "Watch the block swing on its rope.",
    "Tap or click to drop it when it sits above the tower.",
    "Land blocks on the tower to keep them; a block that misses falls away and costs a life.",
    "Chain perfect drops for bigger scores.",
    "After the third miss, enter a name to submit your score.",
  ],
  controls: [
    {
      input: "Mouse",
      action: "Click Start Build, then click anywhere in the game to drop the block.",
    },
    {
      input: "Touch",
      action: "Tap Start Build, then tap anywhere in the game to drop the block.",
    },
    {
      input: "Keyboard",
      action: "Not used; the block drops only on a click or tap.",
    },
    {
      input: "Play again button",
      action: "Starts a fresh tower after game over.",
    },
  ],
  strategy: [
    "Aim for the middle. A perfect drop scores 25 plus 25 per perfect in your current chain: 50, then 75, then 100.",
    "Protect the chain. A plain landing scores 25 and resets the bonus to zero, and a miss resets it too.",
    "Bank clean landings early. The swing is narrowest for the first ten blocks and widens at ten and again at twenty.",
    "Watch the tower, not only the block. It sways sideways once five blocks have landed, and the sway grows at 13 and again at 23.",
    "Keep the tower near the centre of the screen. If it drifts toward an edge, the game switches to a faster, wider swing.",
  ],
  facts: [
    {
      label: "Lives",
      value: "3",
    },
    {
      label: "Scoring",
      value: "25 per landed block, plus 25 per perfect in a chain",
    },
    {
      label: "Controls",
      value: "One tap or click",
    },
    {
      label: "Progress",
      value: "Not saved; every run starts fresh",
    },
    {
      label: "Leaderboard",
      value: "Submit a score and see your rank; the full board is not shown",
    },
    {
      label: "Phones",
      value: "Yes, touch is supported",
    },
  ],
  faq: [
    {
      question: "Is Tower Stacker free to play?",
      answer:
        "Yes. It runs in your browser with no download and no account. You only enter a name, up to 12 characters, to submit a score.",
    },
    {
      question: "How many lives do you get in Tower Stacker?",
      answer:
        "Three. Each block that misses the tower costs one life, and the run ends on the third miss. A block that lands on the tower never costs a life.",
    },
    {
      question: "What counts as a perfect drop?",
      answer:
        "A perfect drop lands almost exactly on top of the block below. It scores 25 plus 25 times the number of perfects in your current chain. Any plain landing or miss resets the chain.",
    },
    {
      question: "Can I play Tower Stacker on my phone?",
      answer:
        "Yes. It accepts touch as well as mouse clicks, and the play area scales between 280 and 440 pixels wide. Tap Start Build, then tap anywhere to drop.",
    },
    {
      question: "Where does this tower game come from?",
      answer:
        "It is a port of tower_game by iamkun, an open source HTML5 game under the MIT licence. This site adds a new look, synthesized sound and a score panel.",
    },
  ],
  credits: [
    {
      label: "Based on",
      detail:
        "Based on tower_game by iamkun, MIT licence. Copyright (c) 2018 BMQB, Inc; the licence file ships with the game.",
      href: "https://github.com/iamkun/tower_game",
    },
    {
      label: "Sound",
      detail:
        "Music and sound effects are synthesized in your browser with the Web Audio API; the original sound files are not played.",
    },
    {
      label: "Typeface",
      detail: "JetBrains Mono, loaded from Google Fonts.",
      href: "https://www.jetbrains.com/lp/mono/",
    },
  ],
};
