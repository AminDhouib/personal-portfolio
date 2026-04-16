import type { RuleDef } from "../types";
import { pickOne, rangeInt } from "../prng";
import { NATO_ALPHABET, NATO_LETTERS } from "../../../../data/password-game/nato";
import { ELEMENTS } from "../../../../data/password-game/periodic-table";
import { FOREIGN_WORDS } from "../../../../data/password-game/foreign-words";
import { getCapitals } from "../../../../data/password-game/capitals";
import { NAMED_COLORS } from "../../../../data/password-game/colors";
import { CODE_SNIPPETS } from "../../../../data/password-game/code-snippets";
import { morseRule, binaryRule, mathWordsRule, captchaRule } from "./tier2-pack";
import { wordleRule } from "./tier2-wordle";
import { flagRule } from "./tier2-flag";
import { chessRule } from "./tier2-chess";
import { pianoRule } from "./tier2-piano";
import { asciiRule } from "./tier2-ascii";
import { colorMixRule } from "./tier2-color-mix";
import { diceRule } from "./tier2-dice";
import { phoneKeypadRule } from "./tier2-phone";
import { brailleRule } from "./tier2-braille";
import { base64Rule } from "./tier2-base64";
import { rhymeRule } from "./tier2-rhyme";

const natoPhonetic: RuleDef = {
  id: "nato-phonetic",
  tier: 2,
  create(rng) {
    const letter = pickOne(rng, NATO_LETTERS);
    const word = NATO_ALPHABET[letter];
    return {
      id: "nato-phonetic",
      tier: 2,
      description: `Your password must include the NATO phonetic spelling for the letter "${letter}".`,
      params: { letter, word },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(word.toLowerCase()) };
      },
    };
  },
};

type MathOp = "+" | "-" | "*";

function evalMath(a: number, op: MathOp, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
  }
}

const mathEquation: RuleDef = {
  id: "math-equation",
  tier: 2,
  create(rng) {
    const ops: MathOp[] = ["+", "-", "*"];
    const op = ops[Math.floor(rng() * ops.length)];
    const a = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 10, 50);
    const b = op === "*" ? rangeInt(rng, 2, 9) : rangeInt(rng, 1, 20);
    const answer = evalMath(a, op, b);
    return {
      id: "math-equation",
      tier: 2,
      description: `Your password must include the answer to: ${a} ${op} ${b}`,
      params: { a, b, op, answer },
      validate(state) {
        const abs = Math.abs(answer);
        if (answer < 0) {
          const hasSigned = new RegExp(`(?<!\\d)-${abs}(?!\\d)`).test(state.password);
          const hasUnsigned = new RegExp(`(?<!\\d)${abs}(?!\\d)`).test(state.password);
          return { passed: hasSigned || hasUnsigned };
        }
        return { passed: new RegExp(`(?<!\\d)${abs}(?!\\d)`).test(state.password) };
      },
    };
  },
};

const ROMAN_TABLE: readonly [number, string][] = [
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

function toRoman(n: number): string {
  let out = "";
  let rem = n;
  for (const [v, s] of ROMAN_TABLE) {
    while (rem >= v) { out += s; rem -= v; }
  }
  return out;
}

function fromRoman(s: string): number {
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const v = map[s[i]] ?? 0;
    if (v === 0) return NaN;
    if (v < prev) total -= v; else total += v;
    prev = v;
  }
  return total;
}

const romanRange: RuleDef = {
  id: "roman-range",
  tier: 2,
  create(rng) {
    const width = rangeInt(rng, 10, 30);
    const min = rangeInt(rng, 1, 100 - width);
    const max = min + width;
    return {
      id: "roman-range",
      tier: 2,
      description: `Your password must include a Roman numeral whose value is between ${min} and ${max} (inclusive).`,
      params: { min, max, toRomanExample: toRoman((min + max) >> 1) },
      validate(state) {
        const matches = state.password.match(/[IVXLCDM]+/gi) ?? [];
        for (const raw of matches) {
          const upper = raw.toUpperCase();
          const value = fromRoman(upper);
          if (Number.isFinite(value) && value >= min && value <= max && toRoman(value) === upper) {
            return { passed: true };
          }
        }
        return { passed: false };
      },
    };
  },
};

const periodicElement: RuleDef = {
  id: "periodic-element",
  tier: 2,
  create(rng) {
    const width = rangeInt(rng, 8, 15);
    const min = rangeInt(rng, 1, 118 - width);
    const max = min + width;
    return {
      id: "periodic-element",
      tier: 2,
      description: `Your password must include the symbol of an element whose atomic number is between ${min} and ${max}.`,
      params: { min, max },
      validate(state) {
        const candidates = ELEMENTS.filter(
          (e) => e.atomicNumber >= min && e.atomicNumber <= max
        );
        const pw = state.password;
        const pwLower = pw.toLowerCase();
        for (const el of candidates) {
          if (pw.includes(el.symbol) || pwLower.includes(el.symbol.toLowerCase())) {
            return { passed: true };
          }
        }
        return { passed: false };
      },
    };
  },
};

const foreignWord: RuleDef = {
  id: "foreign-word",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, FOREIGN_WORDS);
    return {
      id: "foreign-word",
      tier: 2,
      description: `Your password must include the ${entry.language} word for "${entry.english}".`,
      params: {
        english: entry.english,
        translation: entry.translation,
        language: entry.language,
      },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.translation.toLowerCase()),
        };
      },
    };
  },
};

const capitalCity: RuleDef = {
  id: "capital-city",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, getCapitals());
    return {
      id: "capital-city",
      tier: 2,
      description: `Your password must include the capital city of ${entry.country}.`,
      params: { country: entry.country, capital: entry.capital },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.capital.toLowerCase()),
        };
      },
    };
  },
};

const hexColor: RuleDef = {
  id: "hex-color",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, NAMED_COLORS);
    return {
      id: "hex-color",
      tier: 2,
      description: `Your password must include the name of the color with hex code ${entry.hex}.`,
      params: { name: entry.name, hex: entry.hex },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.name.toLowerCase()),
        };
      },
    };
  },
};

const codeSnippet: RuleDef = {
  id: "code-snippet",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, CODE_SNIPPETS);
    return {
      id: "code-snippet",
      tier: 2,
      description: `Your password must name the language of this snippet:\n\n${entry.snippet}`,
      params: { language: entry.language, snippet: entry.snippet },
      validate(state) {
        return {
          passed: state.password.toLowerCase().includes(entry.language.toLowerCase()),
        };
      },
    };
  },
};

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
  wordleRule,
  flagRule,
  chessRule,
  pianoRule,
  asciiRule,
  colorMixRule,
  diceRule,
  phoneKeypadRule,
  brailleRule,
  base64Rule,
  rhymeRule,
];
