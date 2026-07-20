# PG2 Improvement Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every PG2 event legible (goal/action/cause-effect/fiction), make events chain
into one connected run, and make rule cards playable (chess, CAPTCHA, consent wall, color
match), per docs/specs/2026-07-20-pg2-improvement-pass-design.md.

**Architecture:** Three layers over the shipped engine: (A) a shared crisis-meter painter
idiom plus per-event legibility fixes; (B) six cross-event chains using the
`ctx.state.events.find(e => e.defId === X)?.data` read idiom, each with a visible beat;
(C) a widget input channel (`applyText` types into the password; `setRuleState` +
`RuleApi.ruleState` for non-text outcomes) powering four playable rule-card widgets.

**Tech Stack:** Existing PG2 stack — TypeScript strict, React 19 client components, canvas
painters, vitest + RTL, chess.js (already a dependency), mulberry32 seeded RNG via
`subSeed`. No new dependencies. No emojis anywhere.

**House rules for every task:** pinning tests BEFORE behavior changes on touched events;
never weaken a gate; conditional classNames keep the separator space in STATIC template text
(prettier-plugin-tailwindcss strips leading whitespace inside class strings); tests use OS
temp dirs, never `.data/`; commit directly to main; run the touched test files plus
`engine/__tests__/run-integration.test.ts` before each commit.

**Shared interfaces defined by this plan** (locked here; later tasks must match exactly):

```ts
// stage/painters.ts (Task 1)
export interface MeterSpec {
  x: number;
  y: number;
  w: number; // top-left + width, canvas px
  value: number;
  max: number; // current / full-scale
  threshold?: number; // pass/fail tick, same units as value
  label: string; // name tag above the bar
  valueText?: string; // right-aligned readout; default `${Math.round(value)}`
  color: string; // family accent (painters already resolve these)
}
export function drawCrisisMeter(c: CanvasRenderingContext2D, spec: MeterSpec): void;

// engine/engine.ts (Task 8)
export function applyText(g: GameState, text: string): void; // End + applyKey per char
export function setRuleState(g: GameState, ruleId: string, value: unknown): void; // writes + version bump

// engine/types.ts (Task 8)
// RuleApi gains: ruleState(id: string): unknown

// stage/rule-list.tsx (Task 8)
// RuleListProps gains: onWidgetText(text: string): void; onRuleState(id: string, value: unknown): void

// engine/events/galaga.ts / snake.ts / tetris.ts (Task 6)
export function bearSwipe(inst: EventInstance<GalagaData>, ctx: EventContext): boolean;
export function bearSwipe(inst: EventInstance<SnakeData>, ctx: EventContext): boolean;
export function bearSwipe(inst: EventInstance<TetrisData>, ctx: EventContext): boolean;
// each returns true if the swipe did something; increments the matching RunStats counter
```

---

### Task 1: Crisis meter idiom + garden legibility rework (spec A1 + A2.1)

**Files:**

- Modify: `src/components/game/password-game-2/stage/painters.ts` (extract `drawCrisisMeter`
  from the campfire fuel-gauge rendering at ~372-381; rework the garden painter ~476-541)
- Modify: `src/components/game/password-game-2/engine/events/garden.ts` (rule copy only)
- Test: `src/components/game/password-game-2/engine/__tests__/events-inhabitants.test.ts`

Garden MECHANICS are unchanged — this task is rendering + copy. The engine-visible change is
only the coupled-rule description string.

- [ ] **Step 1: Pinning test for garden mechanics** — add a test that runs the garden event
      through telegraph -> onset -> bloom -> honey accrual -> a full undistracted raid and
      asserts today's numbers (honey zeroed, blooms -2, next raid scheduled). Run it; it must
      pass BEFORE any edit. If an equivalent pinning test already exists in
      events-inhabitants.test.ts, extend it to cover the raid-drain path and move on.
- [ ] **Step 2: Failing copy test** — assert the garden coupled rule's `description`
      (`gardenDef.coupledRule.create(rng)`) no longer contains "Do not ask why" and DOES state
      the threshold (matches `/40/`), the action (matches `/basket/i`), and the foreshadow
      (matches `/bear/i` + `/remember/i`). Run: fails on current copy.
