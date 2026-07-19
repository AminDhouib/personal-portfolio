# The Password Game 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "The Password Game 2: Terms and Conditions Apply" — a five-act, ~25-minute, stream-first sequel that replaces v1 at `/games/password-game`, per `docs/specs/2026-07-18-password-game-2-design.md`.

**Architecture:** A pure, seeded engine (mutable store ticked by requestAnimationFrame; no DOM access) drives rules, a Director-scheduled event system (12 events in 4 families plus a finale boss), and a stats/receipt pipeline. Rendering is split: per-character DOM cells for the password (so characters can be abducted, infected, orbited), one canvas overlay for creatures/fleets/projectiles at 60fps, and plain DOM for chrome events and the finale. Postgres leaderboard keyed on completion time per seed.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 + a scoped CSS file, Canvas 2D (no three.js), Web Audio (procedural, limiter bus), Postgres via `src/lib/db.ts`, vitest.

**Standing rules for every task:**

- No emojis anywhere — creature/effect art is SVG or canvas-drawn sprites.
- v1 (`src/components/game/password-game/`) stays in the tree until Task 15 so ports can read it. Do not modify v1 files before Task 15.
- Never touch `.data/`. Tests that need FS use `fs.mkdtemp`; DB tests mock `getPool`.
- Engine code never imports React or touches `document`/`window`.
- Run the targeted tests in each task; the full gate sweep runs in Task 16.
- Commit after each task (work directly on main), message prefix `feat(pg2):` unless noted.

---

## File structure (target state)

```
src/components/game/password-game-2/
  index.tsx                    # dynamic loader (ssr:false) exported to the page
  engine/
    rng.ts                     # mulberry32, pickOne, pickN, rangeInt, fnv1a, dailySeed
    types.ts                   # all shared engine types (the load-bearing contract)
    cells.ts                   # CharCell helpers: toString, insert, delete, find
    effects.ts                 # Effect queue helpers (engine -> stage side channel)
    engine.ts                  # createRun, tick, input dispatch, act machine, submit
    director.ts                # act slot scripts, seeded schedule resolution
    rules/
      index.ts                 # CORE_RULES manifest (fixed authored order)
      *.ts                     # one file per rule (or tight group)
    events/
      index.ts                 # EVENT_DEFS manifest
      gerald.ts campfire.ts garden.ts
      infection.ts black-hole.ts parasite.ts
      galaga.ts snake.ts tetris.ts
      cookie-banner.ts autocorrect.ts loading-bar.ts
      finale.ts                # three-phase boss orchestration
    __tests__/                 # vitest for everything above
  stage/
    game-shell.tsx             # top component: start screen, HUD, act cards, receipt, rAF loop
    char-stage.tsx             # per-character DOM password box + caret + focus capture
    canvas-overlay.tsx         # DPR-scaled canvas, dispatches to painters
    painters.ts                # per-event canvas painters registry
    rule-list.tsx              # numbered rule cards, active-first ordering
    chrome-events.tsx          # DOM renderers: cookie banner, autocorrect settings, loading bar
    finale-stage.tsx           # DOM for EULA phase + runaway button; canvas for missiles
    receipt-card.tsx           # end-run receipt + name entry + race-this-seed
    hud.tsx                    # timer, act label, sound toggle, seed display
    pg2.css                    # scoped styles (imported by game-shell)
  sound/
    audio.ts                   # lazy AudioContext, limiter bus, gain buses
    motifs.ts                  # stingers, telegraph cues, act fanfares, finale theme
src/app/games/password-game/page.tsx          # rewritten to mount PG2
src/app/api/password-game/leaderboard/route.ts # rewritten against pg2 table
db/init.sql                                    # + pg2_leaderboard_entries
src/app/games/games-meta.ts                    # card unhidden, new copy
```

Kept as-is (PG2 consumes them): `src/app/api/password-game/{wordle,chess-puzzle,countries}/route.ts`, `src/data/password-game/*` (data modules + setters), `src/lib/{db,route-guard,player-name,log}.ts`.

Deleted in Task 15: `src/components/game/password-game/` (entire directory), `src/app/games/password-game/leaderboard/` (folded into the receipt/shell).

---

### Task 1: RNG + core types + cell model

**Files:**

- Create: `src/components/game/password-game-2/engine/rng.ts`
- Create: `src/components/game/password-game-2/engine/types.ts`
- Create: `src/components/game/password-game-2/engine/cells.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/rng.test.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/cells.test.ts`

- [ ] **Step 1: Port RNG from v1 and add seed hashing.** Copy `mulberry32`, `pickOne`, `pickN`, `rangeInt` verbatim from `src/components/game/password-game/prng.ts` into `rng.ts`, then add:

```ts
/** FNV-1a 32-bit hash of a string. Used for daily seeds and sub-seeds. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic daily seed from the local date (YYYY-MM-DD). */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return fnv1a(`pg2-${y}-${m}-${d}`);
}

/** Stable sub-seed so each subsystem gets an independent stream. */
export function subSeed(seed: number, label: string): number {
  return (seed ^ fnv1a(label)) >>> 0;
}
```

- [ ] **Step 2: Write `types.ts` — the full engine contract.** Every later task references these exact names:

