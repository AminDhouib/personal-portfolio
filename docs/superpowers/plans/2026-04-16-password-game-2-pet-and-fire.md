# Password Game 2: Paul the Chicken + Password on Fire Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship two Neal-style interactive hazards that mutate the player's password over time: Paul the chicken (pet that must be fed or he starves) and Password on Fire (characters burn away if not extinguished). Both add real-time stakes — password state can get WORSE while the player works on satisfying rules.

**Architecture:** Both hazards are Tier 4 rules but with lifecycle beyond validation. Each rule gets an optional `onTick(state, deltaMs): Partial<GameState> | null` hook that the engine calls every 100ms. Tick results can mutate the password (remove/replace chars) via a returned partial state. Visual state (Paul's hunger, fire position) lives in component-local React state driven by the rule's params.

**Tech Stack:** Extends existing rule engine with an `onTick` hook; new React components for Paul and fire overlays.

---

## Scope

**In scope:**
- Paul the chicken: appears in password at chaos 4+, must be kept. Hatches after ~30s. After hatching, eats worms — player types 🐛 every N seconds or Paul starves (password invalidated).
- Password on fire: a random character starts burning at chaos 4+. Fire spreads to adjacent chars every ~3s. Player must click burning chars to extinguish. If fire reaches a certain count, characters are consumed (removed).
- `onTick` lifecycle hook on rules

**Out of scope (future):**
- Rain smudging
- Earthquake shuffling
- Gravity pulling letters
- Black hole

---

## File Structure

**Create:**
- `src/components/game/password-game/hazards/paul.tsx` — Paul the chicken UI component + rule def
- `src/components/game/password-game/hazards/fire.tsx` — fire propagation UI + rule def
- `src/components/game/password-game/__tests__/paul.test.ts`
- `src/components/game/password-game/__tests__/fire.test.ts`

**Modify:**
- `src/components/game/password-game/types.ts` — add `onTick` to `Rule` interface
- `src/components/game/password-game/engine.ts` — tick loop helper
- `src/components/game/password-game/rules/tier4.ts` — register Paul + fire as Tier 4 rule pool members
- `src/components/game/password-game/password-game.tsx` — wire tick loop

---

## Task 1: Add onTick to Rule type

**File:** `src/components/game/password-game/types.ts`

- [ ] **Step 1: Extend Rule interface**

Find the `Rule` interface and add the optional tick hook:

```typescript
/** Snapshot returned by a tick — rule can mutate password and formatting. */
export interface TickResult {
  password?: string;
  formatting?: FormattingMap;
  /** Opaque rule-specific state (e.g. Paul's hunger, burning char indices). */
  ruleState?: unknown;
}

export interface Rule {
  id: string;
  tier: Tier;
  description: string;
  params: Record<string, unknown>;
  validate(state: GameState): ValidationResult;
  /**
   * Called every ~100ms while this rule is active or revealed. May mutate
   * password/formatting (e.g. burn characters, remove dead pet). Returns
   * null or undefined to indicate no mutation.
   */
  onTick?(state: GameState, deltaMs: number, ruleState: unknown): TickResult | null;
}
```

Commit: `feat(password-game): add onTick lifecycle hook to Rule type`

---

## Task 2: Tick loop helper in engine

**File:** `src/components/game/password-game/engine.ts`

- [ ] **Step 1: Implement runTicks**

Append:

```typescript
import type { TickResult } from "./types";

export interface TickedState {
  password: string;
  formatting: FormattingMap;
  ruleStates: Record<string, unknown>;
}

/**
 * Run onTick on every rule that has one. Applied in rule order so later
 * rules see the password mutations from earlier ticks this frame. Rule
 * state is threaded back in for the next tick.
 */
export function runTicks(
  state: GameState,
  deltaMs: number,
  ruleStates: Record<string, unknown>
): TickedState {
  let password = state.password;
  let formatting = state.formatting;
  const nextStates: Record<string, unknown> = { ...ruleStates };
  for (const rule of state.rules) {
    if (!rule.onTick) continue;
    const current = { ...state, password, formatting };
    const result = rule.onTick(current, deltaMs, ruleStates[rule.id]);
    if (!result) continue;
    if (result.password !== undefined) password = result.password;
    if (result.formatting !== undefined) formatting = result.formatting;
    if (result.ruleState !== undefined) nextStates[rule.id] = result.ruleState;
  }
  return { password, formatting, ruleStates: nextStates };
}
```

Commit: `feat(password-game): add runTicks engine helper`

---

## Task 3: Paul the chicken rule

**File:** `src/components/game/password-game/hazards/paul.tsx`

Paul rule:
- Token: `🥚` (egg) or `🐔` (hatched chicken) appears in password, player must keep it
- Validator: password must contain 🥚 or 🐔
- Hatches after 30s (egg replaced with chicken)
- After hatching, Paul has `hunger` 0-100. Increases by 5 per second. Worm 🐛 typed in password decreases hunger by 40 and removes the worm
- If hunger reaches 100, Paul dies — the 🐔 gets replaced by 💀 and rule permanently fails ("Paul is dead. Restart.")

```typescript
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
      onTick(state, deltaMs, ruleStateRaw) {
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
```

Write tests: egg appears → hatches after 30s → worms reduce hunger → starvation death.

Commit: `feat(password-game): add Paul the chicken Tier 4 rule`

---

## Task 4: Fire hazard rule

**File:** `src/components/game/password-game/hazards/fire.tsx`

- Password has at least one character replaced with 🔥 at chaos 4+
- Every 3s, fire spreads: another adjacent character becomes 🔥
- Player can "extinguish" by deleting a 🔥 character (Backspace at the fire position)
- If fire consumes > 3 characters, rule fails with "Your password burned up."

```typescript
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
  create(rng) {
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
      onTick(state, _deltaMs, ruleStateRaw) {
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
```

Tests: ignition, spread, successful extinguish, burn-out failure.

Commit: `feat(password-game): add password-on-fire Tier 4 rule`

---

## Task 5: Register in Tier 4 pool

**File:** `src/components/game/password-game/rules/tier4.ts`

- [ ] **Step 1: Import + add to TIER_4_RULES**

```typescript
import { paulRule } from "../hazards/paul";
import { fireRule } from "../hazards/fire";

export const TIER_4_RULES: readonly RuleDef[] = [
  lengthBomb,
  clockRule,
  forbiddenVowel,
  mysteryRule,
  paulRule,
  fireRule,
];
```

- [ ] **Step 2: Commit**

Commit: `feat(password-game): add Paul and fire rules to Tier 4 pool`

---

## Task 6: Wire tick loop in game

**File:** `src/components/game/password-game/password-game.tsx`

- [ ] **Step 1: Add tick state + effect**

```typescript
const ruleStatesRef = useRef<Record<string, unknown>>({});

useEffect(() => {
  if (!timerRunning) return;
  const id = window.setInterval(() => {
    const currentState: GameState = {
      password,
      formatting,
      elapsedSeconds,
      activeRuleIndex: activeIdx,
      rules,
      seed,
    };
    const result = runTicks(currentState, 100, ruleStatesRef.current);
    ruleStatesRef.current = result.ruleStates;
    if (result.password !== password) setPassword(result.password);
    if (result.formatting !== formatting) setFormatting(result.formatting);
  }, 100);
  return () => window.clearInterval(id);
}, [timerRunning, password, formatting, elapsedSeconds, activeIdx, rules, seed]);
```

- [ ] **Step 2: Reset ruleStates on new seed**

In the `reset` and `startDaily` callbacks, add:

```typescript
ruleStatesRef.current = {};
```

Commit: `feat(password-game): wire tick loop into game component`

---

## Task 7: Verification

- [ ] **Step 1: Play a seed with Paul drawn**

Repeatedly new-seed until a run includes the `paul` rule. Verify:
- 🥚 appears in password once Paul rule fires (player must type it)
- After 30s, 🥚 → 🐔
- Typing 🐛 decreases hunger
- Without feeding, 🐔 eventually becomes 💀 and the rule fails

- [ ] **Step 2: Play a seed with Fire drawn**

Verify:
- A letter becomes 🔥 once password is >=6 chars
- Fire spreads to adjacent letter every ~3s
- Pressing Backspace at a 🔥 removes it
- If 4+ 🔥 accumulate, rule fails

- [ ] **Step 3: Run full test suite**

```bash
npm test -- password-game
```

All tests should pass.