- [ ] **Step 3: Rewrite the rule copy** in `garden.ts` (gardenHoneyRule description). One to
      two sentences covering goal + action + foreshadow, e.g. "Keep the hive at 40+ honey when
      you submit. Throw the picnic basket when the bear comes — bears remember who feeds them."
      Run the copy test: passes. Run the whole inhabitants file: passes.
- [ ] **Step 4: Extract `drawCrisisMeter`** in painters.ts with the `MeterSpec` interface
      above, refactor the campfire fuel gauge to call it (visual parity — same colors, same
      geometry), and verify `pnpm typecheck` passes. No engine tests cover painters; parity is
      verified in the Task 14 browser run.
- [ ] **Step 5: Rework the garden painter**: (a) call `drawCrisisMeter` with
      `{value: honey, max: 100, threshold: 40, label: "HIVE", valueText: `${honey}`}` — ALWAYS
      drawn, loudest (pulsing/red-tinted meter) while below 40, calm above; delete the
      honey-pot-only-at->=40 rendering (painters.ts:508); (b) during `bearState ===
"telegraphed"` draw a countdown arc over the bear sized by
      `(nextBearAtMs - state.elapsedMs) / 8000`; (c) during `raiding` draw the honey value
      visibly ticking down toward the raid end (interpolate display honey toward 0 across the
      raid window — display-only, engine honey still snaps at raid end); (d) the BASKET chip
      renders "THROW BASKET" lit while telegraphed/raiding, dimmed with sub-label "bear away"
      otherwise (follow the existing chip + hit-region pattern used by FEED/STOKE/BASKET).
- [ ] **Step 6: Commit** — `feat(pg2): crisis meter idiom + garden legibility rework`

### Task 2: Snake and tetris coupled rules + instruction labels (spec A2.2 + A2.3)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/snake.ts`
- Modify: `src/components/game/password-game-2/engine/events/tetris.ts`
- Modify: `src/components/game/password-game-2/stage/painters.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/events-invasions.test.ts`

Pattern to copy: galaga's final-wave `coupledRule` (galaga.ts ~176-221) — a rule whose
validate reads the event data via `api.getEventData` and passes trivially once the event is
done or absent.

- [ ] **Step 1: Pinning tests** — snake: swallow/feed cycle numbers; tetris: block landing
      becomes `garbage` cells, click shatters. Run: pass before edits (extend existing tests if
      they already cover this).
- [ ] **Step 2: Failing rule tests** — snake: after onset, `state.rules` contains a rule id
      `"snake-fed"` whose validate fails while any cell has `status === "abducted"` with
      `eventTag === "snake"` and passes when none do; tetris: rule id `"tetris-clean"` fails
      while any `status === "garbage"` cell exists, passes when none. Both rules pass when the
      event data is null (never scheduled). Assert both descriptions state the player action:
      snake matches `/type/i` and `/end/i`; tetris matches `/click/i`.