```ts
import type { Rng } from "./rng";

export type ActId = "prologue" | "act1" | "act2" | "act3" | "finale";
export type EventFamily = "inhabitant" | "force" | "invasion" | "chrome";
export type EventPhase = "telegraph" | "onset" | "peak" | "resolving" | "done";
export type CellStatus =
  | "normal"
  | "infected"
  | "mutated"
  | "orbiting" // captured by the black hole; excluded from password value
  | "abducted" // carried by an alien / swallowed by the snake; excluded from value
  | "garbage" // tetris junk; INCLUDED in password value
  | "parasite" // mimic; rendered but excluded from password value
  | "ember"; // campfire scar; cosmetic, excluded from value

export interface CharCell {
  id: number; // stable identity for animation; monotonic per run
  ch: string; // single code point
  status: CellStatus;
  eventTag?: string; // owning event id when status !== "normal"
}

export interface ValidationResult {
  passed: boolean;
  message?: string;
}

/** Injected clock/event access so rules stay pure and testable. */
export interface RuleApi {
  isEventActive(id: string): boolean;
  isEventDone(id: string): boolean;
  getEventData<S>(id: string): S | null;
  /** Wall-clock HH:MM for the current-time rule; injected for tests. */
  nowHHMM(): string;
}

export interface Pg2Rule {
  id: string;
  act: ActId; // act in which it is revealed
  description: string; // final player-facing copy (no placeholders)
  /** Optional payload shown on the card (sponsor logos, flag, chess board, antidote). */
  payload?: Record<string, unknown>;
  validate(password: string, state: GameState, api: RuleApi): ValidationResult;
}

/** Factory parameterized by seed, mirroring v1's RuleDef.create. */
export interface Pg2RuleDef {
  id: string;
  act: ActId;
  create(rng: Rng): Pg2Rule;
}

export interface EventContext {
  state: GameState;
  rng: Rng; // event-scoped stream, created from subSeed(seed, def.id)
  dtMs: number;
  /** Push a side effect for the stage (sound, shake, toast, title card). */
  emit(effect: Effect): void;
}

export type PointerTargetKind =
  | "cell"
  | "alien"
  | "parasite"
  | "feed-button"
  | "stoke-button"
  | "basket-button"
  | "banner-decline"
  | "banner-reject-all"
  | "settings-gear"
  | "settings-toggle"
  | "missile"
  | "eula-checkbox"
  | "eula-decoy"
  | "submit-button"
  | "black-hole";

export interface PointerTarget {
  kind: PointerTargetKind;
  id?: number | string; // cell id, alien id, toggle index...
}

export interface EventInstance<S = unknown> {
  defId: string;
  family: EventFamily;
  phase: EventPhase;
  phaseElapsedMs: number;
  scheduledAtMs: number; // act-relative onset time from the Director
  data: S;
}

export interface EventDef<S = unknown> {
  id: string;
  family: EventFamily;
  telegraphMs: number;
  init(rng: Rng, state: GameState): S;
  /** Mutates inst.data and state (via cells helpers). Advances inst.phase. */
  onTick(inst: EventInstance<S>, ctx: EventContext): void;
  /** Keyboard interception BEFORE normal typing. Return true if consumed. */
  onKey?(inst: EventInstance<S>, ctx: EventContext, key: string): boolean;
  /** Pointer interactions routed from the stage. Return true if consumed. */
  onPointer?(inst: EventInstance<S>, ctx: EventContext, target: PointerTarget): boolean;
  /** True once the event no longer needs ticks (phase -> done). */
  isResolved(inst: EventInstance<S>, state: GameState): boolean;
  /** Inhabitants: a rule injected into the run when this event onsets. */
  coupledRule?: Pg2RuleDef;
  /** Inhabitants only: ally id granted to the finale when alive at finale start. */
  allyId?: AllyId;
  /** Inhabitants only: is the creature "alive/kept" right now? */
  isAlive?(inst: EventInstance<S>): boolean;
}

export type AllyId = "gerald" | "campfire" | "garden";

export type Effect =
  | { kind: "sound"; sound: string } // motif key, resolved by stage
  | { kind: "shake"; trauma: number } // 0..1
  | { kind: "toast"; text: string; tone: "info" | "danger" | "success" }
  | { kind: "title-card"; act: ActId }
  | { kind: "mood"; eventId: string; text: string } // name-tag mood line
  | { kind: "flash"; ms: number };

export interface RunStats {
  lettersAbducted: number;
  lettersRescued: number;
  infectionsCured: number;
  garbageCleared: number;
  missilesIntercepted: number;
  aliensDowned: number;
  creaturesSaved: number; // filled at finale start
  biggestCrisis: string; // event id with the longest peak phase
  knockbacks: number; // finale phase restarts
}

export type FinalePhaseId = "missiles" | "eula" | "runaway";

export interface FinaleState {
  phase: FinalePhaseId;
  phaseElapsedMs: number;
  allies: AllyId[];
  attempts: number; // knockbacks within current phase
  data: Record<string, unknown>; // per-phase working state, owned by finale.ts
}

export interface GameState {
  seed: number;
  daily: boolean;
  nextCellId: number;
  cells: CharCell[];
  caret: number; // index into cells (0..cells.length)
  startedAtMs: number | null; // null until first keystroke; clock base
  elapsedMs: number; // since first keystroke
  act: ActId;
  actElapsedMs: number;
  rules: Pg2Rule[]; // revealed so far, in order
  ruleStates: Record<string, unknown>;
  events: EventInstance[]; // scheduled (future), active, and done
  finale: FinaleState | null;
  outcome: "playing" | "victory";
  inputLocked: boolean; // loading-bar / missile stun
  stats: RunStats;
  effects: Effect[]; // drained by the stage every frame
  version: number; // bumped on any cells/rules/act change (DOM re-render key)
}
```

- [ ] **Step 3: Write failing tests for `cells.ts`** in `__tests__/cells.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cellsToPassword, insertText, deleteRange, makeCells, findCellIndex } from "../cells";

describe("cells", () => {
  it("builds cells from a string with stable ids", () => {
    const { cells, nextCellId } = makeCells("abc", 1);
    expect(cells.map((c) => c.ch).join("")).toBe("abc");
    expect(cells.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(nextCellId).toBe(4);
  });

  it("password value excludes parasite/orbiting/abducted/ember cells", () => {
    const { cells } = makeCells("abcd", 1);
    cells[1] = { ...cells[1]!, status: "parasite" };
    cells[3] = { ...cells[3]!, status: "orbiting" };
    expect(cellsToPassword(cells)).toBe("ac");
  });

  it("garbage cells ARE included in the password value", () => {
    const { cells } = makeCells("ab", 1);
    cells.push({ id: 99, ch: "#", status: "garbage" });
    expect(cellsToPassword(cells)).toBe("ab#");
  });

  it("insertText splices at caret and returns new caret and nextCellId", () => {
    const { cells } = makeCells("ad", 1);
    const r = insertText(cells, 1, "bc", 3);
    expect(cellsToPassword(r.cells)).toBe("abcd");
    expect(r.caret).toBe(3);
    expect(r.nextCellId).toBe(5);
  });

  it("deleteRange removes cells and clamps caret", () => {
    const { cells } = makeCells("abcd", 1);
    const r = deleteRange(cells, 1, 3);
    expect(cellsToPassword(r.cells)).toBe("ad");
    expect(r.caret).toBe(1);
  });

  it("findCellIndex locates a cell by id", () => {
    const { cells } = makeCells("abc", 1);
    expect(findCellIndex(cells, 2)).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests, verify they fail** — `pnpm exec vitest run src/components/game/password-game-2 --reporter=dot`. Expected: module-not-found failures.
- [ ] **Step 5: Implement `cells.ts`.** Signatures (all pure — return new arrays, never mutate inputs):

```ts
export const VALUE_EXCLUDED: ReadonlySet<CellStatus> = new Set([
  "parasite",
  "orbiting",
  "abducted",
  "ember",
]);
export function makeCells(
  text: string,
  nextCellId: number,
): { cells: CharCell[]; nextCellId: number };
export function cellsToPassword(cells: readonly CharCell[]): string; // skips VALUE_EXCLUDED
export function insertText(
  cells: readonly CharCell[],
  caret: number,
  text: string,
  nextCellId: number,
): { cells: CharCell[]; caret: number; nextCellId: number };
export function deleteRange(
  cells: readonly CharCell[],
  from: number,
  to: number,
): { cells: CharCell[]; caret: number };
export function findCellIndex(cells: readonly CharCell[], id: number): number; // -1 if absent
```

- [ ] **Step 6: Add rng tests** (`rng.test.ts`): `fnv1a("a") !== fnv1a("b")`; `dailySeed(new Date("2026-07-18T12:00:00"))` equals `dailySeed(new Date("2026-07-18T23:00:00"))` and differs from the 19th; `subSeed(1, "x") !== subSeed(1, "y")`; mulberry32 determinism (two generators from the same seed produce identical first 5 values).
- [ ] **Step 7: Run the suite, verify green**, then commit: `feat(pg2): engine foundation — rng, types contract, cell model`.

---

### Task 2: Engine core — store, tick pipeline, input, acts, submit

**Files:**

- Create: `src/components/game/password-game-2/engine/engine.ts`
- Create: `src/components/game/password-game-2/engine/effects.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/engine.test.ts`

The engine is a mutable store (space-shooter pattern): one `GameState` object mutated in place by `tick`, `version` bumped whenever cells/rules/act change so the DOM stage knows to re-render. Canvas reads the object directly each frame.

- [ ] **Step 1: Write failing tests** covering the public API:

```ts
import { describe, expect, it } from "vitest";
import { createRun, tick, applyKey, applyPointer, requestSubmit } from "../engine";

const boot = (seed = 42) => createRun({ seed, daily: false, nowHHMM: () => "12:00" });

