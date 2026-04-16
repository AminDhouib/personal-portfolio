import type { RuleDef } from "../types";
import { pickOne } from "../prng";

interface Sequence {
  name: string;
  terms: readonly number[];
  next: number;
}

const SEQUENCES: readonly Sequence[] = [
  { name: "arithmetic", terms: [3, 6, 9, 12], next: 15 },
  { name: "arithmetic", terms: [5, 10, 15, 20], next: 25 },
  { name: "geometric", terms: [2, 4, 8, 16], next: 32 },
  { name: "geometric", terms: [3, 9, 27, 81], next: 243 },
  { name: "squares", terms: [1, 4, 9, 16], next: 25 },
  { name: "squares", terms: [4, 9, 16, 25], next: 36 },
  { name: "cubes", terms: [1, 8, 27, 64], next: 125 },
  { name: "triangular", terms: [1, 3, 6, 10], next: 15 },
  { name: "triangular", terms: [3, 6, 10, 15], next: 21 },
  { name: "primes", terms: [2, 3, 5, 7], next: 11 },
  { name: "primes", terms: [11, 13, 17, 19], next: 23 },
  { name: "powers of 2", terms: [1, 2, 4, 8], next: 16 },
  { name: "doubled +1", terms: [1, 3, 7, 15], next: 31 },
  { name: "fibonacci", terms: [1, 1, 2, 3], next: 5 },
  { name: "fibonacci", terms: [5, 8, 13, 21], next: 34 },
];

export const sequenceRule: RuleDef = {
  id: "sequence",
  tier: 3,
  create(rng) {
    const seq = pickOne(rng, SEQUENCES);
    const preview = seq.terms.join(", ");
    return {
      id: "sequence",
      tier: 3,
      description: `Your password must include the next number in this sequence: ${preview}, ?`,
      params: { terms: seq.terms, next: seq.next, name: seq.name },
      validate(state) {
        const pattern = new RegExp(`(?<!\\d)${seq.next}(?!\\d)`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
