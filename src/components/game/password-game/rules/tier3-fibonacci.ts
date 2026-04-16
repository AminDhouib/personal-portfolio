import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Returns the nth Fibonacci number with convention F(1)=1, F(2)=1, F(3)=2...
 */
function fib(n: number): number {
  let a = 1;
  let b = 1;
  for (let i = 2; i < n; i++) {
    const c = a + b;
    a = b;
    b = c;
  }
  return n <= 2 ? 1 : b;
}

function nth(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  if (n >= 11 && n <= 13) return `${n}th`;
  const lastDigit = n % 10;
  if (lastDigit === 1) return `${n}st`;
  if (lastDigit === 2) return `${n}nd`;
  if (lastDigit === 3) return `${n}rd`;
  return `${n}th`;
}

export const fibonacciRule: RuleDef = {
  id: "fibonacci",
  tier: 3,
  create(rng) {
    const n = rangeInt(rng, 10, 20);
    const value = fib(n);
    return {
      id: "fibonacci",
      tier: 3,
      description: `Your password must include the ${nth(n)} Fibonacci number. (F(1)=1, F(2)=1, F(3)=2, F(4)=3, …)`,
      params: { n, value },
      validate(state) {
        const pattern = new RegExp(`(?<!\\d)${value}(?!\\d)`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
