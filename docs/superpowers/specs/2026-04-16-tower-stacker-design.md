# Tower Stacker — Design Spec

**Date:** 2026-04-16
**Status:** Approved for implementation
**Scope:** New flagship canvas game for the portfolio's `/games` section, inspired by `iamkun/tower_game`.

## 1. Goal

Add a fifth game to the portfolio: a polished, responsive tower stacking game where blocks slide horizontally, the player taps to drop them, any overhang is chopped off, and the tower grows. Target feel: addictive and memorable, on par with the existing Space Shooter (`Orbital Dodge`) as a flagship. Must run on mobile, desktop, and any input device (pointer, keyboard, touch).

## 2. Scope & Non-goals

### In scope
- New game component at `src/components/game/tower-stacker.tsx` (single self-contained file, monolithic -- matches existing convention).
- Integration into game selector (`src/app/games/games-client.tsx`) with `accent-red` coloring.
- Leaderboard integration with backward-compatible extension of `/api/leaderboard` route.
- Full flagship feature set (see §4).

### Out of scope
- Powerups, multiple block shapes, wind gusts, last-chance mid-air redirect, zen mode.
- Daily challenges, multi-player.
- Unit/E2E tests (matches repo convention — manual browser testing is the bar).

## 3. Architecture

### File layout
```
src/components/game/tower-stacker.tsx   # entire game in one file
src/app/games/games-client.tsx          # add 5th tab
src/app/api/leaderboard/route.ts        # extend Entry with optional `game` field
```

### Rendering
- HTML5 Canvas 2D, DPR-aware for high-DPI sharpness.
- `requestAnimationFrame` loop with delta-time normalization (`dt` clamped to 0.05s to prevent tab-refocus physics explosions).

### State model
- **Refs** for hot game state (position, velocity, stack array, camera Y, particles, combo, biome, HP). Zero re-renders during gameplay.
- **useState** only for React-rendered UI chrome: score displayed in HUD, game state (`menu` / `playing` / `paused` / `game-over`), mode toggle, sound toggle, leaderboard modal open/closed.

### Input
Unified `dropBlock()` handler triggered by:
- Pointer down (click/tap) anywhere on canvas
- Keyboard: `Space`, `Enter`, `ArrowDown`

Touch events use pointer events; canvas gets `touch-action: manipulation` to prevent pull-to-refresh and double-tap zoom.

### Persistence
- **localStorage** keys (prefixed `tower_stacker_`):
  - `highscore` — best score number
  - `highfloors` — best floor count
  - `sound` — boolean
  - `mode` — "classic" | "sudden" | "speedrun"
  - `hints` — boolean (landing shadow)
  - `player_name` — last used leaderboard name
  - `theme` — active block theme ID
  - `themes` — JSON array of unlocked theme IDs
  - `achievements` — JSON array of unlocked achievement IDs
  - `daily_dates` — JSON array of "YYYY-MM-DD" strings (for Daily Devotee tracking)
  - `ghost` — JSON array of recorded floor placements from best run
  - `total_runs` — integer counter (unlocks Pixel theme at 50)
  - `speedrun_best` — best speedrun time in ms
- **Leaderboard API** for global top 25 (see §7).

## 4. Game mechanics

### Stack representation
- `stack: Floor[]` where `Floor = { x, y, width, height, color, isPerfect }`.
- Index 0 is a fixed base plate (screen-wide, at bottom).

### Active block
- `activeBlock = { x, y, width, color, direction (+1 / -1), speed }`.
- Spawned immediately above current top floor's Y (offset by block height + small gap so it sits visually above).
- Spawn side alternates (or randomizes) per block; `x` starts at the playfield edge on that side.
- Travel range: `[0, playfieldWidth - activeBlock.width]`. Block flips direction on reaching either edge.

