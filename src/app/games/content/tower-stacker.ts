import type { GameContent } from "./types";

export const towerStackerContent: GameContent = {
  seoTitle: "Tower Stacker: Free Online Block Stacking Game",
  seoDescription:
    "Play Tower Stacker online for free. Tap to drop a swinging block, trim the overhang and stack the tallest tower you can. One miss ends the run.",
  genre: ["Arcade", "Casual"],
  playMode: "SinglePlayer",
  intro:
    "Tower Stacker is a free one-tap stacking game drawn like a blueprint. A crane swings a block above your tower, and you tap to let it fall. Any overhang is sliced off, so the next block is narrower, but a near-perfect landing keeps its full width. Miss the tower and the run is over. Each day has one shared tower, the same for everyone, and its scores are ranked. A free build is a random practice tower.",
  howToPlay: [
    "Pick Today's tower, the shared daily one, or Free build for a random practice tower.",
    "Press Start to begin; the crane starts swinging at once.",
    "Watch the hanging block sweep left and right above the top floor.",
    "Tap, click, or press Space or Enter to drop it.",
    "Anything overhanging is trimmed away and falls off; the rest becomes the new top floor.",
    "Stack as many floors as you can before a block misses the tower completely.",
    "On the game-over card, add a name and Submit a daily result to the board, or press Play again.",
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
      label: "Daily tower",
      value: "One tower per UTC day, the same for everyone; it resets at 00:00 UTC",
    },
    {
      label: "Leaderboard",
      value: "Today's tower ranks daily, weekly and all time",
    },
    {
      label: "Streak",
      value: "Consecutive UTC days with a daily run, kept on this device",
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
        "Yes. It runs in your browser with no download and no account. Only a daily result you choose to submit is sent; free builds stay on your device.",
    },
    {
      question: "How does a run end in Tower Stacker?",
      answer:
        "A run ends when a dropped block misses the tower almost completely. There are no lives.",
    },
    {
      question: "What counts as a perfect drop?",
      answer:
        "A drop within a few pixels of dead centre keeps its whole width and extends your chain. Chained perfects score more, and every third widens the tower again.",
    },
    {
      question: "Can I play Tower Stacker on my phone?",
      answer:
        "Yes. Tap Start and the game opens full screen. Tap anywhere to drop, and use Exit to return to the page.",
    },
    {
      question: "Is there a daily challenge?",
      answer:
        "Yes. Today's tower is the same for every player and changes at 00:00 UTC. Submit a result to rank on the daily, weekly and all-time boards. A run that crosses midnight cannot be submitted, because the board has moved on.",
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
