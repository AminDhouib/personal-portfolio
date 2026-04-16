import { mulberry32, pickN } from "./prng";
import type { GameState, Rule, RuleDef, Tier, ValidationResult } from "./types";

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
