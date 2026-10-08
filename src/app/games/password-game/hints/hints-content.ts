import type { FaqEntry } from "@/data/faq";

// The hints page's copy as data. Server-safe (no component imports). Every claim must be true of
// the rule and event definitions under src/components/game/password-game-2/engine; the
// exhaustiveness test in __tests__/hints-content.test.ts fails when a rule or event has no entry.
// Hints are generic on purpose: they never name a seeded value (a target number, a captcha code,
// a passphrase), so the page stays valid for every seed and the daily board stays fair.

export const PG2_PATH = "/games/password-game";
export const PG2_HINTS_PATH = "/games/password-game/hints";

export const PG2_HINTS_TITLE = "Password Game 2 Hints and Rules, Spoilers Hidden";
export const PG2_HINTS_DESCRIPTION =
  "Stuck on The Password Game 2? Every rule has three hints, from a nudge to the full answer, and every event has a tip. All stay closed until opened.";

export const PG2_HINTS_INTRO =
  "Every rule and event in The Password Game 2 has its own entry below. The hints and answers stay hidden until you open an entry: rules give three hints from a small nudge to the full approach, and events say what they are and how to survive them. Hints never name a seeded value, so they hold for every run. Rule numbers follow the core rules, and an event can add a rule that shifts the numbers on your card.";

export interface RuleHint {
  /** Visible while the entry is closed, so it must not give the answer away. */
  title: string;
  /** A nudge, then the approach, then the full shape of the solution. */
  hints: readonly [string, string, string];
}

export interface EventHint {
  title: string;
  tip: string;
}

/** Keyed by rule id, in reveal order (the page numbers rules by this order). */
export const RULE_HINTS: Record<string, RuleHint> = {
  "min-length-12": {
    title: "The length floor",
    hints: [
      "The first rule is only about how much you type.",
      "The card shows a live count. Keep typing until it reaches the minimum.",
      "Twelve characters is enough. Spaces count, and so does every other symbol.",
    ],
  },
  "include-number": {
    title: "A number",
    hints: [
      "This one asks for a kind of character you may not have used yet.",
      "Type a digit anywhere in the password.",
      "Any single digit from 0 to 9 passes. Remember it: a later rule adds up your digits.",
    ],
  },
  "include-uppercase": {
    title: "A capital letter",
    hints: [
      "Look at the letters you have typed so far.",
      "Make at least one of them a capital.",
      "Hold Shift and type any letter from A to Z.",
    ],
  },
  "include-special": {
    title: "A special character",
    hints: [
      "Letters and digits are not enough here.",
      "You need a symbol that is neither a letter, a digit nor a space.",
      "Something like an exclamation mark, an at sign or a hash passes.",
    ],
  },
  "captcha-human": {
    title: "Prove you are human",
    hints: [
      "This rule has a widget on its card. Use it rather than guessing.",
      "Pick every tile that shows the thing the challenge asks for, then confirm.",
      "The form rejects your first correct answer on purpose. Answer correctly again on the second grid. The widget then gives you a short code that starts with OK and types it into the password for you.",
    ],
  },
  "digit-sum": {
    title: "Digits that add up",
    hints: [
      "The rule wants a total, not a particular digit.",
      "Add up every digit in the password and compare it with the target on the card, which shows your running sum.",
      "Spread the total over a few digits, for example nines and a remainder. Digits that arrive later, such as the clock time and a chess move, count too, so leave room for them.",
    ],
  },
  "include-month": {
    title: "A month",
    hints: [
      "Think calendar.",
      "The password must contain the name of a month of the year.",
      "Spell out a whole month name in full, not an abbreviation. Capitals do not matter, and a month name hidden inside a longer word still counts.",
    ],
  },
  "wordle-today": {
    title: "Today's puzzle word",
    hints: [
      "This rule depends on today's date.",
      "It wants the answer to today's Wordle, the five-letter word game.",
      "Solve or look up today's Wordle and type the answer in any case. If the live feed is unreachable the rule passes for free.",
    ],
  },
  sponsor: {
    title: "A word from our sponsors",
    hints: [
      "The card names a few companies.",
      "You only need to plug one of them.",
      "Type the full name of any listed sponsor. Capitals do not matter, but the spelling and spaces do.",
    ],
  },
  "consent-preferences": {
    title: "The preference center",
    hints: [
      "This is a puzzle with six switches, not a text rule.",
      "Switching a toggle off also flips one other toggle, its fixed neighbor. Click one and see which neighbor changes.",
      "Aim to switch off a toggle whose neighbor is currently on, so both end up off. Switching one off while its neighbor is off turns the neighbor on. When all six are off the widget types the confirmation phrase into your password.",
    ],
  },
  "roman-numeral": {
    title: "An ancient number",
    hints: [
      "Another kind of number, from a different era.",
      "Use a Roman numeral. The letters count only in capitals.",
      "Any of I, V, X, L, C, D or M in uppercase passes.",
    ],
  },
  "roman-product": {
    title: "Numerals that multiply",
    hints: [
      "The numerals in your password are multiplied together, not added.",
      "Each run of capital Roman letters is one numeral. Multiply the values of all the runs and match the target on the card.",
      "One numeral equal to the target is enough. Check your other capitals: a stray I, V, X, L, C, D or M elsewhere makes another factor.",
    ],
  },
  "country-name": {
    title: "Where in the world",
    hints: [
      "Look at the card for the country name.",
      "The card names a country. You have to type that country.",
      "Spell the country's full name. Capitals do not matter. If the live feed is unreachable the rule passes for free.",
    ],
  },
  "current-time": {
    title: "What time is it",
    hints: [
      "The answer changes while you play.",
      "The password must contain the current time, hours then minutes, on a 24-hour clock with a colon.",
      "Read your device's clock and type it like 09:05 or 17:42. The minute rolls over while you play, so check this rule again before you finish. Its digits also count toward the digit sum.",
    ],
  },
  "color-match": {
    title: "The seasonal swatch",
    hints: [
      "Trust your eyes.",
      "A large swatch is shown without a name. Find the matching swatch in the row of choices.",
      "Click the choice whose color matches. The widget types the color's lowercase name into your password.",
    ],
  },
  "chess-best-move": {
    title: "A chess puzzle",
    hints: [
      "The card shows a position from a daily puzzle.",
      "Find the single best move for the side to play.",
      "Click the move out on the board, or type it in standard notation. The widget types it for you. If the live feed is unreachable the rule passes for free. The move's digits count toward the digit sum.",
    ],
  },
  "max-length": {
    title: "A length ceiling",
    hints: [
      "After a floor, a ceiling.",
      "The password may not be longer than the cap on the card. The card shows your running length.",
      "Do not pad. If you are over, delete characters the rules do not need, such as filler between the required pieces. Junk that events wedge in counts too.",
    ],
  },
  "backwards-password": {
    title: "Mirror, mirror",
    hints: [
      "One of the words in this game's name has to appear.",
      "It must appear spelled the other way round.",
      "Type the word password reversed. Capitals do not matter.",
    ],
  },
  "final-blessing": {
    title: "The finish line",
    hints: [
      "Nothing is asked of your password here.",
      "This rule always passes once it appears. It unlocks the Create account button.",
      "Check that every other rule is green and no event rule is red, then press Create account to start the finale.",
    ],
  },
};

