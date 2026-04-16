import type { RuleDef, TickResult } from "../types";

interface FireState {
  ignitedAt: number | null;
  lastSpreadAt: number;
  spreadInterval: number; // ms
  maxFires: number;
}

const FIRE = "🔥";

export const fireRule: RuleDef = {
  id: "fire",
  tier: 4,
  create(_rng) {
    const spreadInterval = 3000 + Math.floor(Math.random() * 2000);
    const maxFires = 3;
    return {
      id: "fire",
      tier: 4,
      description: `${FIRE} Your password is on fire. Delete the ${FIRE} characters before they spread.`,
      params: { spreadInterval, maxFires },
      validate(state) {
        const fireCount = [...state.password].filter((c) => c === FIRE).length;
        if (fireCount > maxFires) return { passed: false, message: "Your password burned up." };
        // Pass only when no fire remains AND the rule has ignited at least once.
        return { passed: fireCount === 0, message: fireCount > 0 ? `${fireCount} ${FIRE} active` : "Fire out" };
      },
      onTick(state, _deltaMs, ruleStateRaw): TickResult | null {
        const ruleState = (ruleStateRaw ?? {
          ignitedAt: null,
          lastSpreadAt: 0,
          spreadInterval,
          maxFires,
        }) as FireState;
        const now = Date.now();

        // Initial ignition — pick a random letter in the password and replace
        // with FIRE once the password is long enough.
        if (ruleState.ignitedAt === null && state.password.length >= 6) {
          const chars = [...state.password];
          // Ignite the first letter that's not already a fire/emoji.
          const candidateIndex = chars.findIndex((c) => /[a-zA-Z]/.test(c));
          if (candidateIndex >= 0) {
            chars[candidateIndex] = FIRE;
            return {
              password: chars.join(""),
              ruleState: { ...ruleState, ignitedAt: now, lastSpreadAt: now },
            };
          }
          return null;
        }

        // Spread: on interval, pick a char adjacent to an existing fire.
        if (ruleState.ignitedAt !== null && now - ruleState.lastSpreadAt >= ruleState.spreadInterval) {
          const chars = [...state.password];
          const currentFires = chars.reduce((n, c) => n + (c === FIRE ? 1 : 0), 0);
          if (currentFires > 0 && currentFires <= ruleState.maxFires) {
            const fireIndexes = chars.map((c, i) => (c === FIRE ? i : -1)).filter((i) => i >= 0);
            const anchor = fireIndexes[Math.floor(Math.random() * fireIndexes.length)];
            // Try spreading left or right to a letter.
            const candidates = [anchor - 1, anchor + 1].filter(
              (i) => i >= 0 && i < chars.length && /[a-zA-Z]/.test(chars[i])
            );
            if (candidates.length > 0) {
              const target = candidates[Math.floor(Math.random() * candidates.length)];
              chars[target] = FIRE;
              return {
                password: chars.join(""),
                ruleState: { ...ruleState, lastSpreadAt: now },
              };
            }
            // No adjacent letters — reset the timer anyway so we retry.
            return { ruleState: { ...ruleState, lastSpreadAt: now } };
          }
        }

        return null;
      },
    };
  },
};
