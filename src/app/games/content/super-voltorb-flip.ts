import type { GameContent } from "./types";

export const superVoltorbFlipContent: GameContent = {
  seoTitle: "Voltorb Flip Online: Free Browser Puzzle Game",
  seoDescription:
    "Play Voltorb Flip online, free in your browser with no download. Read the row and column clues, flip every 2 and 3, dodge the Voltorbs and climb 8 levels.",
  genre: ["Puzzle", "Logic"],
  playMode: "SinglePlayer",
  intro:
    "Super Voltorb Flip is a free browser recreation of the Voltorb Flip minigame from Pokemon HeartGold and SoulSilver. Flip tiles on a 5 x 5 board to find the 2s and 3s while avoiding the Voltorbs. The clue numbers beside every row and column tell you where the danger is. Your level and coins are saved in your browser.",
  howToPlay: [
    "Read each row and column clue: the top number is its coin total, and the Voltorb icon shows its Voltorb count.",
    "Click or tap tiles to flip them. A 2 or 3 multiplies your coins for the round, and a 1 changes nothing.",
    "Flip every 2 and 3 to clear the round and bank your coins. The 1s are optional.",
    "Flip a Voltorb and the round ends with nothing banked.",
    "Use the memo buttons to tag what a tile could be.",
  ],
  controls: [
    {
      input: "Mouse",
      action: "Click a tile to flip it.",
    },
    {
      input: "Touch",
      action: "Tap a tile to flip it.",
    },
    {
      input: "Keyboard",
      action: "Arrow keys move, Enter or Space flips, and 1, 2, 3 or V marks the tile.",
    },
    {
      input: "Memo buttons (V, 1, 2, 3)",
      action:
        "Pick one, then select tiles to tag them. Pick it again or press clear to flip normally.",
    },
    {
      input: "Quit button",
      action: "Below the board while a round is live. It asks first, then banks your coins.",
    },
    {
      input: "End of a round",
      action: "Click the board, press Enter or Space, or use the Continue or Next round button.",
    },
  ],
  strategy: [
    "Start with any row or column showing 0 Voltorbs. Every tile in it is safe.",
    "A line holds 5 minus its Voltorb count safe tiles. If its coin total equals that number, they are all 1s, so skip it.",
    "Each coin above that count is a hidden multiplier: a 2 adds 1 and a 3 adds 2. With 2 Voltorbs and a total of 5, the line holds one 3 or two 2s, plus 1s.",
    "Cross-check lines. If coins plus Voltorbs in a line equal 5, its tiles are 1s or Voltorbs, so a tile there whose other line shows 0 Voltorbs is a safe 1.",
    "A shaking tile with a warning sits in a line where 75 percent or more of the unflipped tiles are Voltorbs, though not all of them. Look for a safer tile first.",
  ],
  facts: [
    {
      label: "Board",
      value: "5 x 5 tiles",
    },
    {
      label: "Levels",
      value: "8, as in HeartGold and SoulSilver",
    },
    {
      label: "Voltorbs per board",
      value: "6 on level 1, up to 13 on level 7",
    },
    {
      label: "Boards",
      value: "80 layouts, 10 per level, dealt as in the original",
    },
    {
      label: "Saves",
      value: "Level and total coins, in your browser",
    },
    {
      label: "Leaderboard",
      value: "None",
    },
    {
      label: "Phones",
      value: "Yes",
    },
  ],
  faq: [
    {
      question: "Is Voltorb Flip online free to play?",
      answer: "Yes. It is free, runs in your browser and needs no download or account.",
    },
    {
      question: "How many levels are there in Voltorb Flip?",
      answer:
        "This version has 8, as in HeartGold and SoulSilver. A cleared round moves you up one level through level 7. Reaching level 8 takes five rounds in a row without hitting a Voltorb and with at least eight tiles flipped in each, the last played on level 5 or higher.",
    },
    {
      question: "What happens when you flip a Voltorb?",
      answer:
        "The round ends and no coins are banked. Your new level is the number of tiles you flipped that round, but never below 1, never above the level you were on, and never above 7.",
    },
    {
      question: "Is there a Voltorb Flip solver?",
      answer:
        "No. This page is a game, not a solver. The strategy tips above show how to read the clues yourself.",
    },
    {
      question: "Can I stop a round and keep my coins?",
      answer:
        "Yes. Quit banks the coins you have found after you confirm. Your level then moves as it does after a loss, by the number of tiles you flipped.",
    },
  ],
  links: [
    {
      label: "Voltorb Flip solver",
      href: "/games/super-voltorb-flip/solver",
      description: "Type in a board's clue numbers and see the odds for every tile.",
    },
  ],
  credits: [
    {
      label: "Original game",
      detail:
        "Fan recreation of the Voltorb Flip minigame from Pokemon HeartGold and SoulSilver. Not affiliated with or endorsed by Nintendo, Creatures Inc. or GAME FREAK inc.",
    },
    {
      label: "Trademarks",
      detail: "Pokemon and Voltorb are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc.",
    },
    {
      label: "Code",
      detail:
        "Built on a port of voltorb-flip by João Vogler, MIT licence, copyright 2023 João Vogler. Integration and changes by Amin Dhouib.",
      href: "https://github.com/jv-vogler/voltorb-flip",
    },
    {
      label: "Pixel font",
      detail: "Pokemon DS Font by sergalbutt on FontStruct, released under CC0.",
      href: "https://fontstruct.com/fontstructions/show/1182741",
    },
    {
      label: "Music",
      detail:
        "Chiptune loops by TinyWorlds, Juhani Junkala (SubspaceAudio) and celestialghost8, all released under CC0.",
    },
    {
      label: "Sound effects and artwork",
      detail:
        "Original: the sounds are generated in your browser and the pixel art is drawn for this site. No audio or sprites from the Pokemon games are used.",
    },
  ],
};
