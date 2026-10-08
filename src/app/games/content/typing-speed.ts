import type { GameContent } from "./types";

export const typingSpeedContent: GameContent = {
  seoTitle: "Typing Speed Test: Free WPM Test and Typing Game",
  seoDescription:
    "Free typing speed test with passages from classic books. See net and raw WPM, accuracy and mistakes, and beat your best. No download, no sign-up.",
  genre: ["Typing", "Skill"],
  playMode: "SinglePlayer",
  intro:
    "Typing Speed is a free typing speed test that runs in your browser. Each round gives you one passage from a classic public-domain book, a few sentences long. The clock starts on your first keystroke and stops on your last. You then see your net WPM, raw WPM, accuracy, best streak and how many mistakes you made and how many were left. Your best net WPM is saved on your device, so you can try to beat it with the next passage.",
  howToPlay: [
    "Click Start typing, click the text, or just press any key.",
    "Read the passage, then type it word by word. Press Space to move to the next word.",
    "A wrong letter turns red but stays inside its own word, so one slip never ruins the rest of the line. Backspace fixes it.",
    "Finish the last word correctly to end the round.",
    "Check your net WPM, raw WPM, accuracy and mistakes on the result card, then click Next passage or Again.",
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
      input: "Escape",
      action: "Restarts the current passage while you are playing.",
    },
    {
      input: "Mouse",
      action: "Click Start typing, Skip for a different passage, or Next passage and Again.",
    },
    {
      input: "Phone",
      action: "Tap Start typing to open the on-screen keyboard. Tap the passage to bring it back.",
    },
  ],
  strategy: [
    "Read the whole passage before your first key. The clock does not run while you read.",
    "Protect accuracy. Every wrong key stays in your accuracy figure even after you fix it, so slow down a little rather than correct a lot.",
    "Punctuation and spaces count as characters in your WPM, so do not rush past commas and full stops.",
    "Watch the flame counter. It appears at 5 correct keystrokes in a row, a burst fires every 10, and one wrong key resets it to zero.",
    "If a passage has awkward words for you, press Skip and take a different one.",
  ],
  facts: [
    {
      label: "Round",
      value: "One passage per round",
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
      value: "Best net WPM saved on this device",
    },
    {
      label: "Leaderboard",
      value: "None",
    },
    {
      label: "Phones",
      value: "Yes, with the on-screen keyboard",
    },
  ],
  faq: [
    {
      question: "How is WPM calculated in this typing test?",
      answer:
        "Net WPM, the headline figure, counts the characters of the words you typed correctly, each with its following space, divided by 5 and by the minutes you took. Raw WPM counts every character you typed, right or wrong, the same way. The clock runs from your first keystroke to your last, and both figures are rounded to whole numbers.",
    },
    {
      question: "How is typing accuracy calculated?",
      answer:
        "Accuracy is your correct keystrokes divided by all character and space keystrokes, rounded to the nearest percent. Backspaces are not counted, and correcting a mistake does not remove it from the total, so a fixed slip still costs you. The result card also lists the mistakes you typed and the mistakes left in the final text.",
    },
    {
      question: "Can I paste text into the typing test?",
      answer:
        "No. Paste, drag and drop are blocked, so every result comes from real keystrokes. If your phone keyboard inserts a whole word at once through suggestions or autocorrect, the run still plays but is marked as such and never counts as a best.",
    },
    {
      question: "Does the typing game save my score?",
      answer:
        "It saves your best net WPM in your browser on that device. There is no leaderboard and no account, and clearing your browser data removes the saved best.",
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
