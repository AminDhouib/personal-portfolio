import type { GameContent } from "./types";

export const typingSpeedContent: GameContent = {
  seoTitle: "Typing Speed Test: Free WPM Test and Typing Game",
  seoDescription:
    "Free typing speed test and typing game in your browser. Type one sentence, get your WPM and accuracy, and beat your best. No download, no sign-up.",
  genre: ["Typing", "Skill"],
  playMode: "SinglePlayer",
  intro:
    "Typing Speed is a free typing speed test that runs in your browser. Each round gives you one sentence of 55 to 75 characters. The clock starts on your first keystroke, and the round ends when your text matches the sentence exactly. You then see your words per minute, accuracy, best streak and error count. Your best WPM is saved on your device, so you can try to beat it with the next sentence.",
  howToPlay: [
    "Click Start typing, or press Enter.",
    "Read the sentence, then type it. The clock only starts on your first keystroke.",
    "Fix wrong letters, shown in red, with Backspace. The round ends only when your text matches the sentence exactly.",
    "Check your WPM, accuracy, best streak and errors on the result card.",
    "Click Next sentence to play again.",
  ],
  controls: [
    {
      input: "Keyboard",
      action: "Type the sentence. Backspace fixes mistakes.",
    },
    {
      input: "Enter",
      action: "Starts a round from the start screen.",
    },
    {
      input: "Escape",
      action: "Restarts the current sentence while you are playing.",
    },
    {
      input: "Mouse",
      action: "Click Start typing, Skip for a different sentence, or Next sentence.",
    },
    {
      input: "Phone",
      action:
        "Tap Start typing to open the on-screen keyboard. Tap the sentence card to bring it back.",
    },
  ],
  strategy: [
    "Read the whole sentence before your first key. The clock does not run while you read.",
    "Protect accuracy. A wrong letter must be deleted and retyped before the round can end, so each mistake costs time.",
    "Punctuation and spaces count as characters in your WPM, so do not rush past commas and full stops.",
    "Watch the flame counter. It appears at 5 correct letters in a row, a burst fires every 10, and one wrong key resets it to zero.",
    "If a sentence has awkward words for you, press Skip and take a different one.",
  ],
  facts: [
    {
      label: "Round",
      value: "One sentence per round",
    },
    {
      label: "Sentences",
      value: "25 built in, 55 to 75 characters each",
    },
    {
      label: "Score",
      value: "WPM and accuracy percent",
    },
    {
      label: "Progress",
      value: "Best WPM saved on this device",
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
        "Your WPM is the sentence length in characters divided by 5, divided by the minutes you took, rounded to a whole number. Spaces and punctuation count as characters. The timer runs from your first keystroke until your text matches the sentence.",
    },
    {
      question: "How is typing accuracy calculated?",
      answer:
        "Accuracy is your correct keystrokes divided by all keystrokes that added a character, rounded to the nearest percent. Backspaces are not counted, and correcting a mistake does not remove it from the total.",
    },
    {
      question: "Is this typing speed test free?",
      answer: "Yes. It is free, runs in your browser and needs no download or account.",
    },
    {
      question: "Does the typing game save my score?",
      answer:
        "It saves your best WPM in your browser on that device. There is no leaderboard and no account, and clearing your browser data removes the saved best.",
    },
  ],
  credits: [
    {
      label: "Game",
      detail:
        "Built by Amin Dhouib. The game logic and the 25 sentences are part of this site's own source.",
    },
    {
      label: "Sentences",
      detail:
        "A fixed list inside the game, including four traditional pangrams. No third-party word list or typing library is used.",
    },
    {
      label: "Libraries",
      detail: "Animation by Framer Motion (MIT) and icons by Lucide (ISC).",
    },
  ],
};
