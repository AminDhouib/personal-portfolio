import type { RuleDef } from "../types";
import { pickOne } from "../prng";

interface Fact {
  q: string;
  /** Integer only — we check for this as a standalone integer match. */
  a: number;
}

const FACTS: readonly Fact[] = [
  { q: "the speed of light in vacuum, in meters per second", a: 299792458 },
  { q: "the height of Mount Everest, in meters", a: 8849 },
  { q: "the average distance from Earth to the Moon, in kilometers", a: 384400 },
  { q: "the radius of Earth, in kilometers (rounded)", a: 6371 },
  { q: "the number of known chemical elements", a: 118 },
  { q: "the number of seconds in a day", a: 86400 },
  { q: "the boiling point of water, in Fahrenheit", a: 212 },
  { q: "the number of bones in the adult human body", a: 206 },
  { q: "the number of countries recognized by the UN", a: 193 },
  { q: "the year the first moon landing took place", a: 1969 },
  { q: "the depth of the Mariana Trench, in meters (rounded)", a: 10994 },
  { q: "the number of chromosomes in a human cell", a: 46 },
];

export const physicsFactRule: RuleDef = {
  id: "physics-fact",
  tier: 3,
  create(rng) {
    const fact = pickOne(rng, FACTS);
    return {
      id: "physics-fact",
      tier: 3,
      description: `Your password must include ${fact.q}.`,
      params: { q: fact.q, a: fact.a },
      validate(state) {
        const pattern = new RegExp(`(?<!\\d)${fact.a}(?!\\d)`);
        return { passed: pattern.test(state.password) };
      },
    };
  },
};
