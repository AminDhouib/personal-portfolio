import type { GameContent } from "./types";

export const towerStackerContent: GameContent = {
  seoTitle: "Tower Stacker: Free Online Block Stacking Game",
  seoDescription:
    "Play Tower Stacker online for free. Tap to drop a swinging block, trim the overhang and stack the tallest tower you can. One miss ends the run.",
  genre: ["Arcade", "Casual"],
  playMode: "SinglePlayer",
  intro:
    "Tower Stacker is a free one-tap stacking game drawn like a blueprint. A crane swings a block above your tower, and you tap to let it fall. Any part that hangs over the edge is sliced off, so the next block is narrower. Land one almost dead centre and it keeps its full width. Miss the tower entirely and the run is over. The game was built for this site and runs on a canvas in your browser.",
  howToPlay: [
    "Press Start to begin; the crane starts swinging at once.",
    "Watch the hanging block sweep left and right above the top floor.",
    "Tap, click, or press Space or Enter to drop it.",
    "Anything overhanging is trimmed away and falls off; the rest becomes the new top floor.",
    "Stack as many floors as you can before a block misses the tower completely.",
    "Press Play again on the game-over card for a fresh tower.",
  ],
  controls: [
    {
      input: "Mouse",
      action: "Click Start, then click anywhere on the game to drop the block.",
    },
    {
      input: "Touch",
      action:
        "Tap Start, then tap the game to drop. On a phone the game fills the screen; Exit leaves it.",
    },
    {
      input: "Keyboard",
      action: "Space or Enter drops the block while a run is live.",
    },
    {
      input: "Sound button",
      action: "Mutes or unmutes the synthesized sounds; the choice is remembered on this device.",
    },
  ],
  strategy: [
    "Aim for dead centre. A drop within a few pixels of the floor below counts as perfect and loses nothing.",
    "Chain perfects. The first scores 20, then 30, 40, 50 and 60, and the bonus stops growing at 60 per drop.",
    "Earn width back. Every third perfect in a row makes the tower a little wider again, up to the width you started with.",
    "A trimmed landing scores only 10 and breaks the chain, so a safe late drop costs more than it looks.",
    "Read the swing, not the block. The crane speeds up as the tower grows, so release a touch before it is overhead.",
  ],
  facts: [
    {
      label: "Lives",
      value: "None; the first complete miss ends the run",
    },
    {
      label: "Scoring",
      value: "10 per trimmed landing, 20 to 60 per perfect in a chain",
    },
    {
      label: "Controls",
      value: "One tap, click, Space or Enter",
    },
    {
      label: "Progress",
      value: "Not saved; every run starts fresh",
    },
    {
      label: "Pausing",
      value:
        "Pauses when the tab is hidden or the game scrolls out of view; you resume it yourself",
    },
    {
      label: "Phones",
      value: "Yes, with a full-screen play mode",
    },
  ],
  faq: [
    {
      question: "Is Tower Stacker free to play?",
      answer:
        "Yes. It runs in your browser with no download and no account, and nothing you do in it is sent anywhere.",
    },
    {
      question: "How does a run end in Tower Stacker?",
      answer:
        "A run ends when a dropped block misses the tower so badly that almost nothing overlaps the floor below. There are no lives, so the first complete miss is the last.",
    },
    {
      question: "What counts as a perfect drop?",
      answer:
        "A drop that lands within a few pixels of dead centre keeps its whole width and extends your chain. Chained perfects score more each time, and every third one widens the tower again.",
    },
    {
      question: "Can I play Tower Stacker on my phone?",
      answer:
        "Yes. Tap Start and the game opens full screen so the page cannot scroll under your thumb. Tap anywhere to drop, and use Exit to return to the page.",
    },
    {
      question: "Is this a copy of another stacking game?",
      answer:
        "No. The rules and code were written for this site, and an earlier embedded version was replaced by this one. Sound is synthesized in your browser.",
    },
  ],
  credits: [
    {
      label: "Game",
      detail: "Original game built for this site.",
    },
    {
      label: "Sound",
      detail: "Sound: synthesized in your browser with the Web Audio API; no audio files are used.",
    },
  ],
};
