/**
 * Roman-numeral helpers, ported from v1's password-game/rules/tier2.ts
 * (toRoman / fromRoman). One deliberate divergence: PG2 parses UPPERCASE
 * tokens only. v1's roman-range rule matched case-insensitively (/[IVXLCDM]+/gi),
 * but PG2's roman-product rule multiplies every token's value, so a lowercase
 * letter buried in an ordinary word ("c" -> 100, "m" -> 1000) would make the
 * product uncontrollable and the rule unsolvable. Uppercase-only also keeps
 * rule 10 (include-uppercase Roman numeral) and rule 11 (product) consistent.
 */

const ROMAN_TABLE: readonly [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

const ROMAN_VALUE: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

/** Canonical Roman numeral for a positive integer. */
export function toRoman(n: number): string {
  let out = "";
  let rem = Math.floor(n);
  for (const [v, s] of ROMAN_TABLE) {
    while (rem >= v) {
      out += s;
      rem -= v;
    }
  }
  return out;
}

/**
 * Value of a single Roman token, using the standard subtractive reading (ported
 * verbatim from v1). No canonical-form check: a non-canonical run like "IIII"
 * still reads as 4, matching v1's fromRoman. Every character must be a Roman
 * letter (callers pass maximal [IVXLCDM] runs), so this never returns NaN here.
 */
export function fromRoman(s: string): number {
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i] ?? "";
    const v = ROMAN_VALUE[ch] ?? 0;
    if (v === 0) return NaN;
    if (v < prev) total -= v;
    else total += v;
    prev = v;
  }
  return total;
}

/**
 * Maximal runs of uppercase Roman letters, in order. "XIV" is one token (14),
 * not X*I*V; "X I V" is three tokens (10, 1, 5). Lowercase letters are ignored,
 * so they never form tokens.
 */
export function parseRomanTokens(password: string): string[] {
  return password.match(/[IVXLCDM]+/g) ?? [];
}

/**
 * Product of every Roman token's value. Zero tokens -> 0 (never equal to any
 * authored target, which are all >= 12), so an empty password fails cleanly.
 */
export function romanProduct(password: string): number {
  const tokens = parseRomanTokens(password);
  if (tokens.length === 0) return 0;
  return tokens.reduce((acc, t) => acc * fromRoman(t), 1);
}
