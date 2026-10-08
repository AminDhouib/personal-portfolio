import type { GameContent } from "./types";

export const passwordGameContent: GameContent = {
  seoTitle: "Password Game Online: The Password Game 2",
  seoDescription:
    "Play The Password Game 2 online, free. A five-act sign-up form where rules stack, creatures move in and the form fights back. Race the daily seed.",
  genre: ["Puzzle", "Typing", "Arcade"],
  playMode: "SinglePlayer",
  intro:
    "The Password Game 2 is a free browser game about signing up for an account. You type a password while rules appear one at a time and stack up. Across five acts the form adds creatures to keep alive, spreading corruption, arcade invaders and fake pop-ups, then a three-part finale. Your run time is your score, and every run has a seed you can share or race.",
  howToPlay: [
    "Choose Start today's daily or Random seed, then type in the password box.",
    "Satisfy the newest rule; the next one appears once the earlier rules pass.",
    "Click the widgets on rule cards: a CAPTCHA grid, toggles, a chess board and color swatches.",
    "Handle events as they arrive by clicking, typing or tending creatures.",
    "In Act 3, click Create account once every rule is green, then beat the three finale phases.",
    "Post your time to the leaderboard from the receipt.",
  ],
  controls: [
    {
      input: "Keyboard",
      action: "Type; Backspace, Delete, arrow keys, Home and End edit the password.",
    },
    {
      input: "Mouse",
      action: "Click letters to move the cursor, plus widgets, creature buttons and banners.",
    },
    {
      input: "Touch",
      action: "Tap the same targets; tap the password box to open your on-screen keyboard.",
    },
    {
      input: "Seed chip",
      action: "Click it to copy a link that replays your seed.",
    },
    {
      input: "Sound button",
      action:
        "Sound is on once you start a run; use the speaker button to mute it. The choice is remembered.",
    },
  ],
  strategy: [
    "Recheck every rule after each event. Events delete, rewrite and add letters, so a green rule can turn red.",
    "Watch your digits. The digit-sum rule counts every digit, including the clock time and chess move you add later.",
    "If a fish, campfire or garden moves in, tend it. Feed Gerald within 60 seconds and keep the fire above 25 fuel; survivors help in the finale.",
    "In Act 3 the password must stay under a seeded cap of 116 to 132 characters, so do not pad it.",
    "The CAPTCHA rejects your first correct answer on purpose, and switching one consent toggle off can flip another. Stay calm.",
  ],
  facts: [
    {
      label: "Acts",
      value: "5: Prologue, Acts 1 to 3, Finale",
    },
    {
      label: "Rules",
      value: "19 core rules, plus some added by events",
    },
    {
      label: "Events",
      value: "12 possible, 8 to 10 per run",
    },
    {
      label: "Score",
      value: "Finish time; lower is better",
    },
    {
      label: "Leaderboard",
      value: "Per seed and daily; name only",
    },
    {
      label: "Best on",
      value: "Desktop, playable on phones",
    },
  ],
  faq: [
    {
      question: "Is The Password Game 2 free to play?",
      answer:
        "Yes. It runs in your browser with no download and no account. The leaderboard asks only for a display name of up to 16 characters; blank posts as Anonymous.",
    },
    {
      question: "Is this the same as neal.fun's Password Game?",
      answer:
        "No. It is an independent sequel-style homage, not affiliated with neal.fun. It keeps the idea of stacking password rules and adds five acts, creatures, arcade-style invasions and a finale.",
    },
    {
      question: "How does the daily password game work?",
      answer:
        "Start today's daily and the seed comes from the UTC calendar day, so everyone on that day gets the same puzzles and events. The board resets at 00:00 UTC and lists that day's fastest runs.",
    },
    {
      question: "Can I play the Password Game 2 on my phone?",
      answer:
        "Yes. On a phone the run opens in a full-screen play sheet that stays above the on-screen keyboard, so the password box and the rule you are working on stay in view. Tap the box to type, and the action buttons are large touch targets. A physical keyboard on desktop is still the fastest way to play.",
    },
    {
      question: "How long does a run take?",
      answer:
        "Longer than a quick puzzle. Events arrive on a schedule, and sooner once you have solved an act's rules. A reload ends the run.",
    },
  ],
  credits: [
    {
      label: "Inspired by",
      detail:
        "Inspired by The Password Game by Neal Agarwal (neal.fun/password-game). This is an independent sequel-style homage, not affiliated with neal.fun.",
      href: "https://neal.fun/password-game/",
    },
    {
      label: "Chess puzzles",
      detail:
        "The chess rule uses the daily puzzle from Lichess, fetched through its public API and cached for up to 12 hours.",
      href: "https://lichess.org/",
    },
    {
      label: "Wordle answer",
      detail:
        "The Wordle rule uses that day's Wordle answer, with a built-in word list as a fallback. Wordle is owned by The New York Times; this site is not affiliated.",
      href: "https://www.nytimes.com/games/wordle/index.html",
    },
    {
      label: "Countries",
      detail:
        "Country names come from the mledoze/countries dataset (ODbL 1.0), copied into this site's source.",
      href: "https://github.com/mledoze/countries",
    },
    {
      label: "Chess engine",
      detail: "Chess moves are checked with chess.js (BSD licence) by Jeff Hlywa.",
      href: "https://github.com/jhlywa/chess.js",
    },
    {
      label: "Sound",
      detail:
        "All sound is synthesized in your browser with the Web Audio API; there are no audio files.",
    },
  ],
};
