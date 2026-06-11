# Architecture Refactor Plan

> For agentic workers: execute this plan in small slices. Keep every slice shippable, run lint, tests, build, and use Chrome verification for touched pages.

**Goal:** Reduce the parts of the portfolio that are hardest to reason about, easiest to regress, and most likely to bloat pages. The first cleanup pass already removed the largest homepage bundle offender; the next work should target game architecture.

## Current Baseline

- Graphify source graph: 173 files, 1,223 nodes, 1,959 edges, 84 communities.
- Graphify god nodes: `RuleDef`, `runTick()`, `loadProfile()`, `SoundManager`, `pickOne()`, `HextrisSounds`, `saveProfile()`, `rangeInt()`, `VoltorbFlip`, `mulberry32()`.
- Homepage initial route chunks after the chat and icon cleanup: 1,084.0 KB uncompressed, down from about 6,132.2 KB.
- Full `simple-icons` package markers are no longer present in emitted static chunks.

## Findings

1. `src/components/game/space-shooter.tsx` is the biggest architecture risk.
   - Size: about 266 KB.
   - It mixes game constants, profile persistence, sound, boss AI, collision updates, rendering, overlays, and input behavior.
   - Refactor priority: highest. This file is difficult to test and easy to break during feature work.

2. Game profile and audio helpers are too central in the graph.
   - Graphify highlights `loadProfile()`, `saveProfile()`, and `SoundManager` as high-degree nodes.
   - These should become explicit service modules with versioned data boundaries, narrow exports, and focused tests.

3. Password Game is more modular, but its rule engine is the correctness core.
   - `RuleDef` and `runTick()` dominate the graph.
   - Keep rule definitions data-driven and test-heavy. Avoid moving UI concerns into rule modules.

4. Secondary large files should wait until the space shooter seam is clean.
   - `src/components/game/hextris.tsx`: about 111 KB.
   - `src/components/game/super-voltorb-flip.tsx`: about 91 KB.
   - Both deserve follow-up splits, but they are less urgent than space shooter.

## Execution Plan

### Phase 1: Lock The Baseline

- Keep `.gitignore` and ESLint ignore entries for `graphify-out` and generated/legacy folders.
- Keep chat panel lazy loaded outside the homepage shell.
- Keep `TechIcon` on an explicit Simple Icons registry.

Acceptance:
- `pnpm exec eslint src next.config.ts --quiet` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- Homepage initial chunks stay near 1.1 MB uncompressed unless a deliberate feature changes that.

### Phase 2: Split Space Shooter Domain Modules

Create `src/components/game/space-shooter/` and move pure code out first:

- `constants.ts`: arena values, spawn limits, timing constants, environment definitions.
- `types.ts`: game state, boss, projectile, profile, power-up, and environment types.
- `rng.ts`: `mulberry32()` and deterministic helpers.
- `profile.ts`: profile schema, migration, `loadProfile()`, `saveProfile()`.
- `bosses/schedule.ts`: boss schedule and static boss metadata.

Acceptance:
- The current `space-shooter.tsx` still renders the game.
- Pure modules have unit tests for profile migration, deterministic RNG, and boss schedule.
- No direct behavior changes.

### Phase 3: Extract Boss And Collision Engine

Move behavior-heavy functions into engine modules:

- `bosses/behaviors.ts`: `runWardenBehavior()`, `runVoidTyrantBehavior()`, `runHarvesterBehavior()`, and sibling boss routines.
- `engine/collisions.ts`: ship, obstacle, bullet, power-up, and boss projectile hit checks.
- `engine/powerups.ts`: active power-up state and application helpers.
- `engine/step.ts`: one frame/update step that can be tested without React.

Acceptance:
- Boss behavior tests cover at least one deterministic projectile pattern and one collision outcome.
- Render loop calls the extracted engine instead of owning all mutation logic.
- No new `any` escapes or broad mutable globals.

### Phase 4: Split React Presentation

Once the domain logic is outside the component, split UI/rendering:

- `SpaceShooter.tsx`: integration shell and state wiring.
- `Scene.tsx`: Three scene composition.
- `Hud.tsx`: score, coins, boss, power-up, and status display.
- `StartOverlay.tsx`, `GameOverOverlay.tsx`, `ShopOverlay.tsx`: modal/overlay surfaces.
- `InputController.tsx` or `useSpaceShooterInput.ts`: keyboard, pointer, mobile input.

Acceptance:
- Top-level `SpaceShooter.tsx` falls below roughly 45 KB.
- Overlays can be reviewed independently from engine logic.
- Chrome smoke verifies start, movement, shooting, death, and restart.

### Phase 5: Repeat The Pattern On Smaller Games

After space shooter is stable:

- Split `hextris.tsx` into engine, input, audio, and presentation modules.
- Split `super-voltorb-flip.tsx` around board state, memo/audio/effects, and layout.
- Keep Password Game refactors limited to rule-engine boundaries unless a bug requires broader work.

Acceptance:
- Each game entry component becomes a readable shell.
- Pure game logic has targeted tests.
- Graphify god nodes move away from large React component files and into intentional modules.

## Do Not Do Yet

- Do not redesign the game UI during the architecture split.
- Do not change scoring, difficulty, or stored profile semantics without explicit tests.
- Do not add new dependencies for this refactor.
- Do not combine the space shooter, hextris, and voltorb splits into one change.

## Verification After Each Phase

- `pnpm exec eslint src next.config.ts --quiet`
- `pnpm test`
- `pnpm build`
- `python -m graphify update src`
- Chrome verification for any touched playable route.
