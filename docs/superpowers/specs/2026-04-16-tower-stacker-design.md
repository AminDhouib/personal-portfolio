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
  - `mode` — "classic" | "sudden"
  - `hints` — boolean (landing shadow)
  - `player_name` — last used leaderboard name
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
Both persist independently — the leaderboard shows a combined list but the entry record includes mode (stored as part of score? → see §7 for resolution).

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
| `score` | Total points |
| `level` | Floor count reached |
| `seconds` | Run duration |
| `kills` | Perfects count (reuses existing validation) |
| `distance` | — (unused) |
| `region` | — (unused) |
| `game` | `"tower-stacker"` |

### Modes and leaderboard
Single combined leaderboard for tower-stacker; mode tag embedded into `region` field (set to `"classic"` or `"sudden"`). GET filters at render time if a mode toggle is shown. Acceptable compromise to avoid multi-field keys in a 100-line JSON API.

## 8. HUD & UI chrome

### In-game HUD (React-rendered, overlaid on canvas)
- **Top-left:** Score (large, counter animates on increment). Below it: combo indicator (appears at combo ≥ 2, pulses at ≥ 5).
- **Top-right:** HP hearts (SVG, Classic mode only), sound toggle, pause button, fullscreen button.
- **Bottom-center:** Biome name (subtle, always visible).
- **Biome transition banner:** slides in from top ("CLOUDS REACHED"), auto-dismisses after 2s.

### Start screen (state === 'menu')
- Centered card, title "Tower Stacker" with red accent glow.
- Mode toggle: "Classic (3 HP)" / "Sudden Death".
- Hints toggle.
- Big red "START" button.
- "High Score: XXXX" below.
- Collapsible "How to Play" panel.

### Pause screen (state === 'paused')
- Dim overlay; "Paused" text; Resume / Restart / Quit buttons.

### Game-over screen (state === 'game-over')
After cinematic pull-back completes, summary card slides in with:
- Final score
- Floors reached
- Highest combo
- Perfects count
- Biomes visited (list)
- New-high-score badge (if applicable)
- Leaderboard rank (if top 25)
- Buttons: "Save Tower" (PNG export), "Play Again", "Submit to Leaderboard" (opens name-input modal if qualifying)

### Shareable tower PNG
`canvas.toDataURL('image/png')` rendered to a hidden offscreen canvas containing the full tower (not viewport-cropped). Downloaded as `tower-stacker-{score}.png`.

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

## 10. Testing & verification

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

## 11. Workflow

- Work directly on `main` branch (user preference, no worktree).
- Commit in logical chunks (scaffold, mechanics, visuals, audio, UI, leaderboard integration).
- No feature flags; ship-as-you-build.

## 12. Open questions

None. All clarifications resolved during brainstorming.
