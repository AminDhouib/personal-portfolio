# Orbital Dodge Feature Roadmap

> **For agentic workers:** This is NOT an executable plan. It is the index + dependency map for the six sibling plans listed below. Pick one of those plans and use superpowers:subagent-driven-development to execute it.

**Goal:** Lift Orbital Dodge from "nice 3D endless runner" to "sticky mobile-runner-grade experience" with a real retention loop, skill expression, challenge variety, polish, and onboarding.

**Why this roadmap exists:** In the previous session we delivered anti-camping correctly but realized, too late, that the broader backlog (combo multiplier, shop, bosses, gyro, post-processing, tutorial, achievements, dash, etc.) had been verbally approved but never captured in any plan. This roadmap captures the outstanding work so nothing is lost, and splits it into independently executable plans — which is what the writing-plans skill asks for when a spec covers multiple disjoint subsystems.

**Tech Stack:** TypeScript, React 19, Next.js 16, `@react-three/fiber`, Three.js, Web Audio API, `next-themes`. New deps proposed in Plan 5 only (`@react-three/postprocessing`).

---

## The six plans

| # | Plan | Subsystem | Est. tasks | Depends on |
|---|---|---|---|---|
| 1 | [`2026-04-16-orbital-dodge-combo-and-nearmiss.md`](./2026-04-16-orbital-dodge-combo-and-nearmiss.md) | Combat | ~8 | — |
| 2 | [`2026-04-16-orbital-dodge-shop-phase-1.md`](./2026-04-16-orbital-dodge-shop-phase-1.md) | Economy foundation | ~14 | Plan 1 |
| 3 | [`2026-04-16-orbital-dodge-shop-phase-2.md`](./2026-04-16-orbital-dodge-shop-phase-2.md) | Economy depth | ~18 | Plan 2 |
| 4 | [`2026-04-16-orbital-dodge-bosses.md`](./2026-04-16-orbital-dodge-bosses.md) | Enemies | ~22 | — (parallel to economy track) |
| 5 | [`2026-04-16-orbital-dodge-polish.md`](./2026-04-16-orbital-dodge-polish.md) | Polish / platform | ~14 | — |
| 6 | [`2026-04-16-orbital-dodge-tutorial-achievements-dash.md`](./2026-04-16-orbital-dodge-tutorial-achievements-dash.md) | Onboarding + meta + skill | ~12 | Plan 3 (for cosmetic unlocks only) |

Total: ~88 tasks. If you execute them serially at ~1 day per plan, about 2 weeks of focused work.

---

## Dependency graph

```
Plan 1 (combo) ─────► Plan 2 (shop v1) ─────► Plan 3 (shop v2) ─────► Plan 6 (achievements link cosmetics)
                                                                       │
                                                                       └──► Plan 6 (tutorial + dash independent)

Plan 4 (bosses) ─── no deps ───► shippable in parallel to economy track
Plan 5 (polish) ─── no deps ───► shippable any time, including in parallel
```

## Recommended execution order

If delivering sequentially:

1. **Plan 1 (Combo + Near-miss)** — foundational, validates the gameplay shift
2. **Plan 2 (Shop Phase 1)** — delivers the core retention loop
3. **Plan 4 (Bosses)** — by this point you need variety; economy rewards feel flat without bosses to spend on
4. **Plan 5 (Polish)** — once the systems work, make them look good
5. **Plan 3 (Shop Phase 2)** — now that bosses exist, ships + consumables have more to interact with
6. **Plan 6 (Tutorial + Achievements + Dash)** — ships the skill ceiling + onboarding once there's enough game to learn

If parallelizing with a second developer or subagent-dispatch fan-out:
- Track A: Plans 1 → 2 → 3
- Track B: Plan 4 (bosses, independent)
- Track C: Plan 5 (polish, independent)
- Finish with Plan 6 to tie it together

---

## Global invariants

These apply across every plan. Each plan assumes these hold.

### Profile schema (one localStorage key: `orbital-dodge-profile`)

Introduced in Plan 2. Every subsequent plan reads/writes this schema. Version field allows additive migrations:

```ts
interface Profile {
  v: 1;                              // schema version
  firstRunCompleted: boolean;        // flips shop UX from minimal to full
  totalRunsPlayed: number;
  totalCoinsEarned: number;          // lifetime, never decreases
  walletCoins: number;               // spendable balance
  totalAsteroidsDestroyed: number;
  totalDistance: number;
  totalBossesDefeated: number;       // set to 0 until Plan 4 ships
  ownedUpgrades: Record<string, number>; // upgradeId → level (0-5)
  ownedCosmetics: string[];          // cosmeticIds
  equippedShip: string;              // default 'falcon'
  equippedHull: string | null;
  equippedEngine: string | null;
  equippedDeathFx: string | null;
  unlockedAchievements: string[];    // achievementIds
  consumableInventory: Record<string, number>; // consumableId → count
  missionsToday: { id: string; progress: number; claimed: boolean }[];
  missionsResetDate: string;         // ISO date of last reset
  tutorialComplete: boolean;
}
```

Expose via a single module `src/components/game/profile.ts` with `loadProfile()`, `saveProfile()`, and helper mutators. Every gameplay system calls through this module — never writes `localStorage` directly for profile data.

### First-timer detection

Used by shop, tutorial, and achievement systems:

```ts
const isFirstTimer = !profile.firstRunCompleted;
```

- First-timer sees minimal UI: just the existing "Move your mouse or press WASD to start" pill
- Returning player sees rich UI: Play button + Shop button + coin counter + mission progress + etc.

### The `firstRunCompleted` flag flips at the moment the player enters `dying` status for the first time (i.e., they died at least once). Not at first input — a player who abandons their first run never triggers it.

### No gameplay-upgrade during first run

Upgrades purchased between runs apply at run start. The first run is at baseline. New visitors never feel handicapped.

### Prestige path (mentioned in shop discussion, DEFERRED)

User asked about meta-progression but Plan 3 captures it lightly via milestone unlocks. A full Prestige system (reset upgrades for permanent coin multiplier) is not in any of the six plans. If desired later, it would be a Plan 7.

---

## Acceptance for the full backlog

Each plan defines its own acceptance. The **roadmap-level** acceptance (i.e., "is the retention loop real?") is satisfied when:

- A new visitor can play for 2 minutes and enjoy the game with no shop knowledge
- A returning visitor sees earned coins on the death screen and feels compelled to check the shop
- After 5-10 runs, a returning player has bought 2-3 upgrades and feels noticeably stronger
- At least one boss has been defeated and the rewards felt meaningful
- The polish pass (bloom, music, gyro) has been felt on mobile and desktop
- The tutorial converts first-timers into second-run players at measurably higher rate (tracked via `totalRunsPlayed ≥ 2` in profile)

---

## What is NOT in this roadmap

Explicitly deferred (not ignored — flagged for future):

- **Prestige / reset-for-permanent-bonus** (full meta-progression layer)
- **Multiplayer** (scope creep)
- **Narrative / cutscenes** (wrong vibe)
- **Paid cosmetics / monetization** (portfolio piece)
- **Daily seed challenges with shared RNG** (proposed in earlier discussion — can become Plan 7)
- **Background music as real audio files** (procedural generation is already shipping, asset files would bloat bundle)
- **InstancedMesh conversion for perf** (separate engine work; propose if performance becomes a real issue on weak mobile)

If any of these move up in priority, spin a new plan off this roadmap.

---

## How to pick up work from this roadmap

1. Read this file end-to-end.
2. Pick the plan you intend to execute.
3. Read that plan's acceptance criteria before starting — make sure you agree with what "done" looks like.
4. Check dependencies above; execute prerequisite plans first if not done.
5. Use `superpowers:subagent-driven-development` to execute the plan task-by-task.
6. When the plan is complete, check its final acceptance criteria. Update this roadmap file's status table below.

## Plan status

| Plan | Status | Completed |
|---|---|---|
| 1 — Combo + Near-miss | COMPLETED | 2026-04-16 |
| 2 — Shop Phase 1 | COMPLETED | 2026-04-16 |
| 3 — Shop Phase 2 | NOT STARTED | — |
| 4 — Bosses | NOT STARTED | — |
| 5 — Polish | NOT STARTED | — |
| 6 — Tutorial + Achievements + Dash | NOT STARTED | — |

Update this table after each plan ships.
