import type { Pg2RuleDef } from "../types";
import { PROLOGUE_RULES } from "./prologue";
import { ACT1_RULES } from "./act1";
import { ACT2_RULES } from "./act2";
import { ACT3_RULES } from "./act3";

/**
 * Authored core-rule roster, in reveal order across the five acts. The engine
 * reads only this manifest: it reveals each rule when every prior rule passes,
 * and advances an act once that act's rules are all revealed and passing.
 *
 * Order is load-bearing — the reveal cascade and the act boundaries follow the
 * index here, not the `act` field alone. See each act module for the rules.
 */
export const CORE_RULES: Pg2RuleDef[] = [
  ...PROLOGUE_RULES,
  ...ACT1_RULES,
  ...ACT2_RULES,
  ...ACT3_RULES,
];