- [ ] **Step 3: Implement both coupled rules** (`coupledRule` on `snakeDef` / `tetrisDef`,
      act3, descriptions like "Nothing may remain inside the snake when you submit — type its
      snack at the end of the box to feed it." / "No junk blocks may remain in your password —
      click garbage to shatter it."). Run tests: pass.
- [ ] **Step 4: Painter labels** — snake: draw a `FEED: <pellet char> — AT THE END` label in
      the black-hole `FEED IT:` style (painters.ts:662 reference) while the snake is in peak;
      tetris: draw `CLICK TO SHATTER` above the first landed garbage block, only until the
      player first shatters one (track a `signposted`/`shattered` flag already available in
      data, or add a display-only boolean to TetrisData with an init default).
- [ ] **Step 5: Run invasions + run-integration tests** — the run-integration solver must
      still complete runs (its play already feeds the snake and clears garbage; if a run now
      ends with leftover garbage the solver needs a shatter step — fix the solver in
      `engine/__tests__/solve.ts`, not the rule).
- [ ] **Step 6: Commit** — `feat(pg2): snake and tetris coupled rules + on-canvas instructions`

### Task 3: Parasite tell, Gerald gauge + countdown, autocorrect flash (spec A2.4-6)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/gerald.ts`
- Modify: `src/components/game/password-game-2/engine/events/autocorrect.ts`
- Modify: `src/components/game/password-game-2/stage/painters.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/events-inhabitants.test.ts`,
  `.../events-chrome.test.ts`

- [ ] **Step 1: Failing Gerald message test** — the coupled rule's failing/live
      `ValidationResult.message` matches `/^fed \d+s ago \/ 60s$/` (whole seconds, no `ms`).
- [ ] **Step 2: Implement** — gerald.ts:82 area: `message: \`fed ${Math.floor(sinceFed / 1000)}s ago / 60s\``.
      Test passes.
- [ ] **Step 3: Gerald hunger gauge** — painter calls `drawCrisisMeter` with
      `{value: hunger, max: 100, label: "GERALD", valueText: hunger tier word or number}`;
      loud when hunger high.
- [ ] **Step 4: Autocorrect flash** — when `correctOnce` rewrites, record
      `lastRewriteAtMs`/`lastRewriteCellIds` in AutocorrectData (engine change with a test:
      after a rewrite the data carries the rewritten cell ids and timestamp); the painter reads
      it and pulses those cells for ~1s. Existing toast unchanged.
- [ ] **Step 5: Parasite tell** — in the parasite painter's periodic 300ms reveal
      (painters.ts:679), add a distinct color pulse ring around the mimic cell during the
      reveal window. No engine change, no rule.
- [ ] **Step 6: Run both test files; commit** —
      `feat(pg2): gerald gauge and countdown, autocorrect flash, parasite tell`

### Task 4: Black-hole + infection refiction copy pass (spec A2.7-8)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/black-hole.ts` (mood lines),
  `.../events/infection.ts` (mood lines), `stage/painters.ts` (black-hole label copy),
  `stage/receipt-card.tsx` (CRISIS_NAMES entries)
- Test: `src/components/game/password-game-2/engine/__tests__/events-forces.test.ts`

- [ ] **Step 1: Failing copy tests** — black-hole mood/emit strings reference storage
      compaction (match `/compact/i`), not astronomy; infection mood strings reference
      corruption/malware (match `/corrupt/i` or `/malware/i`), not disease.
- [ ] **Step 2: Rewrite copy** — black-hole: painter label becomes
      `COMPACTION — FEED IT: <word>`, mood lines like "Scheduled storage compaction has begun";
      infection: "Data corruption detected" family; receipt-card CRISIS_NAMES: `"black-hole":
"The storage compactor"`, `infection: "The data corruption"`. Mechanics, thresholds, and
      antidote flow untouched.
- [ ] **Step 3: Run forces tests + receipt test file; commit** —
      `feat(pg2): refiction black hole and infection as enterprise processes`

### Task 5: Chains 1-2 — autocorrect sabotages inhabitants; campfire quarantines infection (spec B1-B2)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/autocorrect.ts`,
  `.../events/campfire.ts`
- Test: new `src/components/game/password-game-2/engine/__tests__/events-chains.test.ts`

Cross-event idiom (use everywhere, never invent another):

```ts
const inst = ctx.state.events.find((e) => e.defId === "gerald");
const d =
  inst && inst.phase !== "telegraph" && inst.phase !== "done" ? (inst.data as GeraldData) : null;
```

Import the data types (`GeraldData`, `GardenData`, `CampfireData`, ...) from their modules.

- [ ] **Step 1: Failing chain-1 tests** (events-chains.test.ts, new file; build states with
      the same harness run-integration uses — createRun + forced scheduling): when autocorrect
      rewrites the word whose source is `gerald`, active Gerald's hunger increases by 25
      (clamped 100); source `honey` drains active garden honey by 15 (floor 0); source `fire`
      drops active campfire fuel by 20 (floor 0); a mood effect is emitted naming the victim;
      no active victim -> rewrite behaves exactly as today (pin that).
- [ ] **Step 2: Implement chain 1** in autocorrect.ts `correctOnce` — a
      `SABOTAGE: Record<string, "gerald" | "garden" | "campfire">` map keyed by source word
      (`gerald`/`honey`/`fire`, autocorrect.ts:33-41), apply the hit + emit mood
      ("The autocorrect demon ate Gerald's dinner" pattern). Tests pass.
- [ ] **Step 3: Failing chain-2 tests** — campfire with fuel >= 60 and an infected cell:
      after 5000ms of ticks the leftmost infected cell is normal again,
      `stats.infectionsCured` incremented, a mood emitted; fuel < 60 -> no cure; cadence is one
      cure per 5000ms (two infected cells need 10s).
- [ ] **Step 4: Implement chain 2** in campfire.ts onTick — `QUARANTINE_MIN_FUEL = 60`,
      `QUARANTINE_PERIOD_MS = 5000`, carry-accumulator like garden's `honeyCarryMs`; cure via
      `setCellStatus` (the same path infection's antidote uses). Tests pass.
- [ ] **Step 5: Run chains + inhabitants + forces + run-integration; commit** —
      `feat(pg2): chains — autocorrect sabotage, campfire quarantine`

### Task 6: Chains 3-4 — the bear fights invaders; black hole eats garbage (spec B3-B4)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/garden.ts`, `galaga.ts`,
  `snake.ts`, `tetris.ts`, `black-hole.ts`
- Test: `src/components/game/password-game-2/engine/__tests__/events-chains.test.ts`

- [ ] **Step 1: Failing bearSwipe tests** — each invasion module exports `bearSwipe` (see
      the shared-interface block): galaga downs one alien (freeing its carried glyph if any,
      `stats.aliensDowned` +1); snake pushes its next bite one full interval out; tetris
      shatters one garbage cell (`stats.garbageCleared` +1). Each returns false (no-op) when it
      has nothing to hit.
- [ ] **Step 2: Implement the three `bearSwipe` exports** by reusing each module's existing
      kill/feed/shatter internals (extract a private helper where the pointer handler already
      does it). Tests pass.
- [ ] **Step 3: Failing garden-hook test** — basket toss (`basket-button` pointer) while
      telegraphed/raiding AND an invasion instance in `peak` phase: the matching `bearSwipe`
      runs (priority galaga > snake > tetris when several are live), a mood emits matching
      `/remember/i`; with no live invasion the toss behaves exactly as today (pin that).
- [ ] **Step 4: Implement the garden hook** in `garden.onPointer`. Tests pass.
- [ ] **Step 5: Failing black-hole tests** — with both garbage and normal cells in reach,
      capture prefers garbage; captured-garbage cells return from collapse with `status:
"normal"` (value-bearing); first garbage capture emits a mood; pin: no-garbage behavior
      identical to today.
- [ ] **Step 6: Implement** in black-hole.ts `pullNearest` (prefer `status === "garbage"`)
      and the collapse restore path (returning cells always land `normal`). Tests pass.
- [ ] **Step 7: Run chains + invasions + forces + run-integration; commit** —
      `feat(pg2): chains — bear counterattack, compactor eats garbage`

### Task 7: Chains 5-6 — campfire ignites a banner; Gerald slows the snake (spec B5-B6)

**Files:**

- Modify: `src/components/game/password-game-2/engine/events/cookie-banner.ts`, `snake.ts`
- Modify: `src/components/game/password-game-2/stage/chrome-events.tsx` (burn styling hook)
- Modify: `src/components/game/password-game-2/stage/pg2.css` (burn animation class)
- Test: `src/components/game/password-game-2/engine/__tests__/events-chains.test.ts`

- [ ] **Step 1: Failing chain-5 tests** — banner swarm live with >= 2 banners + campfire
      burning with fuel >= 50: exactly one banner is removed once per swarm
      (`fireUsedThisSwarm` flag in CookieBannerData, reset when a new swarm spawns), campfire
      fuel drops 15, mood emitted matching `/burn|ignit/i`; fuel < 50 or 1 banner -> no-op.
- [ ] **Step 2: Implement chain 5** in cookie-banner.ts onTick reading campfire data via the
      idiom; mark the removed banner id in data for one frame so chrome-events can render a
      brief `.pg2-banner--burning` class (CSS keyframe, ~400ms) before removal — if the
      one-frame handshake fights the React render cycle, an instant removal + mood + existing
      paper sound is the accepted minimum beat.
- [ ] **Step 3: Failing chain-6 tests** — snake in peak with Gerald active at hunger <= 40:
      effective bite interval is 1.5x the base (next bite scheduled later); hunger > 40 or no
      Gerald -> base cadence (pin today's cadence); a single mood emits once per snake instance
      when the slowdown first applies.
- [ ] **Step 4: Implement chain 6** in snake.ts onTick (scale when scheduling the NEXT bite
      — never retro-shift an already-scheduled one, so determinism holds). Tests pass.
- [ ] **Step 5: Run chains + chrome + invasions + run-integration; commit** —
      `feat(pg2): chains — campfire burns a banner, fed Gerald calms the snake`

### Task 8: Widget input channel (spec C1)

**Files:**

- Modify: `src/components/game/password-game-2/engine/engine.ts` (applyText, setRuleState,
  makeRuleApi gains ruleState)
- Modify: `src/components/game/password-game-2/engine/types.ts` (RuleApi.ruleState)
- Modify: `src/components/game/password-game-2/stage/rule-list.tsx` (props + pass-through
  to payload renderers)
- Modify: `src/components/game/password-game-2/stage/game-shell.tsx` (wire callbacks)
- Test: `src/components/game/password-game-2/engine/__tests__/engine.test.ts`,
  `stage/__tests__/game-shell.test.tsx`

- [ ] **Step 1: Failing engine tests** — `applyText(g, "Nf3")` moves the caret to the end
      then applies each char through the SAME path as typing (events may intercept: assert an
      active loading-bar stun swallows applyText chars exactly as it swallows keys);
      `setRuleState(g, "x", v)` stores and bumps `g.version`; `makeRuleApi(g).ruleState("x")`
      reads it back, `null`/undefined-safe.
- [ ] **Step 2: Implement** all three (applyText = `applyKey(g, "End")` then per-char
      `applyKey`; setRuleState as specified; RuleApi.ruleState reads `g.ruleStates[id] ?? null`
      — declare the return as `unknown`). Tests pass.
- [ ] **Step 3: Thread the callbacks** — RuleListProps gains `onWidgetText` and
      `onRuleState` (shared-interface block); game-shell's RunningView passes handlers that
      call `applyText`/`setRuleState` on `gameRef.current`, then `forceRender()` and
      `focusHiddenInput()` (mirror the existing `applyTarget` shape). PayloadView receives and
      forwards them (unused until Task 9). RTL test: a fake payload button wired to
      onWidgetText("AB") results in the password containing "AB".
- [ ] **Step 4: Run engine + shell tests; commit** —
      `feat(pg2): widget input channel — applyText, ruleState, rule-card callbacks`

### Task 9: Playable chess board (spec C2.1)

**Files:**

- Modify: `src/data/password-game/chess.ts` (ChessPuzzle gains `fen: string`),
  `src/app/api/password-game/chess-puzzle/route.ts` (include fen in the served puzzle —
  it already loads it), `src/components/game/password-game-2/feeds.ts` (isChessPuzzle
  verifies fen), `src/components/game/password-game-2/engine/rules/act3.ts` (payload gains
  fen), `src/components/game/password-game-2/stage/rule-list.tsx` (interactive ChessBoard)
- Test: `src/app/api/password-game/chess-puzzle/__tests__/route.test.ts` (or the existing
  route test location), `src/components/game/password-game-2/__tests__/feeds.test.ts`, new
  `stage/__tests__/chess-widget.test.tsx`

- [ ] **Step 1: Failing data/route/feed tests** — served puzzle JSON includes a `fen`
      string; `isChessPuzzle` rejects a puzzle missing fen; the static fallback puzzle in
      chess.ts carries a correct fen for its board.
- [ ] **Step 2: Thread fen through** (type, route, static fallback, feed guard, act3
      payload). Tests pass. NOTE: the deployed route already loads `puzzle.fen` internally
      (loadPuzzlePosition) — this exposes it.
- [ ] **Step 3: Failing widget tests** (RTL, new ChessBoard behavior; construct with a
      known fen, e.g. scholar's-mate-in-one): clicking a side-to-move piece highlights its
      legal target squares (assert via data-attrs/class on squares); clicking a highlighted
      target calls `onWidgetText` with the SAN (e.g. "Qxf7#"); clicking an opponent piece or
      empty square with no selection sets a shake class and calls nothing; after a move the
      board resets to the puzzle position (retry-friendly); a payload without fen falls back to
      the current static rendering.
- [ ] **Step 4: Implement** — client `Chess` from `chess.js` (import the named `Chess`
      export; instantiate per interaction from the payload fen — cheap, keeps the component
      stateless between renders except selection state), `chess.moves({square, verbose: true})`
      for targets, `chess.move(...)` -> `.san` -> `onWidgetText(san)` -> `chess.undo()` or
      re-instantiate. Keep the existing square grid markup/classes; add selection/target/shake
      classes in pg2.css. Buttons inside the rule card must not trigger the card's
      expand-collapse (stopPropagation) and must not steal global keyboard focus.
- [ ] **Step 5: Run route/feeds/widget tests + run-integration; commit** —
      `feat(pg2): playable chess board — click a piece, click a square, it types the move`

### Task 10: Rejecting image CAPTCHA (spec C2.2)

**Files:**

- Modify: `src/components/game/password-game-2/engine/rules/prologue.ts` (captcha-human
  rework), `src/components/game/password-game-2/stage/rule-list.tsx` (CaptchaWidget),
  `src/components/game/password-game-2/stage/pg2.css`, `engine/__tests__/solve.ts`
  (solver types the token)
- Test: `src/components/game/password-game-2/engine/__tests__/rules.test.ts`, new
  `stage/__tests__/captcha-widget.test.tsx`

- [ ] **Step 1: Failing rule tests** — `captcha-human.create(rng)` payload contains
      `{ captcha: { grids: [Grid, Grid], target: string, token: string } }` where each Grid is
      9 tiles of `{ kind: "traffic-light" | "crosswalk" | "storefront" }`, each grid contains
      3-5 tiles of the target kind, `token` matches `/^OK-[0-9A-F]{4}$/`, and everything is
      deterministic per seed (same rng seed -> identical payload twice). validate: passes iff
      password includes token.
- [ ] **Step 2: Implement the rule** — generate both grids and the token from the rule's
      `create(rng)` stream. Description: "Prove you are human. Complete the verification
      challenge and include your confirmation code." Solver: `solve.ts` reads the payload token
      and appends it (worst-case length accounting).
- [ ] **Step 3: Failing widget tests** — renders grid 1 as 9 SVG tiles (vector art per
      kind — simple primitives, aria-labels, no emojis, no external images) with a prompt
      ("Select all tiles containing <target>") and a Verify button; selecting exactly the
      correct set and verifying on grid 1 REJECTS ("Verification failed. Please try again.")
      and swaps to grid 2 — exactly one forced rejection; wrong set -> rejection WITHOUT
      consuming the forced-rejection (still on grid 1); correct set on grid 2 reveals the token
      and calls `onWidgetText(token)`; component state publishes progress via
      `onRuleState("captcha-human", { stage })`.
- [ ] **Step 4: Implement CaptchaWidget** in rule-list.tsx (or a sibling
      `stage/widgets/captcha.tsx` if rule-list would exceed ~600 lines — prefer the sibling
      file; same for Tasks 11-12 widgets). Wire into PayloadView on the `captcha` payload key.
- [ ] **Step 5: Run rules + widget tests + run-integration; commit** —
      `feat(pg2): rejecting image captcha — the form doubts your humanity exactly once`

### Task 11: Consent-preference wall (spec C2.3)

**Files:**

- Modify: `src/components/game/password-game-2/engine/rules/act1.ts` (new rule
  `consent-preferences`), `src/components/game/password-game-2/engine/rules/index.ts` (if
  the act manifest lists rules there), `stage/widgets/consent.tsx` (new),
  `stage/rule-list.tsx` (dispatch), `stage/pg2.css`, `engine/__tests__/solve.ts`
- Test: `engine/__tests__/rules.test.ts`, new `stage/__tests__/consent-widget.test.tsx`

Puzzle model: 6 toggles. Clicking toggle `i` flips `t[i]`; if the click turned `i` OFF,
neighbor `n[i]` turns ON. Generation: start all-off; K=4 times pick a random `i` (seeded)
and REVERSE a move (set `t[i] = on`, and if `t[n[i]]` is on, set it off); the resulting
vector is `initial`. Goal state: all off.

- [ ] **Step 1: Failing rule tests** — payload
      `{ consent: { toggles: string[6], neighbor: number[6], initial: boolean[6], passphrase } }`;
      labels are 6 enterprise data-sharing categories; `neighbor[i] !== i`; passphrase is one of
      a fixed uppercase word list (e.g. OPTOUT / UNSUBSCRIBE / REVOKE / DECLINE) chosen by rng;
      deterministic per seed; **solvability: a BFS over the move graph from `initial` reaches
      all-off within 12 moves for 50 distinct seeds**; validate passes iff password includes
      passphrase.
- [ ] **Step 2: Implement the rule** in act1.ts. Description: "Decline all optional data
      sharing in your preference center, then include the confirmation phrase." Solver: append
      the passphrase.
- [ ] **Step 3: Failing widget tests** — renders 6 labeled switches from `initial`;
      clicking applies the move semantics; "Save preferences" is disabled until all-off, then
      reveals the passphrase and calls `onWidgetText(passphrase)` +
      `onRuleState("consent-preferences", { solved: true })`; a "reset to initial" link exists
      (players can wedge themselves; reset is the honest out).
- [ ] **Step 4: Implement `stage/widgets/consent.tsx`**; dispatch from PayloadView on the
      `consent` key. Switch styling: real toggle switches (CSS), enterprise-settings look,
      conditional classes follow the static-space idiom.
- [ ] **Step 5: Run rules + widget tests + run-integration; commit** —
      `feat(pg2): consent-preference wall — six toggles, one honest combination`

### Task 12: RGB color match (spec C2.4)

**Files:**

- Modify: `src/components/game/password-game-2/engine/rules/act2.ts` (new rule
  `accent-color`), `stage/widgets/color-match.tsx` (new), `stage/rule-list.tsx` (dispatch),
  `stage/pg2.css`, `engine/__tests__/solve.ts`
- Test: `engine/__tests__/rules.test.ts`, new `stage/__tests__/color-widget.test.tsx`

- [ ] **Step 1: Failing rule tests** — payload `{ accent: { hex: string } }` where hex
      matches `/^#[0-9a-f]{6}$/` and every channel byte is a multiple of 17 (the 0x11 lattice —
      `rangeInt(rng, 0, 15) * 17` per channel); deterministic per seed; validate passes iff
      password includes the hex string.
- [ ] **Step 2: Implement the rule** in act2.ts. Description: "Confirm your workspace accent
      color. Match the swatch exactly and include its hex code." Solver: append the hex.
- [ ] **Step 3: Failing widget tests** — renders the target swatch, three labeled sliders
      (`input type=range`, min 0, max 255, step 17) and a live preview; on all three channels
      matching the target, calls `onWidgetText(hex)` exactly once (not again on further
      jiggling — latch until a channel diverges).
- [ ] **Step 4: Implement `stage/widgets/color-match.tsx`**; dispatch on the `accent` key.
- [ ] **Step 5: Run rules + widget tests + run-integration; commit** —
      `feat(pg2): rgb color match — confirm your workspace accent color`

### Task 13: Solvability, length budget, docs

**Files:**

- Modify: `src/components/game/password-game-2/engine/__tests__/solve.ts` +
  `run-integration.test.ts` (assert full 19-rule victory), possibly the max-length rule's
  target range (only if the length budget fails), `DESIGN.md` (intentional-design register:
  the CAPTCHA's single forced rejection and the consent wall's flip-a-neighbor are
  INTENTIONAL dark patterns; crisis-meter idiom noted as the legibility convention),
  `AGENTS.md` (component map sentence if drifted), `docs/specs/...` untouched.
- Test: full suite.

- [ ] **Step 1: Extend run-integration** to drive victory across seeds with all 19 rules
      under worst-case feeds (offline freebies) and best-case (injected fixtures), asserting
      the four widget tokens (SAN when feed present, OK-token, passphrase, hex) fit inside the
      max-length rule's budget alongside everything else. If the budget fails, widen the
      max-length rule's seeded target range minimally and pin the new range with a test.
- [ ] **Step 2: Coverage + gates** — run the FULL sweep from AGENTS.md (format:check,
      oxlint, lint, typecheck, env-drift, action-pins, root-files, knip, test, coverage,
      build, then `rm -rf .next`). Fix fallout. Coverage floors are ratcheted — do NOT lower;
      new widget/chain tests should keep measured coverage at or above current (~31%/27%).
- [ ] **Step 3: Docs** — DESIGN.md register entries + conventions note; anything in
      AGENTS.md architecture prose now stale.
- [ ] **Step 4: Commit** — `test(pg2): 19-rule solvability + gates; docs: register the new dark patterns`

### Task 14: Browser acceptance + deploy gate

**Files:** none (verification only; fixes get their own commits)

- [ ] **Step 1: Launch** — detached dev server (`node node_modules/next/dist/bin/next dev
-p <port>`, never `pnpm dev`), stealth-chrome with
      `--disable-features=CalculateNativeWinOcclusion`, http://localhost.
- [ ] **Step 2: Verify workstream A** — `?event=garden`: honey meter visible from onset
      with threshold tick, loud below 40, bear countdown arc, labeled basket chip states;
      `?event=snake` / `?event=tetris`: coupled rule cards appear and the on-canvas
      instructions render; gerald gauge + seconds countdown; autocorrect flash; black-hole
      compaction label. Screenshot each.
- [ ] **Step 3: Verify chains** — seeded full runs until each beat is observed (mood lines
  - effects for chains 1-6; use `?event=` forcing plus a seeded full run for overlaps).
- [ ] **Step 4: Verify widgets** — play the chess board (legal-move highlight, SAN typed),
      fail then pass the CAPTCHA (exactly one forced rejection), solve the consent wall
      (including reset), match the color; confirm each writes into the password and the rule
      flips green; confirm keyboard play is not broken by widget focus.
- [ ] **Step 5: Full victory run** — one complete seeded run to the receipt; leaderboard
      post works; zero console errors.
- [ ] **Step 6: Report to the user with screenshots; deploy ONLY on their confirmation**
      (compose-deploy `hnV_k4WYHOmodXzsvQeDk`; verify via deployment-allByCompose; never
      compose-one).

---

## Self-review notes

- Spec coverage: A1/A2.1 (T1), A2.2-3 (T2), A2.4-6 (T3), A2.7-8 (T4), B1-2 (T5), B3-4 (T6),
  B5-6 (T7), C1 (T8), C2.1-4 (T9-12), constraints/testing (T13), acceptance/deploy (T14).
- Type consistency: MeterSpec/applyText/setRuleState/ruleState/bearSwipe/onWidgetText/
  onRuleState defined once in the shared block; payload keys `captcha`/`consent`/`accent`
  each used by exactly one rule + one dispatch arm.
- Known judgment calls delegated to implementers: exact copy strings (tests pin the
  required content words), meter geometry, widget CSS. All within spec language.
