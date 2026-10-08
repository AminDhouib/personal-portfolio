import type { GameContent } from "./types";

export const typingSpeedContent: GameContent = {
  seoTitle: "Typing Speed Test: Free WPM Test and Typing Game",
  seoDescription:
    "Free typing speed test with passages from classic books. See net and raw WPM, accuracy and mistakes, and beat your best. No download, no sign-up.",
  genre: ["Typing", "Skill"],
  playMode: "SinglePlayer",
  intro:
    "Typing Speed is a free typing speed test that runs in your browser. Pick a timed test of 15, 30, 60 or 120 seconds with common words or classic-book quotes, or type a single quote at your own pace. Daily gives everyone the same passage for the whole UTC day, with a leaderboard. The clock starts on your first keystroke, and the result card adds a graph and a map of the keys you miss most. Your best net WPM for each mode is saved on your device.",
  howToPlay: [
    "Choose Words or Quotes and a length in the mode bar, or pick Quote for one passage.",
    "Click the text or press any key, then type. Space moves to the next word.",
    "A wrong letter turns red but stays inside its own word, so one slip never ruins the rest of the line. Backspace fixes it.",
    "In a timed mode the round ends when the countdown hits zero. In Quote mode, finish the last word.",
    "Check your net WPM, raw WPM, accuracy, graph and key map, then press Tab and Enter to go again.",
    "Pick Daily for today's shared text. Try as often as you like, then press Post to put your best on the board.",
  ],
  controls: [
    {
      input: "Keyboard",
      action: "Type the passage. Space commits a word. Backspace fixes mistakes.",
    },
    {
      input: "Ctrl or Alt + Backspace",
      action: "Clears the word you are typing.",
    },
    {
      input: "Enter, or Tab then Enter",
      action: "Enter focuses the typing area. Tab then Enter restarts in the same mode.",
    },
    {
      input: "Escape",
      action: "Restarts the current round while you are playing.",
    },
    {
      input: "Mouse",
      action: "Click the mode bar, Restart, or Skip for a different quote.",
    },
    {
      input: "Phone",
      action:
        "Tap Start typing. The text stays above the keyboard; tap the text if the keyboard closes.",
    },
  ],
  strategy: [
    "Protect accuracy. Every wrong key stays in your accuracy figure even after you fix it, so slow down a little rather than correct a lot.",
    "Punctuation and spaces count toward WPM, so do not rush past commas and full stops.",
    "After a run, open the key map. Your most-missed keys are the ones to drill.",
  ],
  facts: [
    {
      label: "Modes",
      value: "15, 30, 60, 120 s words or quotes, single quote",
    },
    {
      label: "Passages",
      value: "100+ from 18 public-domain books",
    },
    {
      label: "Score",
      value: "Net WPM, raw WPM, accuracy and mistakes",
    },
    {
      label: "Progress",
      value: "Best net WPM per mode and key stats saved on this device",
    },
    {
      label: "Leaderboard",
      value: "Daily text, by net WPM (UTC)",
    },
    {
      label: "Phones",
      value: "Yes, the text stays above the keyboard",
    },
  ],
  faq: [
    {
      question: "How is WPM calculated in this typing test?",
      answer:
        "Net WPM, the headline figure, counts the characters of your correctly typed words and their spaces, divided by 5 and by the minutes taken. Raw WPM counts every character typed, right or wrong, the same way.",
    },
    {
      question: "How is typing accuracy calculated?",
      answer:
        "Accuracy is your correct keystrokes divided by all character and space keystrokes. Backspaces are not counted, and a fixed slip still costs you.",
    },
    {
      question: "Can I paste text into the typing test?",
      answer:
        "No. Paste and drop are blocked, so every result comes from real keystrokes. A phone keyboard that inserts whole words through suggestions or autocorrect still plays, but the run never counts as a best.",
    },
    {
      question: "Does the typing game save my score?",
      answer:
        "It saves your best net WPM for each mode, plus which keys you miss, in your browser. Only the Daily text has a leaderboard, and a result reaches it only when you press Post. There is no account.",
    },
    {
      question: "What is the daily text?",
      answer:
        "One passage for everyone from 00:00 to 24:00 UTC, when the text and the board turn over. Try as often as you like and post your best. A run ending after midnight cannot be posted, and neither can one typed with phone suggestions or autocorrect.",
    },
  ],
  credits: [
    {
      label: "Game",
      detail: "Built by Amin Dhouib. The game logic is part of this site's own source.",
    },
    {
      label: "Passages",
      detail:
        "Short excerpts from 18 public domain books, including Pride and Prejudice, Moby Dick, Frankenstein and Dracula, normalized to plain ASCII. The common-word list is derived from the same books. Texts come from Project Gutenberg, cited as the source. Full list in the NOTICE file.",
      href: "https://github.com/AminDhouib/personal-portfolio/blob/main/NOTICE",
    },
    {
      label: "Libraries",
      detail: "Animation by Framer Motion (MIT) and icons by Lucide (ISC).",
    },
  ],
};
