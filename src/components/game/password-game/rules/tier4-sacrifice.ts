import type { RuleDef } from "../types";

export const sacrificeRule: RuleDef = {
  id: "sacrifice",
  tier: 4,
  create(rng) {
    const p1 = rng();
    const p2 = rng();
    const params: Record<string, unknown> = {};

    return {
      id: "sacrifice",
      tier: 4,
      description:
        "Two letters in your password must be sacrificed. Once chosen, they can never appear again.",
      params,
      validate(state) {
        const banned = params.banned as readonly [string, string] | undefined;
        if (!banned) {
          return {
            passed: true,
            message: "Waiting for your password to grow before the sacrifice…",
          };
        }

        const pwLower = state.password.toLowerCase();
        const offenders = banned.filter((b) => pwLower.includes(b));
        if (offenders.length > 0) {
          return {
            passed: false,
            message: `Sacrificed letters: ${banned
              .map((l) => l.toUpperCase())
              .join(", ")}. Remove them from your password.`,
          };
        }
        return {
          passed: true,
          message: `Sacrificed: ${banned.map((l) => l.toUpperCase()).join(", ")}`,
        };
      },
      onTick(state) {
        if (params.banned) return null;
        const pwLower = state.password.toLowerCase();
        const unique: string[] = [];
        for (const ch of pwLower) {
          if (/[a-z]/.test(ch) && !unique.includes(ch)) unique.push(ch);
        }
        if (unique.length < 3) return null;
        const i1 = Math.floor(p1 * unique.length);
        let i2 = Math.floor(p2 * unique.length);
        if (i2 === i1) i2 = (i2 + 1) % unique.length;
        params.banned = Object.freeze([unique[i1], unique[i2]]);
        return null;
      },
    };
  },
};
