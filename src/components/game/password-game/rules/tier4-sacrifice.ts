import type { RuleDef } from "../types";

/**
 * Sacrifice rule — tier 4. On first activation, picks two distinct letters
 * currently in the password and forbids them for the rest of the run. The
 * pick is stable after activation (stored in the rule's closure) so the
 * player can reason about which letters to strip.
 *
 * We wait until the password has at least three unique letters before
 * locking in the sacrifice, so the pick isn't trivially everything.
 */
export const sacrificeRule: RuleDef = {
  id: "sacrifice",
  tier: 4,
  create(rng) {
    // Consume two seeded values up-front. They index into the player's
    // unique-letters list at activation time, so the picks are seeded but
    // password-dependent.
    const p1 = rng();
    const p2 = rng();
    let banned: readonly [string, string] | null = null;

    return {
      id: "sacrifice",
      tier: 4,
      description:
        "Two letters in your password must be sacrificed. Once chosen, they can never appear again.",
      params: {},
      validate(state) {
        const pw = state.password;
        const pwLower = pw.toLowerCase();

        if (!banned) {
          const unique: string[] = [];
          for (const ch of pwLower) {
            if (/[a-z]/.test(ch) && !unique.includes(ch)) unique.push(ch);
          }
          if (unique.length < 3) {
            return {
              passed: true,
              message: "Waiting for your password to grow before the sacrifice…",
            };
          }
          const i1 = Math.floor(p1 * unique.length);
          let i2 = Math.floor(p2 * unique.length);
          if (i2 === i1) i2 = (i2 + 1) % unique.length;
          banned = [unique[i1], unique[i2]];
        }

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
    };
  },
};
