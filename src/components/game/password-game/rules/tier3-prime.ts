import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function primesInRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) if (isPrime(n)) out.push(n);
  return out;
}

/**
 * Prime number rule — tier 3. The player's password must contain a prime
 * number that falls inside the stated inclusive range.
 */
export const primeRule: RuleDef = {
  id: "prime-range",
  tier: 3,
  create(rng) {
    // Pick a range that guarantees at least one prime. Retry a handful of
    // times if the first pick is prime-free (rare for small widths).
    let min = 0;
    let max = 0;
    let primes: number[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const width = rangeInt(rng, 12, 30);
      min = rangeInt(rng, 2, 100 - width);
      max = min + width;
      primes = primesInRange(min, max);
      if (primes.length > 0) break;
    }
    const primeSet = new Set(primes);
    return {
      id: "prime-range",
      tier: 3,
      description: `Your password must include a prime number between ${min} and ${max}.`,
      params: { min, max, primes },
      validate(state) {
        // Extract every standalone integer and test for primality membership.
        const matches = state.password.match(/(?<!\d)\d+(?!\d)/g) ?? [];
        for (const m of matches) {
          const n = Number(m);
          if (Number.isFinite(n) && primeSet.has(n)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};
