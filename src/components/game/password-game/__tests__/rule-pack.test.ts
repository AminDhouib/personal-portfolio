import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { morseRule, binaryRule, mathWordsRule, captchaRule } from "../rules/tier2-pack";
import { anagramRule } from "../rules/tier3-pack";
import { MORSE_WORDS, toMorse } from "../../../../data/password-game/morse";
import { ANAGRAM_WORDS } from "../../../../data/password-game/anagrams";
import type { GameState, Rule } from "../types";

function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    formatting: [],
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}

describe("rule pack — morse rule", () => {
  it("exists and is tier 2", () => {
    expect(morseRule).toBeDefined();
    expect(morseRule.id).toBe("morse");
    expect(morseRule.tier).toBe(2);
  });

  it("picks a word from MORSE_WORDS and has matching morse params", () => {
    const rule = morseRule.create(mulberry32(1));
    const word = rule.params.word as string;
    const morse = rule.params.morse as string;
    expect(MORSE_WORDS).toContain(word);
    expect(morse).toBe(toMorse(word));
  });

  it("passes when password contains the morse string", () => {
    const rule = morseRule.create(mulberry32(1));
    const morse = rule.params.morse as string;
    expect(rule.validate(makeState(`abc ${morse} xyz`, rule)).passed).toBe(true);
  });

  it("fails when password does not contain the morse string", () => {
    const rule = morseRule.create(mulberry32(1));
    expect(rule.validate(makeState("abc", rule)).passed).toBe(false);
  });
});

describe("rule pack — binary rule", () => {
  it("exists and is tier 2", () => {
    expect(binaryRule).toBeDefined();
    expect(binaryRule.id).toBe("binary");
    expect(binaryRule.tier).toBe(2);
  });

  it("picks n in 10-99 with matching binary", () => {
    const rule = binaryRule.create(mulberry32(7));
    const n = rule.params.n as number;
    const binary = rule.params.binary as string;
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(99);
    expect(binary).toBe(n.toString(2));
  });

  it("passes when password contains the binary representation", () => {
    const rule = binaryRule.create(mulberry32(7));
    const binary = rule.params.binary as string;
    expect(rule.validate(makeState(`abc ${binary} xyz`, rule)).passed).toBe(true);
  });

  it("fails when binary is embedded in a longer run of 0/1", () => {
    const rule = binaryRule.create(mulberry32(7));
    const binary = rule.params.binary as string;
    expect(rule.validate(makeState(`0${binary}0`, rule)).passed).toBe(false);
    expect(rule.validate(makeState(`1${binary}1`, rule)).passed).toBe(false);
  });

  it("fails when password does not contain the binary", () => {
    const rule = binaryRule.create(mulberry32(7));
    expect(rule.validate(makeState("no digits here", rule)).passed).toBe(false);
  });
});

describe("rule pack — math-words rule", () => {
  it("exists and is tier 2", () => {
    expect(mathWordsRule).toBeDefined();
    expect(mathWordsRule.id).toBe("math-words");
    expect(mathWordsRule.tier).toBe(2);
  });

  it("computes the correct answer and word form", () => {
    const rule = mathWordsRule.create(mulberry32(13));
    const a = rule.params.a as number;
    const b = rule.params.b as number;
    const op = rule.params.op as "+" | "*";
    const answer = rule.params.answer as number;
    const expected = op === "*" ? a * b : a + b;
    expect(answer).toBe(expected);
    expect(typeof rule.params.answerWord).toBe("string");
    expect((rule.params.answerWord as string).length).toBeGreaterThan(0);
  });

  it("passes when password contains the word form (case-insensitive)", () => {
    const rule = mathWordsRule.create(mulberry32(13));
    const aw = rule.params.answerWord as string;
    expect(rule.validate(makeState(`abc${aw}xyz`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`abc${aw.toUpperCase()}xyz`, rule)).passed).toBe(true);
  });

  it("fails when password does not contain the word form", () => {
    const rule = mathWordsRule.create(mulberry32(13));
    expect(rule.validate(makeState("random text", rule)).passed).toBe(false);
  });
});

describe("rule pack — captcha rule", () => {
  it("exists and is tier 2", () => {
    expect(captchaRule).toBeDefined();
    expect(captchaRule.id).toBe("captcha");
    expect(captchaRule.tier).toBe(2);
  });

  it("produces a 4-character code and a display string", () => {
    const rule = captchaRule.create(mulberry32(19));
    const code = rule.params.code as string;
    const display = rule.params.display as string;
    expect(code.length).toBe(4);
    expect(display).toContain(code.split("").join("░"));
  });

  it("code uses the captcha alphabet (no I/O/0/1)", () => {
    const rule = captchaRule.create(mulberry32(21));
    const code = rule.params.code as string;
    for (const ch of code) {
      expect("IO01".includes(ch)).toBe(false);
      expect("io".includes(ch)).toBe(false);
    }
  });

  it("passes when password contains the exact case-sensitive code", () => {
    const rule = captchaRule.create(mulberry32(19));
    const code = rule.params.code as string;
    expect(rule.validate(makeState(`pre${code}post`, rule)).passed).toBe(true);
  });

  it("fails when password is case-mismatched or missing code", () => {
    const rule = captchaRule.create(mulberry32(19));
    const code = rule.params.code as string;
    // Flip the case of the entire code — should fail (case-sensitive).
    const flipped = [...code]
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");
    if (flipped !== code) {
      expect(rule.validate(makeState(`pre${flipped}post`, rule)).passed).toBe(false);
    }
    expect(rule.validate(makeState("no captcha", rule)).passed).toBe(false);
  });
});

describe("rule pack — anagram rule", () => {
  it("exists and is tier 3", () => {
    expect(anagramRule).toBeDefined();
    expect(anagramRule.id).toBe("anagram");
    expect(anagramRule.tier).toBe(3);
  });

  it("picks a word from ANAGRAM_WORDS and scrambled uppercase", () => {
    const rule = anagramRule.create(mulberry32(25));
    const word = rule.params.word as string;
    const scrambled = rule.params.scrambled as string;
    expect(ANAGRAM_WORDS).toContain(word);
    expect(scrambled).toBe(scrambled.toUpperCase());
    expect(scrambled.length).toBe(word.length);
  });

  it("passes when password contains the original word (case-insensitive)", () => {
    const rule = anagramRule.create(mulberry32(25));
    const word = rule.params.word as string;
    expect(rule.validate(makeState(`abc${word}xyz`, rule)).passed).toBe(true);
    expect(rule.validate(makeState(`abc${word.toUpperCase()}xyz`, rule)).passed).toBe(true);
  });

  it("fails when password does not contain the word", () => {
    const rule = anagramRule.create(mulberry32(25));
    expect(rule.validate(makeState("zzzz", rule)).passed).toBe(false);
  });
});
