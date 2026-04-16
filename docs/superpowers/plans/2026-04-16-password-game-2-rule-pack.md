# Password Game 2: New Rule Pack Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship 6 new rules that draw inspiration from Neal's original with fresh twists, plus some brand-new ideas. Focus on rules that don't need heavy assets (no flag SVG library, no chess engine) so we can ship quickly.

**Rules added:**
1. **Anagram** (Tier 3) — unscramble a displayed word
2. **Reverse word** (Tier 3) — include the reverse of a word
3. **Binary of N** (Tier 2) — include binary representation of a number
4. **Morse code** (Tier 2) — include morse encoding of a short word
5. **Math in words** (Tier 2) — answer a word problem in word form
6. **ASCII-art CAPTCHA** (Tier 2) — an intentionally garbled code word shown in ASCII art; player types it

---

## File Structure

**Create:**
- `src/data/password-game/morse.ts` — morse alphabet table
- `src/data/password-game/anagrams.ts` — anagram word bank
- `src/data/password-game/ascii-captcha.ts` — captcha code words
- `src/components/game/password-game/rules/tier2-pack.ts` — binary, morse, math-in-words, captcha rules
- `src/components/game/password-game/rules/tier3-pack.ts` — anagram, word-reverse rules
- `src/components/game/password-game/__tests__/rule-pack.test.ts`

**Modify:**
- `src/components/game/password-game/rules/tier2.ts` — append new rules
- `src/components/game/password-game/rules/tier3.ts` — append new rules

---

## Task 1: Morse data + rule

**Create `src/data/password-game/morse.ts`:**

```typescript
export const MORSE: Readonly<Record<string, string>> = Object.freeze({
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
});

export function toMorse(word: string): string {
  return [...word.toUpperCase()]
    .map((c) => MORSE[c] ?? "")
    .filter(Boolean)
    .join(" ");
}

export const MORSE_WORDS: readonly string[] = Object.freeze([
  "SOS", "HI", "YES", "NO", "HELP", "CAT", "DOG", "RUN", "WIN", "LOVE",
]);
```

**Create `src/components/game/password-game/rules/tier2-pack.ts`** (also holds other new tier2 rules — added in later tasks):

```typescript
import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { MORSE_WORDS, toMorse } from "../../../../data/password-game/morse";

export const morseRule: RuleDef = {
  id: "morse",
  tier: 2,
  create(rng) {
    const word = pickOne(rng, MORSE_WORDS);
    const morse = toMorse(word);
    return {
      id: "morse",
      tier: 2,
      description: `Your password must include the morse code for "${word}": ${morse}`,
      params: { word, morse },
      validate(state) {
        return { passed: state.password.includes(morse) };
      },
    };
  },
};
```

Write tests in `__tests__/rule-pack.test.ts`:
- Exists, is tier 2
- Validator passes when password contains the morse string
- Validator fails otherwise

Commit: `feat(password-game): add morse code rule`

---

## Task 2: Binary of N rule

Append to `tier2-pack.ts`:

```typescript
import { rangeInt } from "../prng";

export const binaryRule: RuleDef = {
  id: "binary",
  tier: 2,
  create(rng) {
    const n = rangeInt(rng, 10, 99);
    const binary = n.toString(2);
    return {
      id: "binary",
      tier: 2,
      description: `Your password must include the binary representation of ${n}.`,
      params: { n, binary },
      validate(state) {
        // Match the binary string not as part of a longer run of 0/1.
        const pattern = new RegExp(`(?<![01])${binary}(?![01])`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
```

Tests: validator passes when binary present, fails otherwise, params n in 10-99.

Commit: `feat(password-game): add binary-number rule`

---

## Task 3: Math in words rule

Append to `tier2-pack.ts`:

```typescript
const NUM_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen", "twenty",
];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberToWords(n: number): string {
  if (n < 0) return "minus" + numberToWords(-n);
  if (n <= 20) return NUM_WORDS[n] ?? "";
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS_WORDS[tens] : TENS_WORDS[tens] + NUM_WORDS[ones];
  }
  if (n === 100) return "onehundred";
  return String(n);
}

export const mathWordsRule: RuleDef = {
  id: "math-words",
  tier: 2,
  create(rng) {
    const ops = ["+", "*"] as const;
    const op = ops[Math.floor(rng() * ops.length)];
    const a = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 5, 40);
    const b = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 5, 40);
    const answer = op === "*" ? a * b : a + b;
    const answerWord = numberToWords(answer);
    return {
      id: "math-words",
      tier: 2,
      description: `Your password must include the word form of ${a} ${op} ${b} (e.g. "twentyone" = 21).`,
      params: { a, b, op, answer, answerWord },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(answerWord) };
      },
    };
  },
};
```

