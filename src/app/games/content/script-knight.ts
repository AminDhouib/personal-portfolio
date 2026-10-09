import type { GameContent } from "./types";

export const scriptKnightContent: GameContent = {
  seoTitle: "Script Knight: Learn JavaScript With a Tower Game",
  seoDescription:
    "Play Script Knight free. Write JavaScript to guide a knight up a tower, fight sludge, free captives and reach the stairs, then watch your code replay.",
  genre: ["Puzzle", "Educational"],
  playMode: "SinglePlayer",
  intro:
    "Script Knight is a free coding game where you never touch the knight. You write a JavaScript class called Player, press Run, and the knight does exactly what your code says, one action per turn. Each floor is a small puzzle: a corridor, a few monsters, maybe a captive to rescue, and a staircase to reach. Your code runs in a sandbox in your browser, and the run is replayed on a wireframe floor.",
  howToPlay: [
    "Read the floor briefing and the abilities this floor gives the knight.",
    "Write a playTurn method in the editor. It is called once per turn and may do one action, such as walk, attack, rest or rescue.",
    "Use senses, such as feel and health, to decide before you act.",
    "Press Run. The whole run is played out in the sandbox, then replayed for you.",
    "Step or scrub through the replay and read the event log.",
    "Reach the stairs to pass the floor and open the next one. Nine floors make a tower.",
  ],
  controls: [
    {
      input: "Editor",
      action:
        "Type your Player class. Tab inserts two spaces; press Escape, then Tab, to move focus out of the editor.",
    },
    {
      input: "Ctrl or Cmd + Enter",
      action: "Runs your code from inside the editor.",
    },
    {
      input: "Space",
      action: "Plays or pauses the replay when you are not typing in a field.",
    },
    {
      input: "Transport buttons",
      action: "Restart, step, play and skip to the end, with a speed choice.",
    },
    {
      input: "Sound button",
      action: "Mutes or unmutes the sounds; remembered on this device.",
    },
  ],
  strategy: [
    "Sense before you act. Looking ahead costs nothing, and many floors only need a check before each step.",
    "Rest when you are hurt and nothing is in reach; health is what keeps a run alive.",
    "Write for the general case. Epic mode runs the same code through all nine floors in a row, so code that only works for one map will fail.",
    "Use think to print values into the event log when your code misbehaves.",
    "Watch the turn budget. A run ends after 200 turns, and a faster clear scores better.",
  ],
  facts: [
    { label: "Language", value: "JavaScript" },
    { label: "Floors", value: "Nine in The Narrow Path, then nine more in Powder Keep" },
    { label: "Turn limit", value: "200 turns per run" },
    { label: "Code time limit", value: "A quarter of a second per turn, five seconds per run" },
    { label: "Where your code runs", value: "In a Web Worker in your browser, never on a server" },
    { label: "Saved on this device", value: "Your code, your progress and your best grades" },
  ],
  faq: [
    {
      question: "Do I need to know JavaScript to play Script Knight?",
      answer:
        "A little helps. The first floors need one method and a call or two, and each floor lists its abilities, so you can learn by trying things and reading the replay.",
    },
    {
      question: "Is my code sent anywhere, and what if it loops forever?",
      answer:
        "No. Your code runs in a sandboxed Web Worker in your own browser and is saved only on your device. The sandbox stops a turn that takes over a quarter of a second, or a run over five seconds, and tells you which turn was cut off.",
    },
    {
      question: "Can I use TypeScript?",
      answer:
        "Not yet. Script Knight takes JavaScript only. TypeScript would have to be turned into JavaScript first, which adds nothing a JavaScript player cannot do and would make error line numbers point at the wrong line.",
    },
    {
      question: "What is epic mode?",
      answer:
        "After you clear floor 9 of a tower, epic mode runs the same code through all nine floors in a row with every ability, and grades each floor and the average.",
    },
    {
      question: "How are floors scored?",
      answer:
        "A pass earns points from the knight, a time bonus and a clear bonus. The score becomes a grade from F to S, and your best is kept for each floor.",
    },
  ],
  credits: [
    {
      label: "Engine and towers",
      detail: "Ported from WarriorJS by Matias Olivera (MIT)",
      href: "https://github.com/olistic/warriorjs",
    },
    {
      label: "Original idea",
      detail: "Original idea: ruby-warrior by Ryan Bates (MIT)",
      href: "https://github.com/ryanb/ruby-warrior",
    },
    {
      label: "Game",
      detail: "Game: sandbox, renderer and stage by Amin Dhouib",
    },
  ],
};
