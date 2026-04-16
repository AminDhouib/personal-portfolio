import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";
import { morseRule, binaryRule } from "../rules/tier2-pack";
import { MORSE_WORDS, toMorse } from "../../../../data/password-game/morse";
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
