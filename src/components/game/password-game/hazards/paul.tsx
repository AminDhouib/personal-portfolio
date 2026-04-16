import type { RuleDef, TickResult } from "../types";

interface PaulState {
  hatched: boolean;
  hunger: number;        // 0-100
  hatchAt: number;       // ms timestamp when hatching happens
  dead: boolean;
  firstSeen: number | null;
}

const EGG = "🥚";
const CHICKEN = "🐔";
const WORM = "🐛";
const DEAD = "💀";

export const paulRule: RuleDef = {
  id: "paul",
  tier: 4,
  create() {
    return {
      id: "paul",
      tier: 4,
      description: `${EGG} Meet Paul. Keep him in your password. When he hatches, feed him ${WORM} or he starves.`,
      params: {},
      validate(state) {
        const hasEgg = state.password.includes(EGG);
        const hasChicken = state.password.includes(CHICKEN);
        const isDead = state.password.includes(DEAD);
        if (isDead) return { passed: false, message: "Paul has starved." };
        return { passed: hasEgg || hasChicken, message: hasEgg || hasChicken ? "Paul is safe" : "Paul is missing." };
      },
      onTick(state, deltaMs, ruleStateRaw): TickResult | null {
        const ruleState = (ruleStateRaw ?? {
          hatched: false,
          hunger: 0,
          hatchAt: 0,
          dead: false,
          firstSeen: null,
        }) as PaulState;

        const now = Date.now();

        // Record first sighting.
        if (ruleState.firstSeen === null && state.password.includes(EGG)) {
          return {
            ruleState: { ...ruleState, firstSeen: now, hatchAt: now + 30_000 },
          };
        }

        // Hatch: replace egg with chicken.
        if (!ruleState.hatched && ruleState.hatchAt > 0 && now >= ruleState.hatchAt && state.password.includes(EGG)) {
          const nextPassword = state.password.replace(EGG, CHICKEN);
          return {
            password: nextPassword,
            ruleState: { ...ruleState, hatched: true, hunger: 0 },
          };
        }

        // Post-hatch: consume worms and manage hunger.
        if (ruleState.hatched && !ruleState.dead) {
          // Consume worms in the password — one worm drops hunger by 40.
          let pw = state.password;
          let hunger = ruleState.hunger;
          const wormIdx = pw.indexOf(WORM);
          if (wormIdx !== -1) {
            pw = pw.replace(WORM, "");
            hunger = Math.max(0, hunger - 40);
          }

          // Hunger ticks up.
          hunger = Math.min(100, hunger + (deltaMs / 1000) * 5);

          // Death.
          if (hunger >= 100 && !ruleState.dead) {
            const deadPw = pw.replace(CHICKEN, DEAD);
            return {
              password: deadPw,
              ruleState: { ...ruleState, hunger: 100, dead: true },
            };
          }

          if (pw !== state.password || hunger !== ruleState.hunger) {
            return {
              password: pw,
              ruleState: { ...ruleState, hunger },
            };
          }
        }

        return null;
      },
    };
  },
};