### Per-frame loop
1. Compute `dt` (clamped).
2. If `playing`: advance `activeBlock.x += direction * speed * dt`. Flip direction when `x <= 0` or `x >= playfieldWidth - width` (ping-pong, crisp — not sinusoidal).
3. Update falling debris particles (velocity + gravity + rotation).
4. Decay: screen shake, combo flash, biome transition lerp (0 → 1 over 1.2s).
5. Camera: `cameraY` lerps toward `stackTopY - viewportHeight * 0.6`. Zoom scale eases from 1.0 → 0.75 over 0 → 50 floors.
6. Milestone cinematic triggers (floors 50, 100): ease scale to 0.3 for 1.5s, then ease back.
7. Draw order: background gradient → parallax layers → stack floors (culled to viewport) → landing shadow → active block → falling debris → particles → ambient biome events → HUD overlay (via React absolute-positioned siblings).

### Drop handler
1. Gate: ignore unless `state === 'playing'` and no drop in flight.
2. `prevFloor = stack.at(-1)`.
3. Compute overlap:
   ```
   overlapL = max(active.x, prev.x)
   overlapR = min(active.x + active.w, prev.x + prev.w)
   overlapW = overlapR - overlapL
   ```
4. **Complete miss** (`overlapW <= 0`):
   - Classic HP mode: `hp--`. If `hp === 0`, `gameOver()`. Trigger screen shake + red flash. Active block becomes debris with full fall physics.
   - Sudden-death: `gameOver()` immediately.
5. **Perfect** (`|active.x - prev.x| < 4px`):
   - New floor width = `prev.width` (no shrink — "snap-back").
   - `isPerfect = true`, `perfectCombo++`.
   - Play pitched tone (base + combo semitones, capped +24).
   - Emit 12 gold sparkle particles.
6. **Normal stack:**
   - New floor uses `overlapL` and `overlapW`.
   - Emit one debris rectangle matching the chopped portion (same height as block, width = `active.width - overlapW`, x = whichever side overhung), with initial velocity, gravity, rotation — falls off-screen.
   - `perfectCombo = 0`. Play base thunk.
7. Score:
   - Normal: +25
   - Perfect: +50
   - Combo bonus: 3rd+ consecutive perfect adds `25 * (combo - 2)` on top
   - Golden block (rare): 2× the computed score
8. Push new floor. Update camera target.
9. Speed ramp: `activeBlockSpeed = BASE_SPEED + score * SPEED_FACTOR`, capped. Slow early, steeper after floor 20, max ~floor 50.
10. Biome check: if `floors >= nextBiomeThreshold` (15, 35, 60, 90 — see §5), trigger transition (banner + camera pause + background lerp).
11. Spawn next active block.

### Modes
- **Classic (3 HP):** 3 hearts shown. Each full miss costs 1 HP.
- **Sudden Death:** one miss ends the run. No HP UI.
- **Speedrun:** reach floor 50 in minimum time. One miss = run over and time invalidated. See §10.K.
Leaderboard uses `region` field to tag mode (`"classic"` / `"sudden"` / `"speedrun"`). Daily runs use a separate `game` slug (see §10.A).

## 5. Visual system

### Per-block color progression
`hue = (baseHue + floorIndex * 6) % 360`, fixed saturation/lightness for cohesion. Tower reads as a slow rainbow gradient bottom-to-top.

### Biomes (altitude-based)

| # | Biome | Unlock floor | Background | Ambient event |
|---|---|---|---|---|
| 0 | Surface | 0 | Green hills, city silhouettes, blue sky | Birds |
| 1 | Clouds | 15 | Soft cumulus, pale blue-violet sky | Small plane silhouette |
| 2 | Atmosphere | 35 | Deep violet, distant earth curve | Aurora ripple |
| 3 | Space | 60 | Starfield, nebula tint | Meteor streak |
| 4 | Void | 90 | Pure black, faint pulsing purple galaxies | Pulsing nebulae |

Each biome has 3 parallax layers (far 0.1×, mid 0.3×, near 0.6× camera speed).

