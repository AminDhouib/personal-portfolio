import type { Rng } from "./prng";

export type Tier = 1 | 2 | 3 | 4 | 5;

/** Result of validating a password against a rule. */
export interface ValidationResult {
  passed: boolean;
  /** Optional message shown to the player (e.g. current progress, hint). */
  message?: string;
}

export interface CharFormatting {
  bold?: boolean;
  italic?: boolean;
}

export type FormattingMap = readonly CharFormatting[];

/** Runtime state that rules can inspect or mutate (e.g. timers). */
export interface GameState {
  /** Current password value. */
  password: string;
  /**
   * Parallel array of per-character formatting. Indexed by position in
   * `password`. Same length as [...password] (code-point aware).
   * Empty or shorter than password means "no formatting applied anywhere".
   */
  formatting: FormattingMap;
  /** Elapsed seconds since game start. */
  elapsedSeconds: number;
  /** Index of the currently active (unsatisfied) rule, or -1 if none. */
  activeRuleIndex: number;
  /** Ordered rules for this run. */
  rules: Rule[];
  /** Seed used for this run. */
  seed: number;
}

/** A rule definition drawn from the pool and parameterized by the seed. */
export interface Rule {
  /** Stable id (e.g. "min-length"). Used for analytics and debugging. */
  id: string;
  /** Tier this rule belongs to. */
  tier: Tier;
  /** Human-readable description shown to the player. */
  description: string;
  /** Rule parameters resolved from the seed (e.g. { n: 7 }). */
  params: Record<string, unknown>;
  /** Pure validator. Must not mutate inputs. */
  validate(state: GameState): ValidationResult;
}

/** Factory that produces a Rule using the RNG for parameterization. */
export interface RuleDef {
  id: string;
  tier: Tier;
  /** Other rule ids this rule conflicts with. Mutual — listed on either side. */
  conflictsWith?: readonly string[];
  create(rng: Rng): Rule;
}