Tests.

Commit: `feat(password-game): add math-in-words rule`

---

## Task 4: ASCII CAPTCHA rule

Simple version: a short random code (4 chars) displayed in the description. The "distortion" is that the code appears between symbol frames and uses mixed case that the player must type exactly.

Append to `tier2-pack.ts`:

```typescript
const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export const captchaRule: RuleDef = {
  id: "captcha",
  tier: 2,
  create(rng) {
    const len = 4;
    const chars = Array.from({ length: len }, () =>
      CAPTCHA_ALPHABET[Math.floor(rng() * CAPTCHA_ALPHABET.length)]
    );
    // Randomly upper/lowercase each character.
    const code = chars
      .map((c) => (Math.floor(rng() * 2) === 0 ? c : c.toLowerCase()))
      .join("");
    const display = `▓${code.split("").join("░")}▓`;
    return {
      id: "captcha",
      tier: 2,
      description: `Your password must include this CAPTCHA (case-sensitive): ${display}`,
      params: { code, display },
      validate(state) {
        return { passed: state.password.includes(code) };
      },
    };
  },
};
```

Tests.

Commit: `feat(password-game): add ASCII captcha rule`

---

## Task 5: Anagram data + rule

**Create `src/data/password-game/anagrams.ts`:**

```typescript
// 6-letter common words. Kept short so anagram-guessing is tractable.
export const ANAGRAM_WORDS: readonly string[] = Object.freeze([
  "candle", "bridge", "guitar", "monkey", "rocket", "turtle", "winter", "silver",
  "garden", "pencil", "window", "forest", "galaxy", "planet", "purple", "cookie",
  "button", "hammer", "orange", "potato",
]);

export function scramble(word: string, rng: () => number): string {
  const chars = [...word];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const scrambled = chars.join("");
  // If we happened to not scramble at all, just reverse as fallback.
  return scrambled === word ? [...word].reverse().join("") : scrambled;
}
```

**Create `src/components/game/password-game/rules/tier3-pack.ts`:**

```typescript
import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { ANAGRAM_WORDS, scramble } from "../../../../data/password-game/anagrams";

export const anagramRule: RuleDef = {
  id: "anagram",
  tier: 3,
  create(rng) {
    const word = pickOne(rng, ANAGRAM_WORDS);
    const scrambled = scramble(word, rng).toUpperCase();
    return {
      id: "anagram",
      tier: 3,
      description: `Your password must contain the unscramble of: ${scrambled}`,
      params: { word, scrambled },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word) };
      },
    };
  },
};
```

Tests.

Commit: `feat(password-game): add anagram rule`

---

## Task 6: Reverse word rule

Append to `tier3-pack.ts`:

```typescript
const REVERSE_WORDS = [
  "hello", "world", "night", "today", "knife", "dream", "river", "magic",
  "cloud", "storm", "music", "tiger", "piano", "ocean",
];

export const reverseRule: RuleDef = {
  id: "word-reverse",
  tier: 3,
  create(rng) {
    const word = pickOne(rng, REVERSE_WORDS);
    const reversed = [...word].reverse().join("");
    return {
      id: "word-reverse",
      tier: 3,
      description: `Your password must include the reverse of "${word}".`,
      params: { word, reversed },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(reversed) };
      },
    };
  },
};
```

Tests.

Commit: `feat(password-game): add reverse-word rule`

---

## Task 7: Register new rules in existing tier pools

**Modify `src/components/game/password-game/rules/tier2.ts`:**
Add imports + append to `TIER_2_RULES`:

```typescript
import { morseRule, binaryRule, mathWordsRule, captchaRule } from "./tier2-pack";

export const TIER_2_RULES: readonly RuleDef[] = [
  natoPhonetic,
  mathEquation,
  romanRange,
  periodicElement,
  foreignWord,
  capitalCity,
  hexColor,
  codeSnippet,
  morseRule,
  binaryRule,
  mathWordsRule,
  captchaRule,
];
```

**Modify `src/components/game/password-game/rules/tier3.ts`:**

```typescript
import { anagramRule, reverseRule } from "./tier3-pack";

export const TIER_3_RULES: readonly RuleDef[] = [
  everyNthUpper,
  wordCountStrict,
  alternatingCase,
  boldCount,
  italicCount,
  boldItalicParity,
  anagramRule,
  reverseRule,
];
```

Run tests. Commit: `feat(password-game): register new rules in Tier 2 and Tier 3 pools`

---

## Task 8: Verify

- `npm test -- password-game` — expect all tests passing
- Manual browser test: new-seed through several seeds, verify some runs hit the new rules (morse, binary, math-words, captcha, anagram, reverse)
