import type { GameState, Pg2Rule, RuleApi } from "../types";
import { cellsToPassword } from "../cells";
import { CAPTCHA_PHRASE } from "../rules/prologue";
import { MONTHS } from "../rules/act1";
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
 * Two rules are not pure appends: digit-sum rebuilds its own digit block and
 * max-length trims filler. digit-sum takes a list of PROTECTED substrings — the
 * live payload strings that must survive verbatim (the current-time HH:MM, a
 * chess SAN, the wordle answer, the country name). Digits inside them count
 * toward the target and are never stripped, so digit-sum and a digit-bearing SAN
 * no longer contradict. The seeded ranges (digit-sum 35-45, max-length 60-75)
 * guarantee the target is always reachable — a seed is never unsolvable.
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
  "max-length": 5,
  "final-blessing": 6,
};

/** A digit string whose characters sum to exactly n (n >= 0). */
function digitsSummingTo(n: number): string {
  if (n <= 0) return "";
  const nines = "9".repeat(Math.floor(n / 9));
  const rem = n % 9;
  return nines + (rem > 0 ? String(rem) : "");
}

/** The live payload strings of revealed rules that digit-sum must not destroy. */
function collectProtected(rules: readonly Pg2Rule[], api: RuleApi): string[] {
  const out: string[] = [api.nowHHMM()];
  for (const r of rules) {
    const p = r.payload;
    if (!p) continue;
    if (r.id === "wordle-today" && typeof p["word"] === "string") {
      out.push((p["word"] as string).toLowerCase()); // appended lowercased
    } else if (r.id === "country-name" && typeof p["country"] === "string") {
      out.push((p["country"] as string).toLowerCase()); // appended lowercased
    } else if (r.id === "chess-best-move" && typeof p["bestMove"] === "string") {
      out.push(p["bestMove"] as string); // appended verbatim
    }
  }
  return out;
}

/**
 * Rebuild the digit block so every digit in `current` sums to the target. Digits
 * inside a protected substring survive and count as fixed; every other digit is
 * stripped and replaced by a fresh block. Throws if the protected digits already
 * exceed the target — which the seeded 35-45 range makes impossible, since the
 * forced live payloads (time <= 24, SAN <= 8) never sum past 32.
 */
function solveDigitSum(
  rule: Pg2Rule,
  current: string,
  protectedStrings: readonly string[],
): string {
  const target = Number(rule.payload?.["target"]);
  const keep: boolean[] = Array.from({ length: current.length }, () => false);
  for (const p of protectedStrings) {
    if (!p) continue;
    for (let idx = current.indexOf(p); idx !== -1; idx = current.indexOf(p, idx + 1)) {
      for (let i = idx; i < idx + p.length; i++) keep[i] = true;
    }
  }
  let base = "";
  let protectedDigits = 0;
  for (let i = 0; i < current.length; i++) {
    const ch = current[i] ?? "";
    const isDigit = ch >= "0" && ch <= "9";
    if (keep[i]) {
      base += ch;
      if (isDigit) protectedDigits += ch.charCodeAt(0) - 48;
    } else if (!isDigit) {
      base += ch; // keep non-protected non-digits; strip non-protected digits
    }
  }
  const needed = target - protectedDigits;
  if (needed < 0) {
    throw new Error(
      `solveRule(digit-sum): protected digits already sum to ${protectedDigits}, over target ${target}`,
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

function trimToMax(rule: Pg2Rule, current: string): string {
  const max = Number(rule.payload?.["target"]);
  // Filler is an inert sentinel that belongs to no required substring, so it can
  // be pulled from anywhere. min-length-12 may have padded early (leaving filler
  // at the front), so trim the rightmost filler first but do not stop at a
  // non-filler tail. Whatever is left over is real content the roster needs.
  let s = current;
  while ([...s].length > max) {
    const idx = s.lastIndexOf(FILLER);
    if (idx === -1) {
      throw new Error(
        `solveRule(max-length): cannot trim to <= ${max} without breaking a rule (length ${[...s].length})`,
      );
    }
    s = s.slice(0, idx) + s.slice(idx + 1);
  }
  return s;
}

/**
 * Return a password that satisfies `rule`, starting from `current`. `protected`
 * carries sibling rules' live payload strings so digit-sum can preserve and
 * count digit-bearing substrings (a chess SAN); it is ignored by every other
 * rule and defaults to empty for standalone use.
 */
export function solveRule(
  rule: Pg2Rule,
  current: string,
  api: RuleApi,
  protectedStrings: readonly string[] = [],
): string {
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
      // Always protect the live clock; add any sibling SAN/answer/name on top.
      return solveDigitSum(rule, current, [api.nowHHMM(), ...protectedStrings]);
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
    case "max-length":
      return trimToMax(rule, current);
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
    const protectedStrings = collectProtected(g.rules, api);
    const ordered = [...g.rules].sort(
      (a, b) => (SOLVE_PRIORITY[a.id] ?? 1) - (SOLVE_PRIORITY[b.id] ?? 1),
    );
    let changed = false;
    for (const r of ordered) {
      if (r.validate(s, g, api).passed) continue;
      const next = solveRule(r, s, api, protectedStrings);
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
