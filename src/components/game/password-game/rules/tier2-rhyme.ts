import type { RuleDef } from "../types";
import { pickOne } from "../prng";

interface RhymeGroup {
  /** The word shown to the player. */
  prompt: string;
  /** Words that rhyme with the prompt (all lowercase). */
  rhymes: readonly string[];
}

const RHYMES: readonly RhymeGroup[] = [
  { prompt: "cat", rhymes: ["bat", "hat", "mat", "rat", "sat", "fat", "pat", "vat", "flat", "chat"] },
  { prompt: "fight", rhymes: ["light", "might", "night", "right", "sight", "tight", "bright", "flight", "height", "knight"] },
  { prompt: "cool", rhymes: ["pool", "fool", "tool", "rule", "school", "drool", "stool", "jewel"] },
  { prompt: "sing", rhymes: ["ring", "king", "wing", "thing", "bring", "spring", "sting", "string", "fling"] },
  { prompt: "door", rhymes: ["more", "four", "score", "store", "shore", "pour", "core", "bore", "chore", "wore"] },
  { prompt: "sky", rhymes: ["fly", "cry", "dry", "try", "shy", "pie", "tie", "why", "high", "lie"] },
  { prompt: "snake", rhymes: ["bake", "cake", "lake", "make", "rake", "take", "shake", "stake", "wake"] },
  { prompt: "bone", rhymes: ["stone", "phone", "cone", "zone", "alone", "drone", "clone", "throne", "groan", "moan"] },
  { prompt: "tree", rhymes: ["bee", "knee", "free", "flee", "sea", "agree", "three", "me", "key", "plea"] },
  { prompt: "rock", rhymes: ["lock", "sock", "dock", "block", "clock", "flock", "knock", "shock", "talk", "walk"] },
];

export const rhymeRule: RuleDef = {
  id: "rhyme",
  tier: 2,
  create(rng) {
    const group = pickOne(rng, RHYMES);
    return {
      id: "rhyme",
      tier: 2,
      description: `Your password must include a word that rhymes with "${group.prompt}".`,
      params: { prompt: group.prompt, rhymes: group.rhymes },
      validate(state) {
        const pw = state.password.toLowerCase();
        return {
          passed: group.rhymes.some((r) => pw.includes(r)),
        };
      },
    };
  },
};
