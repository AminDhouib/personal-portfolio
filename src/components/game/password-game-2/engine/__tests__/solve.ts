import type { GameState, Pg2Rule, RuleApi } from "../types";
import { cellsToPassword } from "../cells";
import { CAPTCHA_PHRASE } from "../rules/prologue";
import { MONTHS, digitSumOf } from "../rules/act1";
import { BACKWARDS_PASSWORD } from "../rules/act3";
import { fromRoman, parseRomanTokens, toRoman } from "../rules/roman";

/**
 * The append-only solver that keeps the engine suite honest as the roster grows.
 * It lives under __tests__ so it ships nowhere. Given a revealed rule and the
 * current password, solveRule returns a password that satisfies that rule while
 * leaving the simpler textual constraints solvable; solveAll drives the whole
 * revealed set to green. Both take passwords as plain strings and never touch
 * the DOM — the engine feeds them cellsToPassword(g.cells).
 *
 * Two rules are not pure appends: digit-sum rebuilds its own trailing digit
 * block (preserving the current-time substring, the only other required digit
 * carrier when feeds are offline), and max-length-40 trims filler. If a live
 * chess feed injects a digit-bearing SAN, digit-sum and chess can contradict —
 * an inherent Password-Game tension the solver surfaces by throwing, not by
 * silently corrupting the move.
 */

/** Trim/pad character. A special char (helps rule 4) that is inert everywhere else. */
export const FILLER = "~";

/** Validators ignore GameState entirely; a stub keeps solveRule's signature clean. */
const STUB_STATE = {} as unknown as GameState;

const SHORTEST_MONTH = MONTHS.reduce((a, b) => (b.length < a.length ? b : a));

/** Solve priority: content first, then char-class top-ups, digit-sum, length last. */
const SOLVE_PRIORITY: Record<string, number> = {
  "captcha-human": 1,
  "include-month": 1,
  "wordle-today": 1,
  sponsor: 1,
  "roman-numeral": 1,
  "roman-product": 1,
  "country-name": 1,
  "current-time": 1,
  "chess-best-move": 1,
  "backwards-password": 1,
  "include-uppercase": 2,
  "include-special": 2,
  "include-number": 2,
  "digit-sum": 3,
  "min-length-12": 4,
  "max-length-40": 5,
  "final-blessing": 6,
};

/** A digit string whose characters sum to exactly n (n >= 0). */
function digitsSummingTo(n: number): string {
  if (n <= 0) return "";
  const nines = "9".repeat(Math.floor(n / 9));
  const rem = n % 9;
  return nines + (rem > 0 ? String(rem) : "");
}

function solveDigitSum(rule: Pg2Rule, current: string, api: RuleApi): string {
  const target = Number(rule.payload?.["target"]);
  const timeStr = api.nowHHMM();
  const idx = /\d/.test(timeStr) ? current.indexOf(timeStr) : -1;
  let base: string;
  let fixedSum: number;
  if (idx >= 0) {
    // Preserve the current-time substring; strip every other (stray/old-block) digit.
    const before = current.slice(0, idx).replace(/\d/g, "");
    const after = current.slice(idx + timeStr.length).replace(/\d/g, "");
    base = before + timeStr + after;
    fixedSum = digitSumOf(timeStr);
  } else {
    base = current.replace(/\d/g, "");
    fixedSum = 0;
  }
  const needed = target - fixedSum;
  if (needed < 0) {
    throw new Error(
      `solveRule(digit-sum): fixed digits already sum to ${fixedSum}, over target ${target}`,
    );
  }
  return base + digitsSummingTo(needed);
}

function solveRomanProduct(rule: Pg2Rule, current: string): string {
  const target = Number(rule.payload?.["target"]);
  const tokens = parseRomanTokens(current);
  const base = tokens.length === 0 ? 1 : tokens.reduce((acc, t) => acc * fromRoman(t), 1);
  if (base === 0 || target % base !== 0) {
    throw new Error(
      `solveRule(roman-product): cannot reach ${target} from existing product ${base}`,
    );
  }
  // Guard against merging with a trailing Roman letter, which would change values.
  const sep = /[IVXLCDM]$/.test(current) ? " " : "";
  return current + sep + toRoman(target / base);
}

