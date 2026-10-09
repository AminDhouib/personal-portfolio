import type { GameContent } from "./types";

export const typingSpeedContent: GameContent = {
  seoTitle: "Typing Speed Test: Free WPM Test and Typing Game",
  seoDescription:
    "Free typing speed test with classic-book passages and a falling-words game. See net and raw WPM, accuracy and mistakes, and beat your best. No sign-up.",
  genre: ["Typing", "Skill"],
  playMode: "SinglePlayer",
  intro:
    "Typing Speed is a free typing speed test that runs in your browser. Pick a timed test of 15, 30, 60 or 120 seconds with common words or classic-book quotes, or type one quote at your own pace. Daily gives everyone the same passage for the whole UTC day, with a leaderboard. Word Rain drops words from the top, and you type them before they land. Results add a graph and a map of your missed keys. Your best timed run is saved on your device as a ghost to race.",
  howToPlay: [
    "Choose Words or Quotes and a length in the mode bar, or pick Quote for one passage.",
    "Click the text or press any key, then type. Space ends a word.",
    "A wrong letter turns red but stays inside its own word. Backspace fixes it.",
    "A timed round ends at zero. A Quote round ends on its last word.",
    "Press Tab then Enter to go again.",
    "Race your ghost: a dim marker shows where your best run stood.",
    "Pick Rain: type a falling word to clear it. A landed word costs one of three lives, and every 10 cleared start a faster wave.",
    "Pick Daily for today's shared text, then press Post to put your best on the board.",
  ],
  controls: [
    {
      input: "Keyboard",
      action: "Type the passage. Space commits a word. Backspace fixes mistakes.",
    },
    {
      input: "Ctrl or Alt + Backspace",
      action: "Clears the current word.",
    },
    {
      input: "Tab, then Enter",
      action: "Restarts in the same mode.",
    },
    {
      input: "Escape",
      action: "Restarts the round.",
    },
    {
      input: "Word Rain",
      action:
        "Type a falling word; Space or Enter clears what you typed. On a phone it plays above the keyboard.",
    },
    {
      input: "Phone",
      action:
        "Tap Start typing. The text stays above the keyboard; tap the text if the keyboard closes.",
    },
  ],
  strategy: [
    "Protect accuracy: a wrong key stays in your accuracy figure even after you fix it.",
    "Punctuation and spaces count toward WPM.",
    "Drill your most-missed keys from the key map.",
  ],
  facts: [
    {
      label: "Modes",
      value: "15, 30, 60, 120 s words or quotes, one quote, Word Rain",
    },
    {
      label: "Passages",
      value: "100+ from 18 public-domain books",
    },
    {
      label: "Score",
      value: "Net WPM, raw WPM, accuracy",
    },
    {
      label: "Progress",
      value: "Bests, key stats and a ghost per timed mode, saved on this device",
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
      question: "How are WPM and accuracy calculated in this typing test?",
      answer:
        "Net WPM, the headline figure, counts the characters of your correctly typed words and their spaces, divided by 5 and by the minutes taken. Raw WPM counts every character typed, right or wrong, the same way. Accuracy is correct keystrokes over all character and space keystrokes, and a fixed slip still costs you.",
    },
    {
      question: "What is the ghost?",
      answer:
        "Your best run in a timed mode, shown as a dim marker with a chip for how many characters you lead or trail. It lives only in your browser, one per mode, and the Ghost button turns it off.",
    },
    {
      question: "Can I paste text into the typing test?",
      answer:
        "No. Paste and drop are blocked, so every result comes from real keystrokes. A phone keyboard that inserts whole words through suggestions or autocorrect still plays, but the run never counts as a best.",
    },
    {
      question: "Does the typing game save my score?",
      answer:
        "It saves your best net WPM per mode, your Word Rain best and the keys you miss in your browser. Only the Daily text has a leaderboard, and only when you press Post. There is no account.",
    },
    {
      question: "What is the daily text?",
      answer:
        "One passage for everyone from 00:00 to 24:00 UTC, then the text and board turn over. Try as often as you like and post your best. Runs ending after midnight, or typed with phone suggestions, cannot be posted.",
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
