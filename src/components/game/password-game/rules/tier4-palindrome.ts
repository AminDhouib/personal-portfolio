import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Palindrome rule — tier 4. The player's password must contain a palindrome
 * of at least N alphanumeric characters (case-insensitive; non-alphanumerics
 * are ignored when checking). Example satisfiers: "level", "racecar", "noon"
 * within the larger password.
 *
 * Uses an expand-around-center scan so a 50-char password is cheap.
 */
function hasPalindromeOfLength(text: string, minLen: number): boolean {
  // Compare alnum-only, lowercase, so "A man a plan" style passes if embedded.
  // We also remember the mapping back to original positions for length counts.
  const clean: string[] = [];
  for (const ch of text) {
    if (/[a-zA-Z0-9]/.test(ch)) clean.push(ch.toLowerCase());
  }
  const n = clean.length;
  if (n < minLen) return false;
  // Expand-around-center for every possible center.
  for (let center = 0; center < n; center++) {
    // Odd-length palindromes centered on `center`.
    let l = center, r = center;
    while (l >= 0 && r < n && clean[l] === clean[r]) { l--; r++; }
    if (r - l - 1 >= minLen) return true;
    // Even-length palindromes between center and center+1.
    l = center; r = center + 1;
    while (l >= 0 && r < n && clean[l] === clean[r]) { l--; r++; }
    if (r - l - 1 >= minLen) return true;
  }
  return false;
}

export const palindromeRule: RuleDef = {
  id: "palindrome",
  tier: 4,
  create(rng) {
    const minLen = rangeInt(rng, 5, 7);
    return {
      id: "palindrome",
      tier: 4,
      description: `Your password must contain a palindrome of at least ${minLen} letters.`,
      params: { minLen },
      validate(state) {
        return { passed: hasPalindromeOfLength(state.password, minLen) };
      },
    };
  },
};