describe("engine", () => {
  it("clock starts on first keystroke, not on run creation", () => {
    const g = boot();
    tick(g, 500);
    expect(g.elapsedMs).toBe(0);
    applyKey(g, "a");
    tick(g, 500);
    expect(g.elapsedMs).toBe(500);
  });

  it("typing inserts at caret; backspace deletes; arrows move caret", () => {
    const g = boot();
    for (const k of "abc") applyKey(g, k);
    applyKey(g, "ArrowLeft");
    applyKey(g, "X");
    expect(g.cells.map((c) => c.ch).join("")).toBe("abXc");
    applyKey(g, "Backspace");
    expect(g.cells.map((c) => c.ch).join("")).toBe("abc");
  });

  it("reveals the next rule only when all prior rules pass", () => {
    const g = boot();
    expect(g.rules.length).toBe(1); // first prologue rule visible immediately
    // Satisfy prologue rule 1 (min length 12) and expect rule 2 to appear on tick.
    for (const k of "abcdefghijkl") applyKey(g, k);
    tick(g, 100);
    expect(g.rules.length).toBe(2);
  });

  it("advances acts when the act's core rules are all satisfied and events resolved", () => {
    const g = boot();
    expect(g.act).toBe("prologue");
    // covered concretely in director/act tests with a stubbed roster
  });

  it("same seed => identical rule payloads and event schedule", () => {
    const a = boot(7),
      b = boot(7);
    expect(a.rules[0]!.description).toBe(b.rules[0]!.description);
    expect(a.events.map((e) => `${e.defId}@${e.scheduledAtMs}`)).toEqual(
      b.events.map((e) => `${e.defId}@${e.scheduledAtMs}`),
    );
  });

  it("requestSubmit before finale act is refused with a toast effect", () => {
    const g = boot();
    requestSubmit(g);
    expect(g.finale).toBeNull();
    expect(g.effects.some((e) => e.kind === "toast")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failures.**
- [ ] **Step 3: Implement `engine.ts`.** Public API (exact signatures):

```ts
export interface CreateRunOpts {
  seed: number;
  daily: boolean;
  nowHHMM?: () => string;
}
export function createRun(opts: CreateRunOpts): GameState;
export function tick(g: GameState, dtMs: number): void;
export function applyKey(g: GameState, key: string): void; // printable chars, Backspace, Delete, Arrow keys
export function applyPointer(g: GameState, target: PointerTarget): void;
export function requestSubmit(g: GameState): void;
export function makeRuleApi(g: GameState, nowHHMM: () => string): RuleApi;
```

Tick order (each frame): (1) if `startedAtMs !== null`, advance `elapsedMs`/`actElapsedMs`; (2) onset scheduled events whose `scheduledAtMs <= actElapsedMs` (phase telegraph -> onset handled inside each def); (3) run `onTick` for every non-done event with its sub-seeded rng (`mulberry32(subSeed(seed, defId))` created once at onset and stored on the instance via a WeakMap or a `rngState` field — store the Rng closure on the instance object as a non-serialized field `rng`); (4) inject coupled rules for events entering onset; (5) re-validate rules against `cellsToPassword(g.cells)`; reveal the next core rule when all revealed ones pass; (6) act machine: when every core rule of the current act is revealed+passing AND all events scheduled for the act are resolved (or the act is prologue), advance to the next act, reset `actElapsedMs`, emit `title-card` + `sound` effects, bump version; (7) drain nothing — effects accumulate until the stage drains them.

`applyKey`: route first to active events' `onKey` (loading-bar mash, galaga letter shots, snake pellet) in onset order; if unconsumed and `inputLocked` is false, mutate cells via `insertText`/`deleteRange`, set `startedAtMs` on first printable key, bump version. Keys: single printable code points insert; `Backspace`/`Delete`/`ArrowLeft`/`ArrowRight`/`Home`/`End` behave conventionally.

`requestSubmit`: if `act !== "act3"` or any rule failing -> emit refusing toast ("The form is not satisfied.") and return. If act3 complete -> enter finale (`g.act = "finale"; g.finale = createFinale(g)` — stub `createFinale` returning phase "missiles" with empty allies until Task 10; keep the stub in `engine.ts` and move it to `finale.ts` in Task 10).

- [ ] **Step 4: Implement `effects.ts`:** `pushEffect(g, effect)` (caps queue at 64, drops oldest) and `drainEffects(g): Effect[]` (returns and clears). Use `pushEffect` everywhere instead of `g.effects.push`.
- [ ] **Step 5:** For Step 1's tests to run before Tasks 3-5 land, `createRun` needs the roster and director. Import `CORE_RULES` from `./rules/index` and `buildSchedule` from `./director` — create both files now as minimal real modules: `rules/index.ts` exporting `CORE_RULES: Pg2RuleDef[]` containing only the real `min-length-12` rule (full implementation, act "prologue", validate `password.length >= 12`), and `director.ts` exporting `buildSchedule(seed: number): EventInstance[]` returning `[]`. These are the seams Tasks 3-4 fill in; no placeholder comments, just small real modules.
- [ ] **Step 6: Run tests green** (adjust the reveal test to the single-rule roster if needed — it must still assert reveal-on-satisfy using min-length-12 then a second real rule; add `include-number` to the manifest now, full implementation: `/\d/.test(password)`).
- [ ] **Step 7: Commit** `feat(pg2): engine core — store, tick pipeline, input routing, act machine`.

---

### Task 3: The Director

**Files:**

- Modify: `src/components/game/password-game-2/engine/director.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/director.test.ts`

- [ ] **Step 1: Write failing tests:**

```ts
import { describe, expect, it } from "vitest";
import { buildSchedule, ACT_SCRIPTS } from "../director";

describe("director", () => {
  it("is deterministic per seed", () => {
    expect(serialize(buildSchedule(123))).toEqual(serialize(buildSchedule(123)));
    expect(serialize(buildSchedule(123))).not.toEqual(serialize(buildSchedule(124)));
  });
  it("always pins galaga in act3 and guarantees at least one inhabitant", () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const s = buildSchedule(seed);
      expect(s.some((e) => e.defId === "galaga")).toBe(true);
      expect(s.some((e) => e.family === "inhabitant")).toBe(true);
    }
  });
  it("schedules 8 to 10 events, no duplicates", () => {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const s = buildSchedule(seed);
      expect(s.length).toBeGreaterThanOrEqual(8);
      expect(s.length).toBeLessThanOrEqual(10);
      expect(new Set(s.map((e) => e.defId)).size).toBe(s.length);
    }
  });
  it("enforces valleys: no two onsets in the same act within 20s of each other, except scripted overlaps", () => {
    for (const seed of [1, 2, 3]) {
      const byAct = groupBy(buildSchedule(seed), (e) => actOf(e));
      // two-crisis slots are marked overlap: true in ACT_SCRIPTS; all others >= 20_000 apart
    }
  });
});
const serialize = (s: ReturnType<typeof buildSchedule>) =>
  s.map((e) => `${e.defId}@${e.scheduledAtMs}`);
```

(Implement `groupBy`/`actOf` locally in the test; `EventInstance` gets an `act: ActId` field — add it to the interface in types.ts.)

- [ ] **Step 2: Run, verify failure.**
- [ ] **Step 3: Implement.** Slot scripts are literal data:

```ts
export interface SlotSpec {
  atMs: number; // act-relative onset
  family: EventFamily;
  pin?: string; // exact event id
  overlap?: boolean; // sanctioned two-crisis slot (exempt from valley rule)
}
export const ACT_SCRIPTS: Record<Exclude<ActId, "prologue" | "finale">, SlotSpec[]> = {
  act1: [
    { atMs: 40_000, family: "inhabitant" },
    { atMs: 150_000, family: "chrome" },
  ],
  act2: [
    { atMs: 30_000, family: "force" },
    { atMs: 120_000, family: "chrome" },
    { atMs: 150_000, family: "force", overlap: true }, // the engineered two-crisis
    { atMs: 240_000, family: "inhabitant" }, // second creature moves in
  ],
  act3: [
    { atMs: 20_000, family: "invasion", pin: "galaga" },
    { atMs: 120_000, family: "invasion" },
    { atMs: 200_000, family: "force" },
    { atMs: 280_000, family: "chrome" },
  ],
};
```

`buildSchedule(seed)`: for each act script, resolve slots to concrete defs by drawing without replacement per family from the manifest (`EVENT_DEFS` filtered by family) using `mulberry32(subSeed(seed, "director-" + act))`. A pinned slot takes its id and removes it from the pool. Drop the act3 `force`/`chrome` slots with probability 0.5 each (this yields the 8-10 range; sanity-check the arithmetic against the tests and adjust the drop set so the guarantee holds for all seeds — the tests are the contract). Return `EventInstance[]` with `phase: "telegraph"`, `phaseElapsedMs: 0`, `data: undefined` (initialized lazily at onset by the engine calling `def.init`).

Until Tasks 6-9 land, the manifest has too few events to satisfy 8-10; seed `events/index.ts` NOW with lightweight real stub defs for all 12 ids (correct `id`/`family`/`telegraphMs`, `init` returning `{}`, `onTick` advancing telegraph->onset->peak and auto-resolving after 10s, `isResolved` on phase done). Tasks 6-9 replace each stub with the real event in place — the manifest and Director never change shape again.

- [ ] **Step 4: Run tests green.**
- [ ] **Step 5: Commit** `feat(pg2): the Director — act slot scripts, seeded schedule, valleys`.

---

### Task 4: Core rules roster

**Files:**

- Modify: `src/components/game/password-game-2/engine/rules/index.ts`
- Create: one file per rule under `engine/rules/` (kebab-case matching rule id)
- Test: `src/components/game/password-game-2/engine/__tests__/rules.test.ts`

Port helpers freely from v1 (`src/components/game/password-game/tier*.ts`) — copy the logic, adapt to the `Pg2Rule` signature. The fixed authored order (array order in `CORE_RULES`):

| #   | id                   | act      | Rule copy (final)                                                         | Validation                                                                                                                                        |
| --- | -------------------- | -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `min-length-12`      | prologue | "Your password must be at least 12 characters."                           | `[...password].length >= 12`                                                                                                                      |
| 2   | `include-number`     | prologue | "Your password must include a number."                                    | `/\d/`                                                                                                                                            |
| 3   | `include-uppercase`  | prologue | "Your password must include an uppercase letter."                         | `/[A-Z]/`                                                                                                                                         |
| 4   | `include-special`    | prologue | "Your password must include a special character."                         | `/[^A-Za-z0-9\s]/`                                                                                                                                |
| 5   | `captcha-human`      | prologue | "Prove you are human. Type: I am human"                                   | includes `"I am human"`                                                                                                                           |
| 6   | `digit-sum`          | act1     | "The digits in your password must sum to N."                              | N = rangeInt(rng, 35, 45); sum of all digit chars === N (floor sits above the max forced digits: time <= 24, SAN <= 8, so always reachable)       |
| 7   | `include-month`      | act1     | "Your password must include a month of the year."                         | any of 12 month names, case-insensitive                                                                                                           |
| 8   | `wordle-today`       | act1     | "Your password must include today's Wordle answer."                       | includes word from `src/data/password-game` wordle module (same import v1 uses; empty feed -> auto-pass with message "(feed offline — freebie)")  |
| 9   | `sponsor`            | act1     | "Your password must include one of our sponsors."                         | payload: 3 seeded picks from SPONSORS below; includes any, case-insensitive                                                                       |
| 10  | `roman-numeral`      | act2     | "Your password must include a Roman numeral."                             | `/[IVXLCDM]/` (uppercase only)                                                                                                                    |
| 11  | `roman-product`      | act2     | "The Roman numerals in your password must multiply to N."                 | N = pickOne(rng, [12, 18, 20, 24, 35, 42]); parse maximal roman tokens, multiply values (port v1 tier logic)                                      |
| 12  | `country-name`       | act2     | "Your password must include the name of this country."                    | payload: seeded country from the countries data module; includes name case-insensitive (feed offline -> freebie, as rule 8)                       |
| 13  | `current-time`       | act2     | "Your password must include the current time (HH:MM)."                    | includes `api.nowHHMM()` — revalidates live, goes red when the minute rolls                                                                       |
| 14  | `chess-best-move`    | act3     | "Your password must include the best move in this position."              | payload: puzzle from chess data module; includes SAN string (feed offline -> freebie)                                                             |
| 15  | `max-length`         | act3     | "Your password must be at most N characters. This is a security measure." | N = rangeInt(rng, 60, 75); `[...password].length <= N` (cap clears the base roster with live feeds; the tension is event pressure, not the rules) |
| 16  | `backwards-password` | act3     | "Your password must contain the word password, backwards."                | includes `"drowssap"`                                                                                                                             |
| 17  | `final-blessing`     | act3     | "The form is now willing to consider your submission. Click Submit."      | always passes; its reveal is the finale gate cue                                                                                                  |

`SPONSORS` (module const in `rules/sponsor.ts`): `[{ name: "Bloatware Pro" }, { name: "Cloudz" }, { name: "YoloVPN" }, { name: "Grindstone" }, { name: "SynergyOS" }]` — stage renders their SVG wordmarks in Task 11.

Event-coupled rules (`no-infected`, `antidote-memory`, `galaga-final-wave`, `campfire-burning`, `gerald-fed`) are NOT here — they live on their events as `coupledRule` (Tasks 6-8) and inject at onset.

- [ ] **Step 1: Write failing tests** — one `describe` per rule, minimum: a passing password, a failing password, and payload determinism per seed for parameterized rules (6, 9, 11, 12, 14). For `current-time`, inject `nowHHMM: () => "13:37"` and assert `"a13:37b"` passes and re-validation with `"13:38"` fails. For feed-backed rules, set the data module's setter to a known value in the test (v1 tests show the pattern — see `src/components/game/password-game/__tests__/`).
- [ ] **Step 2: Run, verify failures.**
- [ ] **Step 3: Implement all 17 rules** in per-file modules, aggregate in `rules/index.ts` in the exact order above (replacing the Task 2 seed manifest).
- [ ] **Step 4: Run tests green.** Also rerun `engine.test.ts` — the reveal test now walks the real roster.
- [ ] **Step 5: Commit** `feat(pg2): core rule roster — 17 authored rules across five acts`.

---

### Task 5: Engine integration — acts end-to-end with a scripted run

**Files:**

- Test: `src/components/game/password-game-2/engine/__tests__/run-integration.test.ts`
- Modify: `engine.ts` (whatever the test flushes out)

- [ ] **Step 1: Write the failing integration test:** a scripted headless run using seed 7: create run; satisfy prologue rules by typing a crafted string (compute one that satisfies rules 1-5 for the seed, e.g. `"I am human XV! 99"` variant — derive in the test from the revealed payloads, not hardcoded); tick in 100ms steps to 3 minutes simulated; assert acts advance prologue -> act1 once rules pass and (stub) events resolve; assert `title-card` effects were emitted exactly once per act transition; assert `requestSubmit` in act3-with-passing-rules sets `g.act === "finale"`.
- [ ] **Step 2: Run, fix engine bugs until green.** (This test is the pacing safety net for all later event work.)
- [ ] **Step 3: Commit** `test(pg2): headless full-run integration harness`.

---

### Task 6: Inhabitant events — Gerald, campfire, garden

**Files:**

- Modify: `engine/events/gerald.ts`, `engine/events/campfire.ts`, `engine/events/garden.ts` (replace stubs)
- Test: `engine/__tests__/events-inhabitants.test.ts`

Shared shape: inhabitants onset and then persist until the finale (never `done` during the run; `isResolved` returns false until `g.act === "finale"`). Each defines `isAlive`, `allyId`, and a `coupledRule`. All numbers below are the tuned contract — implement exactly, tests assert them.

**Gerald (`id: "gerald"`, telegraphMs 6000):** data `{ hunger: number; fedAtMs: number; murky: boolean }`, hunger starts 30, +1 per 1800ms. Moods (emit `mood` effect on threshold crossings): <60 "Gerald — content", >=60 "Gerald — hungry", >=85 "Gerald — desperate" and `murky` ramps true, at 100 hunger clamps and mood "Gerald — disappointed". `onPointer({kind:"feed-button"})`: hunger -40 (min 0), `fedAtMs = state.elapsedMs`, murky false if hunger < 85, emit sound "gerald-feed". `isAlive`: `hunger < 100`. `coupledRule` (`id: "gerald-fed"`, act act3): "Gerald must have been fed in the last 60 seconds." — validate `state.elapsedMs - data.fedAtMs <= 60_000` (via `api.getEventData`). Ally `"gerald"`.

**Campfire (`id: "campfire"`, telegraphMs 6000):** data `{ fuel: number; burning: boolean; stokeReadyAtMs: number; buttonHops: number }`, fuel starts 80, -1 per 1000ms. At fuel<=0: `burning=false` (embers — transformation; can be re-lit by stoking to fuel>=15). While burning and fuel<25: every 6000ms convert the cell nearest the fire anchor (fixed at cell index 0 side) to status `"ember"` (excluded from value — the fire eats your password), emit toast "The campfire is eating your password." `onPointer({kind:"stoke-button"})`: if `state.elapsedMs >= stokeReadyAtMs` -> fuel +18 (max 100), `stokeReadyAtMs = elapsedMs + 1500`, every 4th stoke sets `buttonHops++` (stage animates the button hop). `isAlive`: `burning`. `coupledRule` (`id: "campfire-burning"`, act act3): "The campfire must be burning when you submit." Ally `"campfire"`.

**Garden (`id: "garden"`, telegraphMs 8000):** data `{ bloomed: number (0-3); honey: number; bearState: "away" | "telegraphed" | "raiding"; bearAtMs: number; basketUsed: boolean; distractions: number }`. Blooms: one flower per 20s up to 3. Honey +2/s while bloomed>=2, max 100. Bear cycle: first raid telegraphed at onset+45s, then every rangeInt(rng,45,70)s; telegraph 8s (shadow+growl effects), then raiding 6s — if `onPointer({kind:"basket-button"})` during telegraph or raid: bear leaves, `distractions++`, `basketUsed` resets next cycle; else honey -> 0 and bloomed -> max(0, bloomed-2) (trampled — regrows). `isAlive`: `honey >= 40`. `coupledRule` (`id: "garden-honey"`, act act3): "The hive must hold at least 40 honey when you submit. Do not ask why the form wants honey." — validate via event data. Ally `"garden"`.

- [ ] **Step 1: Write failing tests** exercising each contract number: hunger climb rate and feed delta; mood effect emissions; campfire ember conversion at low fuel and re-light; stoke cooldown; garden bloom timing, honey accrual, bear raid consequence, and successful distraction; `isAlive` boundaries; coupled rules pass/fail through `makeRuleApi`. Drive with direct `def.onTick(inst, ctx)` calls using a hand-built ctx (`{ state, rng: mulberry32(1), dtMs, emit }`).
- [ ] **Step 2: Run red, implement all three, run green.**
- [ ] **Step 3: Rerun the integration test** — inhabitants persisting must not block act advancement (act machine treats never-resolving inhabitants as "resolved for act purposes" once past onset; implement via `family === "inhabitant"` exemption in the act-advance check).
- [ ] **Step 4: Commit** `feat(pg2): inhabitant events — Gerald, the campfire, the garden and the bear`.

---

### Task 7: Force events — infection, black hole, parasite

**Files:**

- Modify: `engine/events/infection.ts`, `engine/events/black-hole.ts`, `engine/events/parasite.ts`
- Test: `engine/__tests__/events-forces.test.ts`

**Infection (`id: "infection"`, telegraphMs 8000):** data `{ infectedIds: number[]; mutatedIds: number[]; antidote: string; nextSpreadAtMs: number; infectedSinceMs: Record<number, number> }`. Onset: pick a random normal cell -> status "infected". Spread every 7000ms: each infected cell infects one adjacent cell (skip spaces — spaces quarantine; skip non-normal). A cell infected 45s becomes "mutated" (still counts as infected for the rule; cured the same way). Antidote: 4 lowercase letters from the rng (e.g. "zyxo"); when `cellsToPassword` contains the antidote substring -> cure cascade: all infected/mutated -> normal over one tick, `stats.infectionsCured += count`, event resolves. `coupledRule` (`id: "no-infected"`, act act2): "Your password must contain no infected characters." — fails while any infected/mutated cells exist. Payload on the rule card shows the antidote (`payload: { antidote }`).

**Black hole (`id: "black-hole"`, telegraphMs 8000):** data `{ anchorIndex: number; capturedIds: number[]; nextPullAtMs: number; heavyWord: string; collapsing: boolean }`. Onset: anchorIndex = random cell index. Pull every 5000ms: nearest normal cell -> status "orbiting" (pushed to capturedIds), `stats.lettersAbducted++`. heavyWord = pickOne(rng, ["lead", "anvil", "neutron", "brick"]). If password contains heavyWord -> collapsing; after 2000ms all orbiting cells -> "normal" restored at their original array positions (they never left the array — status flip only), `stats.lettersRescued += count`, resolve. Auto-collapse at 6 captures (same restoration).

**Parasite (`id: "parasite"`, telegraphMs 4000):** data `{ parasiteIds: number[]; spawnedSecondAtMs: number | null }`. Onset: insert one cell with status "parasite" cloning a neighbor glyph at a random index. Every 6000ms emit effect `{kind:"sound", sound:"parasite-wiggle"}` (stage wiggles). `onPointer({kind:"parasite", id})`: remove that cell, resolve when none left. If unresolved after 90s: insert a second parasite (max 2 total). No coupled rule — its evil IS the count mismatch (rules read the value without parasites while the player sees the glyphs).

- [ ] **Step 1: Failing tests:** infection spreads on schedule and respects space quarantine; mutation at 45s; antidote cures and resolves; black hole pulls nearest, restores on heavy word, auto-collapses at 6; parasite excluded from value (min-length reads one short), click evicts, second parasite at 90s.
- [ ] **Step 2: Implement, green.**
- [ ] **Step 3: Commit** `feat(pg2): force events — infection, black hole, parasite`.

---

### Task 8: Invasion events — Galaga, snake, Tetris garbage

**Files:**

- Modify: `engine/events/galaga.ts`, `engine/events/snake.ts`, `engine/events/tetris.ts`
- Test: `engine/__tests__/events-invasions.test.ts`

**Galaga (`id: "galaga"`, telegraphMs 10000):** data `{ wave: 1 | 2 | 3; aliens: Alien[]; waveStartedAtMs: number; nextDiveAtMs: number }` with `interface Alien { id: number; x: number; y: number; carriedCellId: number | null; state: "formation" | "diving" | "carrying" | "down" }` (x,y in 0..1 normalized stage coords, formation rows computed from index). Waves of 12/8/6 aliens, 45s cap each. Dive every 4000ms: next formation alien dives; on reaching the box (2s dive) it grabs the nearest normal cell (status -> "abducted", `carriedCellId` set, `stats.lettersAbducted++`) and climbs. `onKey`: if key matches a carried cell's char (case-insensitive) -> that alien goes "down", cell restored to "normal" (`stats.lettersRescued++`, `stats.aliensDowned++`), consume the key. `onPointer({kind:"alien", id})` downs a non-carrying alien. Wave ends when all its aliens are down OR 45s timeout (timeout: carried cells restored — "tractor malfunction" toast; those aliens fly off but count as NOT down). After wave 3 ends: resolve. `coupledRule` (`id: "galaga-final-wave"`, act act3): "Every invader in the final wave must be shot down." — passes only when wave===3 finished with all 6 down; while waves 1-2 run it shows progress message.

**Snake (`id: "snake"`, telegraphMs 6000):** data `{ swallowedIds: number[]; sated: number; nextBiteAtMs: number; pelletChar: string; gone: boolean }`. Bite every 5000ms: last non-excluded cell -> "abducted" (swallowed). pelletChar = pickOne(rng, ["o", "0", "@"]). `onKey`: typing pelletChar when the caret is at the END of the password feeds the snake instead of inserting (sated+1, consume key, emit "snake-chomp"); elsewhere it inserts normally. At sated 3 OR 8 swallowed: snake leaves, all swallowed restored to normal (order preserved — status flips), resolve. `stats` abducted/rescued updated symmetrically.

**Tetris (`id: "tetris"`, telegraphMs 6000):** data `{ drops: Array<{ char: string; targetIndex: number; startAtMs: number; landed: boolean }>; }`. 10 drops scheduled 4s apart, chars from "#%&", each falls 2500ms then inserts a "garbage" cell at targetIndex (clamped to current length). Garbage cells COUNT in the value (they break digit-sum/max-length — that is the event). Removal: Backspace over them works normally; `onPointer({kind:"cell", id})` on a garbage cell shatters it (remove instantly), `stats.garbageCleared++`. Resolve when all 10 landed (or skipped due to timeouts) and zero garbage cells remain.

- [ ] **Step 1: Failing tests:** galaga wave sizes and 45s timeout restoration; key-shot rescues the right cell; coupled rule truth table across waves; snake end-of-password pellet consumption vs mid-password insertion; regurgitation ordering; tetris drop cadence, garbage counted in value, shatter and resolve conditions.
- [ ] **Step 2: Implement, green. Step 3: Commit** `feat(pg2): invasion events — Galaga fleet, snake, Tetris garbage`.

---

### Task 9: Chrome events — cookie banner, autocorrect demon, loading bar

**Files:**

- Modify: `engine/events/cookie-banner.ts`, `engine/events/autocorrect.ts`, `engine/events/loading-bar.ts`
- Test: `engine/__tests__/events-chrome.test.ts`

**Cookie banner (`id: "cookie-banner"`, telegraphMs 3000):** data `{ banners: Array<{ id: number; hasRealReject: boolean }>; dismissed: boolean; deadlineAtMs: number }`. Onset: 1 banner; the seed picks which banner index (0-4) will carry the real reject link. `onPointer({kind:"banner-decline", id})`: spawn 2 more (cap 5 total; when the capped set is reached, the designated banner exists and shows the tiny real link). `onPointer({kind:"banner-reject-all"})`: dismissed, resolve, emit "paper-shred". Auto-resolve at 60s (toast "Session expired. The banners slink away."). Typing is never locked.

**Autocorrect (`id: "autocorrect"`, telegraphMs 5000):** data `{ corrections: number; lastAtMs: number; disabled: boolean; settingsOpen: boolean; correctToggleIndex: number }`. Every 8000ms scan the password for the FIRST match from `CORRECTION_PAIRS` (module const, 14 pairs: month names -> next month, "dragon"->"dargon", "human"->"hunan", "password"->"passward", "fire"->"fira", plus 4 more of the implementer's invention in the same spirit) and replace it in the cells (statuses preserved, new cell ids), emit toast `"Corrected for you."`. correctToggleIndex = rangeInt(rng, 0, 5) among 6 toggles labeled in `TOGGLE_LABELS` (module const — corporate nonsense: "Enable enhanced experience", "Helpful corrections", "Optimize engagement", "Personalized nudges", "Smart everything", "Allow essential magic"); the correct one is always "Helpful corrections" placed at correctToggleIndex. `onPointer({kind:"settings-gear"})` toggles settingsOpen; `onPointer({kind:"settings-toggle", id: i})`: if i === correctToggleIndex -> disabled, resolve; else emit toast "That setting does nothing." Auto-resolve 75s.

**Loading bar (`id: "loading-bar"`, telegraphMs 3000):** data `{ progress: number; startedAtMs: number }`. Onset: `state.inputLocked = true`; progress crawls to 97 over 5000ms then sticks. `onKey` (any key): progress += 0.35, consume. At >=100 OR 12s total: unlock input, toast `"Just kidding."`, resolve.

- [ ] **Step 1: Failing tests** on the numeric contracts above, including: input lock set/released; mash math (97 -> 100 needs 9 keys); decline spawning caps at 5; wrong toggle does not resolve.
- [ ] **Step 2: Implement, green. Step 3: Commit** `feat(pg2): chrome events — cookie banner, autocorrect demon, loading bar`.

---

### Task 10: Finale — three-phase boss with ally payoff

**Files:**

- Modify: `engine/events/finale.ts` (replace the engine.ts stub; engine imports `createFinale`/`tickFinale`/`finalePointer` from here)
- Test: `engine/__tests__/finale.test.ts`

`createFinale(g)`: collects allies — for each active inhabitant instance where `def.isAlive?.(inst)` is true, push its `allyId`; `stats.creaturesSaved = allies.length`; phase "missiles". `tickFinale(g, dtMs)` is called by `tick` when `g.act === "finale"`; `applyPointer` routes finale targets to `finalePointer`.

**Phase 1 — missiles:** data `{ missiles: Array<{ id: number; x: number; progress: number; state: "falling" | "intercepted" | "landed" }>; launched: number; landedThisAttempt: number }`. 12 missiles, one launched every 3200ms, each falls for 4000ms. `finalePointer({kind:"missile", id})` intercepts (`stats.missilesIntercepted++`). Gerald ally: auto-intercepts the lowest missile every 2500ms. A landing missile: `inputLocked` for 1500ms, `landedThisAttempt++`; at 4 landings -> knockback (phase restarts, missiles reset, `stats.knockbacks++`, `finale.attempts++`, toast "The form rejects your energy. Again."). Phase clears when all 12 are intercepted or landed with fewer than 4 landings.

**Phase 2 — EULA:** data `{ paragraphs: number; checkboxPara: number; burned: boolean; deadlineAtMs: number }`. paragraphs = 24; checkboxPara = rangeInt(rng, 8, 23). Campfire ally: after 6000ms, `burned = true` (stage renders 75% of paragraphs as ash — only 6 remain, checkbox among them; if checkboxPara would be burned, it relocates to a surviving paragraph — recompute deterministically as `checkboxPara % 6`). `finalePointer({kind:"eula-checkbox"})` clears the phase; `{kind:"eula-decoy"}` emits shake+toast ("You agreed to agree. It means nothing."). 90s timeout -> knockback (new checkboxPara from the rng, `stats.knockbacks++`).

**Phase 3 — runaway:** data `{ btnX: number; btnY: number; speedScale: number; tiredAtMs: number; caughtProgress: number }` (normalized coords; the stage feeds cursor position via `finalePointer({kind:"submit-button"})` meaning a successful click). Engine-side logic is time-based: speedScale starts 1.0 (0.5 with garden ally), decays by 4% per second after 25s. Bear bond (garden ally AND garden data.distractions >= 2): auto-catch at phase time 10s. On catch: `g.outcome = "victory"`, emit `sound "victory"` + `title-card` effect for a closing card. (Cursor-evasion motion itself is stage-side in Task 13; the engine only needs speedScale, the catch API, and timers.)

- [ ] **Step 1: Failing tests:** ally collection honors `isAlive` at finale start; missile cadence, knockback at 4 landings, Gerald auto-intercept cadence; EULA burn relocation math and timeout knockback; runaway decay curve values at t=25s/35s, bear auto-catch, victory state.
- [ ] **Step 2: Implement, green. Step 3:** extend `run-integration.test.ts`: drive a full run through the finale to victory headlessly (pointer-inject intercepts/checkbox/catch). Assert `outcome === "victory"` and `stats` fields populated.
- [ ] **Step 4: Commit** `feat(pg2): finale — missile command, EULA final form, runaway submit button, ally payoff`.

---

### Task 11: Stage shell, HUD, rule list, char stage

**Files:**

- Create: `stage/game-shell.tsx`, `stage/char-stage.tsx`, `stage/rule-list.tsx`, `stage/hud.tsx`, `stage/pg2.css`, `index.tsx`
- Modify: `src/app/games/password-game/page.tsx` (mount PG2 via `index.tsx` dynamic import, ssr:false; keep metadata export server-side)
- Test: visual (browser), plus `stage/__tests__/shell.smoke.test.tsx` (renders without crashing via vitest + testing-library if the repo already has DOM testing set up — check `vitest.config`; if jsdom is not configured, skip the smoke test rather than adding new test infra)

Behavior contract:

- **Start screen:** title "The Password Game 2" with subtitle "Terms and Conditions Apply", seed controls (Daily run / random seed / seed from `?seed=` URL param), Start button styled as a boring corporate "Create account" form intro. Reads `?seed=` via `useSearchParams`.
- **rAF loop** in game-shell: `requestAnimationFrame` -> compute dtMs (clamp 100ms) -> `tick(g, dt)` -> drain effects (dispatch sound/shake/toast/title/mood to local component state + sound module) -> if `g.version` changed, `setVersion(g.version)` (DOM re-render); canvas overlay repaints every frame regardless (Task 12).
- **Keyboard:** a window `keydown` listener while running: `preventDefault` for handled keys, call `applyKey`. No hidden input element; the page IS the input (mobile gets an "attach keyboard" tap zone with a visually hidden `<input>` for soft keyboards — degraded is acceptable per spec).
- **char-stage:** renders `g.cells` as `<span data-cell-id>` runs inside a large framed "password box" (min-height 160px, monospace 30px, generous letter spacing); caret as an animated span at `g.caret`; click on a cell -> `applyPointer({kind:"cell", id})` AND set caret to that index; cell status variants get CSS classes (`.pg2-cell--infected` pulsing green, `--mutated`, `--garbage`, `--parasite` (identical to normal except during wiggle animation), `--ember`, `--orbiting`/`--abducted` render as a gap placeholder). Status changes animate via CSS transitions keyed on class swap; cell identity via `key={cell.id}`.
- **rule-list:** numbered cards below the box, active (first failing) rule highlighted and pinned to top, satisfied rules collapse to a compact green row (v1's rule-card is reference material for tone, not code). Payload renderers: sponsor wordmarks (inline SVG text-on-tile, three tiles), country flag (from the countries data payload like v1), chess board (port v1's compact board renderer if simple; otherwise render FEN as a monospace grid — decide by reading v1's `tier2-chess.ts` payload shape), antidote code, time rule shows a live clock.
- **hud:** top bar — run timer (mm:ss, tenths hidden), act label ("Act 2 — The Infestation"), seed chip (click copies `?seed=` URL — the race-this-seed feature), sound toggle (off by default, persists `localStorage["pg2-sound"]`).
- **Act title cards:** full-screen overlay 2.2s on `title-card` effects, act name in giant type, skippable on click.
- **Toasts and mood tags:** toast stack bottom-right; mood name tags render above the box anchored to the owning event's screen region.

- [ ] **Step 1: Build it.** Use Tailwind for layout, `pg2.css` for the game-feel animations (caret blink, infection pulse, wiggle, title cards, corporate form styling). Corporate form aesthetic: white/near-white panel, gray-blue borders, a fake form header ("Create your account — Step 3 of 3"), all sitting on the site's dark page background.
- [ ] **Step 2: Wire the route.** `page.tsx` keeps its metadata and mounts the loader. Delete nothing yet.
- [ ] **Step 3: Verify in the browser** (house rule): launch the detached dev server per RUNBOOK, screenshot: start screen, typing with caret, rules revealing, act card, toasts. Fix what looks wrong before proceeding.
- [ ] **Step 4: Commit** `feat(pg2): stage shell — corporate form, char stage, rule list, HUD, act cards`.

---

### Task 12: Canvas overlay + event painters + DOM chrome events

**Files:**

- Create: `stage/canvas-overlay.tsx`, `stage/painters.ts`, `stage/chrome-events.tsx`
- Modify: `stage/game-shell.tsx` (mount overlay + chrome layer), `stage/pg2.css`

- [ ] **Step 1: canvas-overlay.** Absolutely positioned over the form panel, DPR-scaled, pointer-events none EXCEPT when an active event registers hit regions (overlay exposes `onPointerDown` hit-testing against painter-registered rects/circles; hits call `applyPointer`). Each frame: measure visible cell rects (cache per `g.version` via `getBoundingClientRect` on `[data-cell-id]` nodes, invalidate on version bump/resize) into a `StageLayout { cellRects: Map<number, DOMRect>; boxRect: DOMRect }`, then call every active event's painter: `paint(ctx, inst, layout, tMs, g)`.
- [ ] **Step 2: painters.ts** — one painter per canvas-rendered event, registered by def id: gerald (water line across the lower box, fish sprite swimming between cell rects, hunger tint, feed button drawn as a food-shaker chip above the box registered as hit region "feed-button"; pellets fall on feed), campfire (fire anchored left of the box, flame particles, fuel ring, stoke button chip with hop animation, ember cells get falling ash), garden (flowers between cell gaps, bee dots orbiting, honey jar meter, bear: large sprite entering from the right with a shadow telegraph, basket button chip), infection (green miasma over infected cell rects), black-hole (swirl at anchor with orbiting glyphs drawn from captured cell chars), parasite (no painting except during wiggle window — draw the wiggle by offsetting a glyph sprite over the cell), galaga (formation grid above the form, dive paths as bezier arcs, tractor beam cone, carried glyphs rendered under alien sprites, shot flashes), snake (segmented body slithering along the box baseline, bulges for swallowed cells), tetris (falling block sprites with drop shadows onto target gaps), finale missiles (arcs + interception bursts). All sprites are canvas-drawn vector shapes (paths, gradients) — crisp, CRT-flavored, saturated family accents: inhabitants green `#4ade80`, forces violet `#a78bfa`, invasions red `#f87171`, chrome amber `#fbbf24`.
- [ ] **Step 3: chrome-events.tsx** — DOM (not canvas): cookie banners (stacked fixed-position dialogs with corporate copy, tiny real reject link), autocorrect gear + settings modal (6 toggles from `TOGGLE_LABELS`), loading bar overlay ("Uploading password… N%"). All route clicks to `applyPointer`.
- [ ] **Step 4: Debug harness:** add `?event=<id>` URL param (dev-only behavior, but shippable — it just pre-schedules that event at 3s into act1) so each event can be visually exercised on demand. Implement as a real small feature in `createRun` (an optional `forceEvent` opt), not a hack.
- [ ] **Step 5: Visual verification, event by event.** Using `?event=`: screenshot every one of the 12 events mid-peak. Iterate until each reads instantly at a glance (the 1080p law). This step is expected to be the longest in the task; do not skip any event.
- [ ] **Step 6: Commit** `feat(pg2): canvas overlay, twelve event renderers, chrome DOM events`.

---

### Task 13: Finale stage + receipt card

**Files:**

- Create: `stage/finale-stage.tsx`, `stage/receipt-card.tsx`
- Modify: `stage/game-shell.tsx` (mount when `g.act === "finale"` / `g.outcome === "victory"`)

- [ ] **Step 1: finale-stage.** Phase 1: missiles painted on the overlay (already in painters), the phase mounts a red-alert vignette + phase banner. Phase 2: full-screen EULA scroll — seeded legalese generated from a template array (write 12 base clauses of corporate parody, cycled to 24 paragraphs), real checkbox inline in checkboxPara, 3 decoys; campfire burn renders paragraphs as charred rows. Phase 3: the Submit button becomes `position:absolute` within the form panel, flees the cursor (repulsion radius 120px, max speed 900px/s * `speedScale` from engine, framerate-independent), taunt lines cycle above it; clicking it fires `applyPointer({kind:"submit-button"})`. Reduced motion: button teleports between 5 fixed slots instead of fleeing smoothly.
- [ ] **Step 2: receipt-card.** Renders on victory: monospace receipt (dashed tear edges, "THE PASSWORD GAME 2 — RECEIPT", line items from `g.stats` + total time + seed + date, "CUSTOMER COPY"), name-entry input + submit-to-leaderboard button (wired in Task 14 — render disabled with "leaderboard offline" note until then), race-this-seed copy link, play-again (new seed) and play-daily buttons. Screenshot-bait framing per spec.
- [ ] **Step 3: Visual verification:** drive a full real run at 4x an accelerated clock? No — add nothing to the engine; instead use `?seed=` + `?event=` and play the finale for real (requestSubmit is reachable quickly with a short scripted password using the debug seed printed by the integration test). Screenshot all three phases and the receipt.
- [ ] **Step 4: Commit** `feat(pg2): finale stage and receipt card`.

---

### Task 14: Sound

**Files:**

- Create: `sound/audio.ts`, `sound/motifs.ts`
- Modify: `stage/game-shell.tsx` (effect drain routes `sound` effects; HUD toggle initializes context)

- [ ] **Step 1: audio.ts** — lazy singleton AudioContext created on first user toggle-on; master chain `DynamicsCompressorNode` as limiter (threshold -6, knee 0, ratio 20, attack 0.003, release 0.25) -> destination; two GainNodes (sfx 0.9, music 0.5) into the limiter. `playTone`/`playNoise` helpers mirroring the space-shooter's synthesis utilities (read `src/components/game/space-shooter/audio.ts` — if the exact file name differs, locate the audio module committed in 06dec3a — and follow its envelope/limiter idioms; do not import across games, copy the small helpers).
- [ ] **Step 2: motifs.ts** — named cues used by engine `sound` effects, one function per cue: `telegraph-doom` (low riser), family stingers (`inhabitant-arrive` warm major 3rd, `force-onset` dissonant cluster, `invasion-onset` descending alarm, `chrome-onset` bland UI "ding" — the joke), `gerald-feed`, `snake-chomp`, `paper-shred`, `parasite-wiggle` (barely audible tick), `act-fanfare` (per-act pitch rising), `missile-launch`/`missile-intercept`/`missile-land`, `eula-burn`, `victory` (a genuinely triumphant 4-chord finale theme, look-ahead scheduled), `knockback`. Every cue is procedural — no audio files.
- [ ] **Step 3:** Map effect sound keys -> motif functions in the shell drain; unknown keys log nothing and no-op.
- [ ] **Step 4: Verify in browser with the toggle on** (listen: telegraph before onset, act fanfares, victory theme). Commit `feat(pg2): procedural sound — limiter bus, family motifs, finale theme`.

---

### Task 15: Leaderboard — table, route rewrite, receipt wiring

**Files:**

- Modify: `db/init.sql` (append table), `src/app/api/password-game/leaderboard/route.ts` (full rewrite), `stage/receipt-card.tsx` (wire submit + board display)
- Test: `src/app/api/password-game/__tests__/pg2-leaderboard.test.ts` (mirror the existing API test patterns — find v1's route tests first and follow them; if none exist, colocate under `src/app/api/password-game/leaderboard/__tests__/`)

- [ ] **Step 1: Append to `db/init.sql`:**

```sql
CREATE TABLE IF NOT EXISTS pg2_leaderboard_entries (
  id              SERIAL PRIMARY KEY,
  name            TEXT        NOT NULL,
  seed            BIGINT      NOT NULL,
  time_ms         INTEGER     NOT NULL,
  daily           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pg2_leaderboard_seed_time
  ON pg2_leaderboard_entries (seed, time_ms ASC);
```

- [ ] **Step 2: Runtime ensure.** Prod's DB volume is already initialized, so init.sql will NOT create this table there. In the route module, add a module-level `let ensured: Promise<void> | null` and an `ensureTable(pool)` that runs the same `CREATE TABLE IF NOT EXISTS` + index once per process before the first query. This is the sanctioned pattern for this repo's compose deploy (document with exactly that comment).
- [ ] **Step 3: Rewrite the route** following the v1 route's structure exactly (guardedJsonRoute key `"pg2-leaderboard"`, limit 10/60s; `sanitizePlayerName` max 16; validation: seed integer 0..2^32-1, timeMs integer 10_000..3_600_000, daily boolean). GET: `?seed=` -> top 50 for the seed by time_ms asc; `?daily=1` -> top 50 where daily is true and `created_at::date = now()::date`; neither -> top 50 all-time. POST inserts, returns rank within the same seed, trims to fastest 500 per seed (`DELETE ... WHERE id NOT IN (SELECT id ... WHERE seed = $1 ORDER BY time_ms ASC LIMIT 500)`).
- [ ] **Step 4: Tests:** mock `getPool` (in-memory stub capturing queries — follow the repo's existing db-mocking pattern if present; check `src/lib/__tests__` first). Cover: rejects bad seed/timeMs, sanitizes name, GET filters. Run green.
- [ ] **Step 5: Wire receipt-card:** POST on submit, then fetch and render the seed board inline (rank highlighted); daily runs post `daily: true` and show the daily board.
- [ ] **Step 6: Commit** `feat(pg2): seed-and-daily leaderboard on pg2_leaderboard_entries` .

---

### Task 16: v1 removal, hub card, gates, deploy readiness

**Files:**

- Delete: `src/components/game/password-game/` (all), `src/app/games/password-game/leaderboard/` (both files)
- Modify: `src/app/games/games-meta.ts`, `src/app/games/password-game/page.tsx` (drop any leftover v1 imports), anything the grep in Step 2 finds
- Modify: v1 engine tests under the deleted dir vanish with it — confirm coverage ratchets still pass (PG2's suites replace them)

- [ ] **Step 1: Update the games card** in `games-meta.ts`: remove `hidden: true`, set `title: "The Password Game 2"`, `tagline: "The form fights back"`, `description:` "A five-act sign-up form from hell. Rules stack, creatures move in, fleets invade, and everything you keep alive fights beside you at the finale. One epic seeded run; race the daily."`, keep `accent: "#f472b6"`and`external: true`.
- [ ] **Step 2: Grep for stragglers:** `grep -rn "password-game/" src --include="*.ts*"` and fix every import that referenced the deleted v1 component dir (the API data routes and `src/data/password-game` remain — only component imports must go). Check `game-loader.tsx` and `banners.tsx` for password-game entries (games-meta says external games may not be registered there — verify, and add a PG2 banner entry if the hub expects one for non-hidden games).
- [ ] **Step 3: Delete** the directories listed above. Run `pnpm exec knip` — it will catch newly unused exports (e.g. orphaned data-module setters if a v1-only feed died; wordle/chess/countries must remain used by PG2 rules).
- [ ] **Step 4: Full gate sweep** (from AGENTS.md, tests before build):

```bash
pnpm format:check && pnpm exec oxlint -c .oxlintrc.json . && pnpm lint && pnpm typecheck && \
  node scripts/check-env-drift.mjs && node scripts/check-action-pins.mjs && \
  node scripts/check-root-files.mjs && pnpm exec knip && \
  pnpm test && pnpm test:coverage && pnpm build
```

Fix everything it raises. `rm -rf .next` after.

- [ ] **Step 5: Full visual play-through in the browser** — a real run start to victory (use a fresh seed, then the daily), screenshots at: prologue, each event that fires, the two-crisis moment, all three finale phases, receipt, leaderboard render, games hub card. This is the acceptance test for the seven viewer-experience laws; fix legibility issues found.
- [ ] **Step 6: Commit** `feat(pg2): replace v1 — hub card live, v1 retired` and stop. Deploy is a separate user-confirmed step (push to main is not deploy; compose-deploy on `hnV_k4WYHOmodXzsvQeDk` after user confirmation).

---

## Self-review notes (resolved during planning)

- Spec coverage: every spec section maps to tasks — run structure/acts (2, 5), finale+payoff (10, 13), 12 events (6-9, 12), Director (3), rules (4), viewer layer (11-13: title cards, mood tags, receipt, race-this-seed, telegraphs are per-event `telegraphMs` + painters), scoring/leaderboard (15), architecture boundaries (1-2), art direction (11-12), testing (throughout + 16), v1 replacement (16).
- The act-advance exemption for never-resolving inhabitants (Task 6 Step 3) is the one engine rule not in the spec; it is the minimal mechanism that lets inhabitants persist across acts as the spec requires.
- Event-coupled rules inject at event onset (spec: "interleaved with the Director's schedule"); core roster is 17, so runs land at 18-22 rules total — inside the spec's "about 20".
- Type names are consistent across tasks: `GameState`, `EventDef`, `EventInstance`, `Pg2Rule(Def)`, `PointerTarget`, `Effect`, `FinaleState`, `AllyId`, `StageLayout` (defined where used in Task 12).