### Biome transition
On crossing threshold:
- 1.2s lerp between old and new background colors + parallax layers.
- Banner slides in from top ("CLOUDS REACHED" style).
- 1s camera freeze for emphasis, then resume.
- Play biome-unlock chord (I-IV-V in biome's tonal center).

### Camera
- Smooth lerp toward top of stack, keeping top ~60% into viewport.
- Slow zoom-out from 1.0 → 0.75 over first 50 floors.
- Milestone pull-back at floors 50 and 100: scale to 0.3 for 1.5s revealing full tower, ease back.

### Particle system
Single ring buffer, max 200 active. Types:
- **Dust** — on normal land, 6–8 brown particles, short life, gravity
- **Gold sparkle** — on perfect, 12 particles, upward burst, slow fade
- **Debris** — chopped sliver (1 rectangle matching the chopped width/position, tinted to block color, rotating with gravity, long life, falls off-screen)
- **Combo trail** — at combo ≥ 3, faint glowing copies of active block fading behind it
- **Aurora/biome ambient** — slow large particles specific to current biome
- **Danger flash** — when active block width < 20% of original, pulsing red stroke on the block itself (not a particle — drawn directly)

### Landing shadow
Dashed 2px rectangle drawn at `(activeBlock.x, topFloor.y - 2)` with current active width, color = block color at 30% alpha. Rendered before active block each frame. Toggleable via Hints setting.

### Color progression collision with accent-red
The per-block rainbow gradient is independent of the UI accent. UI chrome (tab, borders, HUD highlights, new-high-score badge, submit button) uses `accent-red`. The crimson UI provides the "home" for the game; the tower itself can cycle through the full spectrum.

## 6. Audio system

Web Audio API synthesis (no asset files). AudioContext created lazily on first user gesture.

Master gain node → destination; linked to `tower_stacker_sound` localStorage.

| Event | Waveform | Frequency | Envelope | Notes |
|---|---|---|---|---|
| Normal land | triangle | C3 (131Hz) | 10ms attack, 150ms decay | Low-pass @ 800Hz |
| Perfect land | sine | `C4 * 2^(combo/12)` | 5ms attack, 250ms decay | Capped at +24 semitones |
| Combo reset | noise burst | — | 80ms | Only on miss after combo ≥ 3 |
| Miss | sawtooth | A2 → E2 (descending glide) | 300ms | Detuned, rough |
| Golden block | two-tone bell | C5 + G5 | 500ms | Two oscillators, slight offset |
| Biome unlock | chord I-IV-V | biome-specific tonal center | 800ms | |
| UI click | square | A4 (440Hz) | 40ms | Menus and pause |

Mute toggle persists across sessions.

## 7. Leaderboard API changes

### Current state
`src/app/api/leaderboard/route.ts` is a single shared JSON file store used exclusively by Space Shooter. No game discriminator.

### Backward-compatible changes

**`Entry` interface** gains optional `game?: string` field. Legacy entries (without the field) are treated as `game: "space-shooter"` for filtering purposes.

**`GET /api/leaderboard`**
- No `game` query param → returns Space Shooter entries only (default, preserves current behavior).
- `?game=tower-stacker` → returns tower-stacker entries only.
- `?game=<slug>` → returns entries matching that slug.

**`POST /api/leaderboard`**
- Accepts optional `game` field in body.
- Server sanitizes: lowercased, alphanumeric + dash, max length 30.
- Defaults to `"space-shooter"` if omitted (legacy safety).

**Per-game entry cap**
Shift from `MAX_ENTRIES = 100` globally to 100 per game. Sort and trim is filtered by game before writing.

### Tower-stacker payload mapping

| Leaderboard field | Tower-stacker meaning |
|---|---|
| `name` | Player-entered, 12 char max |
| `score` | Total points (for Speedrun: `1_000_000 - durationMs` so ascending-by-time sorts naturally via the existing descending-by-score sort) |
| `level` | Floor count reached |
| `seconds` | Run duration in seconds |
| `kills` | Perfects count (reuses existing validation) |
| `distance` | Golden blocks landed |
| `region` | Mode: `"classic"` / `"sudden"` / `"speedrun"` |
| `game` | `"tower-stacker"` for normal runs, `"tower-stacker-daily-YYYY-MM-DD"` for daily runs, `"tower-stacker-seeded"` for shared-seed runs |

### Modes and leaderboard
Single combined main-leaderboard for tower-stacker; mode tag embedded into `region` field. UI can filter by mode client-side after fetch. Daily and seeded runs are segregated via separate `game` slugs to preserve fairness. For Speedrun's ascending-time sort: the `score` field is set to `1_000_000 - durationMs` so the server's existing descending-score sort naturally produces the right order; UI formats as time.

## 8. HUD & UI chrome

### In-game HUD (React-rendered, overlaid on canvas)
- **Top-left:** Score (large, counter animates on increment). Below it: combo indicator (appears at combo ≥ 2, pulses at ≥ 5).
- **Top-right:** HP hearts (SVG, Classic mode only), sound toggle, pause button, fullscreen button.
- **Bottom-center:** Biome name (subtle, always visible).
- **Biome transition banner:** slides in from top ("CLOUDS REACHED"), auto-dismisses after 2s.

### Start screen (state === 'menu')
- Centered card, title "Tower Stacker" with red accent glow.
- Mode toggle: "Classic (3 HP)" / "Sudden Death" / "Speedrun".
- Theme picker (unlocked themes shown as clickable swatches; locked shown greyed with unlock hint).
- Hints toggle.
- Big red "START" button.
- Side panel: "Today's Challenge" card (Daily seeded run button + countdown to reset).
- Below: "High Score: XXXX" and "Speedrun Best: XX.XXs".
- Achievements badge strip (icons for unlocked; greyed for locked — tap to see criterion).
- Collapsible "How to Play" panel.

### Pause screen (state === 'paused')
- Dim overlay; "Paused" text; Resume / Restart / Quit buttons.

### Game-over screen (state === 'game-over')
After cinematic pull-back AND post-game replay fast-forward (§10.H) complete, summary card slides in with:
- Final score (or time, for Speedrun)
- Floors reached
- Highest combo
- Perfects count
- Golden blocks landed
- Biomes visited (list)
- Achievement unlock notifications (for anything earned this run)
- New-high-score badge (if applicable)
- "Ghost passed" badge (if applicable)
- Leaderboard rank (if top 25 for current mode)
- Buttons: "Share Tower" (generates & shares/downloads PNG card, §10.I), "Play Again", "Submit to Leaderboard" (opens name-input modal if qualifying)

### Shareable tower PNG
See §10.I — the Share Tower button generates a branded 1200×630 social card (not a plain screenshot). Uses `navigator.share()` on mobile where available, falls back to download.

### Mobile responsive
- Canvas auto-resizes to container width, maintains aspect ratio.
- HUD tap targets enlarged at ≤ 640px via Tailwind responsive classes.
- `touch-action: manipulation` on canvas element.
- `navigator.vibrate(8)` on perfect; `navigator.vibrate([40, 30, 40])` on miss (feature-detected; no-op on unsupported devices).

## 9. Fun extras (all included)

1. Landing shadow indicator (dashed projection). Toggleable.
2. Pulsing danger state when width < 20%.
3. End-of-run cinematic (camera pull-back showing full tower, then summary slide-in).
4. Rare golden block (every ~30 floors, 33% chance of appearance; 2× points + special sound + sparkle shower).
5. Biome ambient events (birds / plane / aurora / meteor / pulsing nebulae).
6. Haptic feedback on mobile.
7. Milestone camera pull-back at floors 50 and 100.
8. Shareable tower PNG export.

## 10. Engagement & viral systems

These features transform a one-time play into sharable, habit-forming engagement.

### A. Daily seeded run
- **Seed source:** `YYYY-MM-DD` (UTC) hashed to 32-bit seed via FNV-1a.
- **What the seed controls:** active block spawn side, starting speed offset, golden block positions (which floor numbers roll golden), biome palette hue rotation for that day.
- **Menu UI:** "Today's Challenge" card showing today's date, countdown to next reset (UTC midnight), a "Daily" button that launches with the day's seed.
- **Leaderboard:** separate `GET /api/leaderboard?game=tower-stacker-daily-YYYY-MM-DD` entries. Resets visually each day (old entries still stored, just filtered by today's slug).
- **Visual cue:** a small gold "DAILY" tag in HUD during daily runs.

### B. Ghost run (personal best)
- **Recording:** during every run, append `{ floorIndex, x, width, timeMs }` to an in-memory array. On game over, if the run beat localStorage `highscore`, persist the array as `tower_stacker_ghost` (JSON).
- **Playback:** on run start (Classic/Sudden only — not Speedrun), spawn a translucent "ghost" column to the side of the main playfield (~30% alpha). Ghost floors appear at their recorded `timeMs` offsets from run start.
- **Passing moment:** when active floor count exceeds ghost floor count, play a three-note fanfare + camera brief flash + banner ("GHOST PASSED").

### C. Named achievements
Tracked in `localStorage.tower_stacker_achievements` as a `Set<string>`. Mid-run toast notification on unlock (slide-in top-right, 3s).

| ID | Name | Criterion |
|---|---|---|
| `first_tower` | First Tower | Complete any run |
| `architect` | The Architect | Reach floor 50 |
| `atlas` | Atlas | Reach floor 100 |
| `perfectionist` | Perfectionist | 10 consecutive perfect stacks in one run |
| `virtuoso` | Virtuoso | 20 consecutive perfect stacks in one run |
| `daily_devotee` | Daily Devotee | Play daily runs on 7 different dates |
| `golden_touch` | Golden Touch | Land 5 golden blocks in one run |
| `void_walker` | Void Walker | Reach the Void biome (floor 90) |
| `speed_demon` | Speed Demon | Complete a speedrun (floor 50) in < 60s |
| `ghost_buster` | Ghost Buster | Pass your ghost run |

### D. Unlockable block themes
Tracked in `localStorage.tower_stacker_themes` as an array of unlocked theme IDs. User selects active theme in menu.

| ID | Unlock | Rendering |
|---|---|---|
| `classic` | Default | Rainbow hue progression (spec §5) |
| `neon` | 3000 score in one run | Bright saturated colors with 8px outer glow (`shadowBlur`) |
| `gold` | 8000 score in one run | Warm palette (gold→copper→bronze gradient), metallic specular highlight |
| `crystal` | 15000 score in one run | Translucent fill (40% alpha), bright edge stroke |
| `pixel` | 50 total runs completed (counter in localStorage) | 8-bit chunky rendering, 4px grid snap, no interpolation |

### E. Milestone visual spectacles
At specific floor counts, a brief one-shot visual event fires (independent of biome transitions):
- **Floor 40:** lightning fork splits the sky (2 zig-zag strokes, fade over 600ms). Thunder sound (low noise burst).
- **Floor 60:** whole tower pulses white light for 800ms.
- **Floor 80:** screen "shatters" — brief radial crack overlay (6 lines from center), fades over 1s.

### F. Near-miss slo-mo
- Trigger: on normal stack drop where `overlapW > 0` and `chopWidth / activeBlock.width > 0.88` (i.e., near-miss — 88%+ overhang).
- Effect: scale `dt` by 0.4× for 300ms after the drop. Camera zoom-in by 5% during slo-mo, ease back after.
- Feels like: the block teeters on a sliver, debris drifts down in slow motion, dramatic.

### G. Extreme-combo crescendo
Independent of landing-feedback (which already scales per combo). Global visual state when combo ≥ 10:
- **10–19:** rainbow aura around active block (additive glow, hue-rotates).
- **20–29:** lightning trails behind each new landed block (fading jagged lines).
- **30+:** aurora wash across entire background (animated gradient overlay, 20% alpha).

Effects fade within 400ms when combo breaks.

### H. Post-game replay fast-forward
- Block placements were already recorded for ghost system (§B).
- On game over, before summary card: 3s fast-forward animation showing entire tower building up from base to top, camera auto-panning. Each floor appears at `recordedTime * (3000 / runDurationMs)`.
- Replay uses active-run floor data (no ghost), rendered at current camera height (starts zoomed out showing whole tower).

### I. Share card PNG auto-generator
- **Trigger:** "Share Tower" button on game-over summary (replaces the prior "Save Tower" button — merged).
- **Rendering:** offscreen canvas (1200×630, OG-image aspect ratio for social previews).
- **Layout:**
  - Top: dark gradient background matching final biome
  - Center-left: rendered tower silhouette (full tower, scaled to fit)
  - Center-right: score (huge), floor count, highest combo, achievement badges earned this run (as icons)
  - Bottom: "Tower Stacker" logo + "amin.dev/games" watermark + date/seed tag
- **Output:** PNG blob → native `navigator.share({ files: [...] })` if available (mobile), else `a.download` link.

### J. Seed-share URL
- On share card, include "Seed: ABC123" text and a short URL: `amin.dev/games?tower-seed=ABC123`.
- `src/app/games/page.tsx` reads the URL param and forwards it to the game component.
- On game start with a supplied seed: menu shows "Playing shared seed: ABC123", leaderboard submission uses `game=tower-stacker-seeded` (keeps shared-seed runs out of the main leaderboard to preserve fairness).
- Seeds are 6-char base32 alphanumeric, converted via FNV-1a to a 32-bit PRNG seed.

### K. Speedrun mode
- Third mode option alongside Classic and Sudden Death.
- Objective: reach floor 50 in minimum time. No HP (one miss = run over, time doesn't count).
- HUD shows large running timer (MM:SS.ms) instead of score.
- Leaderboard tag: `region="speedrun"`. Sorted ascending by `seconds`.
- Banner on floor 50 reach: "FINISHED — X.XX s".

## 11. Testing & verification

Before claiming done:

1. `npx tsc --noEmit` passes.
2. `npm run build` succeeds.
3. `npm run lint` passes.
4. Manual browser verification via Chrome DevTools MCP — cover:
   - Game selector tab renders with red accent, loads game on click
   - Desktop inputs: click, Space, Enter, ArrowDown all trigger drop
   - Mobile viewport (375×812): tap drops, HUD readable, canvas fits
   - Score increments correctly; combo appears at ≥ 2
   - HP decrements on miss in Classic; Sudden Death ends on first miss
   - Block color shifts per floor
   - Biome transition fires at floor 15, banner + background change
   - Game-over cinematic + summary card
   - Leaderboard POST succeeds; GET filters correctly
   - `GET /api/leaderboard` (no param) still returns Space Shooter entries unchanged (regression check)
   - Pause / resume
   - Sound toggle persists after reload
   - Landing shadow toggles with Hints setting
   - "Save Tower" PNG downloads correctly
5. Edge cases:
   - Tab away → return: no physics explosion
   - Rapid-fire drops: debounced
   - Window resize mid-game: canvas rescales, stack positions adjust
   - First run (empty localStorage): defaults apply
   - Network failure on leaderboard submit: graceful error, no crash

## 12. Workflow

- Work directly on `main` branch (user preference, no worktree).
- Commit in logical chunks (scaffold, mechanics, visuals, audio, UI, leaderboard integration).
- No feature flags; ship-as-you-build.

## 13. Open questions

None. All clarifications resolved during brainstorming.

## 14. Scope summary

Total feature set:
- Core mechanic (sliding, dropping, overlap, debris, perfect detection, combo)
- 3 game modes (Classic HP, Sudden Death, Speedrun)
- Full HUD + menu + pause + game-over screens
- 5 altitude-based biomes with parallax, transitions, ambient events
- Per-block color progression with 5 unlockable themes
- Web Audio synthesis for all sounds with pitch-combo system
- Particle system (dust, sparkle, debris, combo trail, aurora, danger)
- Dynamic camera (lerp, zoom-out progression, milestone pull-back)
- Juice: landing shadow, danger pulse, near-miss slo-mo, extreme-combo crescendo, golden blocks, milestone spectacles
- Post-game replay fast-forward
- 10 named achievements
- Daily seeded runs with own leaderboard
- Shared seed URLs
- Ghost run (personal best playback)
- Speedrun mode with timer
- Share card PNG generator with social-share integration
- Haptic feedback on mobile
- Leaderboard API backward-compatible extension
- Mobile responsive

Estimated component size: ~2200–2600 lines in `tower-stacker.tsx`. Compare: `space-shooter.tsx` at 2924 lines.
