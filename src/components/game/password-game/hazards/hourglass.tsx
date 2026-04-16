import type { RuleDef, TickResult } from "../types";

interface HourglassState {
  startedAt: number | null;
  lastCorruptionAt: number;
  interval: number;
}

const VOWEL_RE = /[aeiouAEIOU]/;

/**
 * Hourglass hazard — tier 4. Every ~12s while armed, one random vowel in the
 * player's password is silently replaced with "_". The rule passes only when
 * the password contains no underscores. Arms once the password reaches 8+
 * characters so the player isn't immediately punished.
 */
export const hourglassRule: RuleDef = {
  id: "hourglass",
  tier: 4,
  create(rng) {
    const interval = 10000 + Math.floor(rng() * 5000);
    return {
      id: "hourglass",
      tier: 4,
      description: `Sand is draining — every ~${Math.round(interval / 1000)}s a random vowel in your password is replaced with "_". Keep your password underscore-free.`,
      params: { interval },
      validate(state) {
        const underscores = [...state.password].filter((c) => c === "_").length;
        return {
          passed: underscores === 0,
          message: underscores > 0 ? `${underscores} quarantined` : undefined,
        };
      },
      onTick(state, _dt, ruleStateRaw): TickResult | null {
        const rs = (ruleStateRaw ?? {
          startedAt: null,
          lastCorruptionAt: 0,
          interval,
        }) as HourglassState;
        const now = Date.now();

        if (rs.startedAt === null) {
          if (state.password.length < 8) return null;
          return { ruleState: { ...rs, startedAt: now, lastCorruptionAt: now } };
        }

        if (now - rs.lastCorruptionAt < rs.interval) return null;

        const chars = [...state.password];
        const vowelIdx: number[] = [];
        for (let i = 0; i < chars.length; i++) {
          if (VOWEL_RE.test(chars[i])) vowelIdx.push(i);
        }
        if (vowelIdx.length === 0) {
          return { ruleState: { ...rs, lastCorruptionAt: now } };
        }
        const pick = vowelIdx[Math.floor(Math.random() * vowelIdx.length)];
        chars[pick] = "_";
        return {
          password: chars.join(""),
          ruleState: { ...rs, lastCorruptionAt: now },
        };
      },
    };
  },
};
