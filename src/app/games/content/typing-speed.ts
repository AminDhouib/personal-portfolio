import type { GameContent } from "./types";

export const typingSpeedContent: GameContent = {
  seoTitle: "Typing Speed Test: Free WPM Test and Typing Game",
  seoDescription:
    "Free typing speed test with passages from classic books. See net and raw WPM, accuracy and mistakes, and beat your best. No download, no sign-up.",
  genre: ["Typing", "Skill"],
  playMode: "SinglePlayer",
  intro:
    "Typing Speed is a free typing speed test that runs in your browser. Pick a timed test of 15, 30, 60 or 120 seconds with common words or classic-book quotes, or type a single quote at your own pace. The clock starts on your first keystroke. A live graph tracks your speed as you go, and the result card adds a map of the keys you miss most. Your best net WPM for each mode is saved on your device.",
  howToPlay: [
    "Choose Words or Quotes and a length in the mode bar, or pick Quote for one passage.",
    "Click the text or press any key, then type. Space moves to the next word.",
    "A wrong letter turns red but stays inside its own word, so one slip never ruins the rest of the line. Backspace fixes it.",
    "In a timed mode the round ends when the countdown hits zero. In Quote mode, finish the last word.",
    "Check your net WPM, raw WPM, accuracy, graph and key map, then press Tab and Enter to go again.",
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
      input: "Enter",
      action: "Focuses the typing area from the start screen.",
    },
    {
      input: "Tab then Enter",
      action: "Tab moves focus to Restart and Enter restarts in the same mode.",
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
    "Watch the flame counter. It appears at 5 correct keystrokes in a row, and one wrong key resets it to zero.",
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
      value: "None",
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
        "Net WPM, the headline figure, counts the characters of the words you typed correctly, each with its following space, divided by 5 and by the minutes you took. Raw WPM counts every character you typed, right or wrong, the same way.",
    },
    {
      question: "How is typing accuracy calculated?",
      answer:
        "Accuracy is your correct keystrokes divided by all character and space keystrokes. Backspaces are not counted, and correcting a mistake does not remove it from the total, so a fixed slip still costs you.",
    },
    {
      question: "Can I paste text into the typing test?",
      answer:
        "No. Paste, drag and drop are blocked, so every result comes from real keystrokes. If your phone keyboard inserts a whole word at once through suggestions or autocorrect, the run still plays but is marked as such and never counts as a best.",
    },
    {
      question: "Which test length should I pick?",
      answer:
        "Start with 30 seconds for a fair read of your speed. Use 15 to warm up, 60 or 120 to see how well you hold pace, and Quote for real prose.",
    },
    {
      question: "Does the typing game save my score?",
      answer:
        "It saves your best net WPM for each mode, plus which keys you miss, in your browser on that device. There is no leaderboard and no account, and clearing your browser data removes it.",
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
