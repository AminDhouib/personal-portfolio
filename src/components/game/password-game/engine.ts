import { mulberry32, pickN } from "./prng";
import type { FormattingMap, GameState, Rule, RuleDef, Tier, ValidationResult } from "./types";
import type { TickResult } from "./types";

export type RuleCountsPerTier = Partial<Record<Tier, number>>;
export type RulePoolsPerTier = Partial<Record<Tier, readonly RuleDef[]>>;

/**
 * Deterministically select rules for a run. Each tier's rules are drawn from
 * its own pool using a tier-specific PRNG derived from the master seed, so
 * adding rules to a later tier won't reshuffle earlier tiers.
 */
export function selectRulesForRun(
  seed: number,
  counts: RuleCountsPerTier,
  pools: RulePoolsPerTier
): Rule[] {
  const out: Rule[] = [];
  const pickedIds = new Set<string>();
  const tiers: Tier[] = [1, 2, 3, 4, 5];
  for (const tier of tiers) {
    const count = counts[tier] ?? 0;
    const pool = pools[tier] ?? [];
    if (count === 0 || pool.length === 0) continue;
    const tierSeed = (seed ^ (tier * 0x9e3779b1)) >>> 0;
    const selectionRng = mulberry32(tierSeed);
    // Pick more than `count` candidates so we have spares to swap in when a
    // conflict filter drops one. Capped at pool length.
    const candidates = pickN(selectionRng, pool, pool.length);
    let kept = 0;
    for (let i = 0; i < candidates.length && kept < count; i++) {
      const def = candidates[i];
      const conflicts = def.conflictsWith ?? [];
      const hasConflict = conflicts.some((id) => pickedIds.has(id));
      if (hasConflict) continue;
      const paramRng = mulberry32((tierSeed + (kept + 1) * 0x85ebca6b) >>> 0);
      out.push(def.create(paramRng));
      pickedIds.add(def.id);
      kept++;
    }
  }
  return out;
}

export function validateRules(state: GameState): ValidationResult[] {
  return state.rules.map((rule) => rule.validate(state));
}

/**
 * The active rule is the first unsatisfied rule. Earlier rules must be
 * satisfied first (Neal-style progressive reveal). Returns -1 when all pass.
 */
export function computeActiveRuleIndex(state: GameState): number {
  for (let i = 0; i < state.rules.length; i++) {
    if (!state.rules[i].validate(state).passed) return i;
  }
  return -1;
}

export interface TickedState {
  password: string;
  formatting: FormattingMap;
  ruleStates: Record<string, unknown>;
}

/**
 * Run onTick on every rule that has one. Applied in rule order so later
 * rules see the password mutations from earlier ticks this frame. Rule
 * state is threaded back in for the next tick.
 */
export function runTicks(
  state: GameState,
  deltaMs: number,
  ruleStates: Record<string, unknown>
): TickedState {
  let password = state.password;
  let formatting = state.formatting;
  const nextStates: Record<string, unknown> = { ...ruleStates };
  for (const rule of state.rules) {
    if (!rule.onTick) continue;
    const current = { ...state, password, formatting };
    const result: TickResult | null = rule.onTick(current, deltaMs, ruleStates[rule.id]);
    if (!result) continue;
    if (result.password !== undefined) password = result.password;
    if (result.formatting !== undefined) formatting = result.formatting;
    if (result.ruleState !== undefined) nextStates[rule.id] = result.ruleState;
  }
  return { password, formatting, ruleStates: nextStates };
}