function solveSponsor(rule: Pg2Rule, current: string): string {
  const sponsors = rule.payload?.["sponsors"];
  if (!Array.isArray(sponsors) || sponsors.length === 0) {
    throw new Error("solveRule(sponsor): rule payload is missing its sponsors");
  }
  const shortest = [...sponsors].sort((a, b) => String(a).length - String(b).length)[0];
  // Lowercase so a sponsor's capitals (Cloudz -> "C") never seed a Roman token.
  return current + String(shortest).toLowerCase();
}

/** Append a live-feed word from the rule payload, transformed to avoid side effects. */
function solveFeedWord(
  rule: Pg2Rule,
  current: string,
  key: string,
  transform: (raw: string) => string,
): string {
  const raw = rule.payload?.[key];
  if (typeof raw !== "string") {
    throw new Error(`solveRule(${rule.id}): expected a string payload.${key}`);
  }
  return current + transform(raw);
}

function trimTo40(current: string): string {
  // Filler is an inert sentinel that belongs to no required substring, so it can
  // be pulled from anywhere. min-length-12 may have padded early (leaving filler
  // at the front), so trim the rightmost filler first but do not stop at a
  // non-filler tail. Whatever is left over is real content the roster needs.
  let s = current;
  while ([...s].length > 40) {
    const idx = s.lastIndexOf(FILLER);
    if (idx === -1) {
      throw new Error(
        `solveRule(max-length-40): cannot trim to <= 40 without breaking a rule (length ${[...s].length})`,
      );
    }
    s = s.slice(0, idx) + s.slice(idx + 1);
  }
  return s;
}

/** Return a password that satisfies `rule`, starting from `current`. */
export function solveRule(rule: Pg2Rule, current: string, api: RuleApi): string {
  if (rule.validate(current, STUB_STATE, api).passed) return current;
  switch (rule.id) {
    case "min-length-12": {
      let s = current;
      while ([...s].length < 12) s += FILLER;
      return s;
    }
    case "include-number":
      return current + "0";
    case "include-uppercase":
      return current + "A";
    case "include-special":
      return current + "!";
    case "captcha-human":
      return current + CAPTCHA_PHRASE;
    case "digit-sum":
      return solveDigitSum(rule, current, api);
    case "include-month":
      return current + SHORTEST_MONTH;
    case "wordle-today":
      return solveFeedWord(rule, current, "word", (w) => w.toLowerCase());
    case "sponsor":
      return solveSponsor(rule, current);
    case "roman-numeral":
      return current + "I";
    case "roman-product":
      return solveRomanProduct(rule, current);
    case "country-name":
      return solveFeedWord(rule, current, "country", (c) => c.toLowerCase());
    case "current-time":
      return current + api.nowHHMM();
    case "chess-best-move":
      return solveFeedWord(rule, current, "bestMove", (m) => m);
    case "max-length-40":
      return trimTo40(current);
    case "backwards-password":
      return current + BACKWARDS_PASSWORD;
    case "final-blessing":
      return current;
    default:
      throw new Error(`solveRule: no strategy for rule "${rule.id}"`);
  }
}

/**
 * Drive every revealed rule to passing. Iterates in solve-priority order, applies
 * solveRule to each failing rule, and repeats until all pass. Throws loudly if a
 * pass makes no progress (unsatisfiable set) or the cap is hit — never returns a
 * password that fails a revealed rule.
 */
export function solveAll(g: GameState, api: RuleApi): string {
  const MAX_ITERS = 200;
  let s = cellsToPassword(g.cells);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const ordered = [...g.rules].sort(
      (a, b) => (SOLVE_PRIORITY[a.id] ?? 1) - (SOLVE_PRIORITY[b.id] ?? 1),
    );
    let changed = false;
    for (const r of ordered) {
      if (r.validate(s, g, api).passed) continue;
      const next = solveRule(r, s, api);
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    if (g.rules.every((r) => r.validate(s, g, api).passed)) return s;
    if (!changed) {
      const failing = g.rules.filter((r) => !r.validate(s, g, api).passed).map((r) => r.id);
      throw new Error(`solveAll stuck; unsatisfiable revealed rules: ${failing.join(", ")}`);
    }
  }
  throw new Error(`solveAll exceeded ${MAX_ITERS} iterations`);
}