/** Keyed by event id. */
export const EVENT_HINTS: Record<string, EventHint> = {
  gerald: {
    title: "Gerald the fish",
    tip: "A fish moves into the form and gets hungrier over time. Press FEED now and then. At submit he must have been fed within the last minute. A fish kept alive helps in the finale.",
  },
  campfire: {
    title: "The campfire",
    tip: "A fire burns down steadily. Press STOKE to add fuel; the button needs a moment between uses and it likes to move. A low fire eats letters from your password, and at submit it must still be burning. A fire kept alive helps in the finale.",
  },
  garden: {
    title: "The garden and the bear",
    tip: "Flowers bloom and fill a hive with honey. Now and then a bear approaches, and if it finishes its raid it tramples the garden. Press THROW BASKET while the bear approaches or raids to send it away. At submit the hive needs enough honey. A garden kept alive helps in the finale.",
  },
  infection: {
    title: "Data corruption",
    tip: "One character corrupts and the corruption spreads to its neighbors, but never across a space. The rule that appears shows an antidote sequence of lowercase letters; type it anywhere in the password to clear everything. Spaces slow the spread.",
  },
  "black-hole": {
    title: "The compaction",
    tip: "An anchor pulls your letters out of the password, nearest first. A banner shows a word to feed it. Typing that word anywhere in the password ends the pass and the letters return in place. Left alone, it ends by itself after a few captures.",
  },
  parasite: {
    title: "The parasite",
    tip: "A fake character is slipped into the password. It looks like its neighbor but is not counted by the length and digit rules, so a rule goes red for no visible reason. It wiggles faintly. Click it to evict it. A second one arrives if you wait too long.",
  },
  galaga: {
    title: "The invasion",
    tip: "Waves of aliens dive and grab letters out of the password. Type the grabbed letter to shoot the alien down and get the letter back, or click an alien before it grabs. The last wave must be shot down completely before you submit.",
  },
  snake: {
    title: "The snake",
    tip: "A snake swallows your last letter on a regular beat. Put the cursor at the very end of the password and type the snake's snack character to feed it. Feed it a few times and it leaves, returning everything it swallowed. At submit nothing may be left inside it.",
  },
  tetris: {
    title: "Junk blocks",
    tip: "Ten junk blocks drop into your password. Unlike other intruders they count toward your length. Click a junk block to shatter it, or delete it with Backspace. At submit none may remain.",
  },
  "cookie-banner": {
    title: "The cookie banner",
    tip: "A consent dialog appears. Declining spawns more of them. Only one banner in the whole stack carries the real Reject all control, and the others are decoys. Typing is never locked, and the swarm leaves on its own after a while.",
  },
  autocorrect: {
    title: "The autocorrect demon",
    tip: "Every few seconds it quietly rewrites a word in your password, and a toast is the only warning. The off switch is hidden in its settings dialog among six toggles; Helpful corrections is the one that stops it. It also gets bored and leaves on its own.",
  },
  "loading-bar": {
    title: "The fake upload",
    tip: "A loading bar seizes your keyboard and stalls near the end. Mashing keys nudges it along, and it always releases you after a fixed time. It is a joke, so stay calm and wait it out.",
  },
};

export const PG2_HINTS_FAQ: FaqEntry[] = [
  {
    question: "Will the hints spoil The Password Game 2 for me?",
    answer:
      "Only if you open them. Every rule and event is a closed section that shows just its name. A rule gives three hints, from a small nudge to the full approach, so you can stop at the one you need.",
  },
  {
    question: "Do the hints give the answers for the daily seed?",
    answer:
      "No. They explain how each rule works but never name a seeded value such as a target number, a captcha code or a confirmation phrase. You still read those off your own run.",
  },
  {
    question: "What if a rule passes without me doing anything?",
    answer:
      "Rules that read a live feed, such as the Wordle, country and chess rules, pass for free when the feed is unreachable. They are marked as feed offline on the card.",
  },
];
