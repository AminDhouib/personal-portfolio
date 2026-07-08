import type { GameState, Rule } from "../types";

/**
 * Minimal rule-engine state for exercising a single rule in isolation.
 * Consolidates the byte-identical copy that previously lived in all eight
 * rule/hazard suites (audit P2-TEST-006).
 */
export function makeState(password: string, rule: Rule): GameState {
  return {
    password,
    formatting: [],
    elapsedSeconds: 0,
    activeRuleIndex: 0,
    rules: [rule],
    seed: 1,
  };
}
