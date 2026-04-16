# Super Voltorb Flip — Design Spec

**Date:** 2026-04-15
**Status:** Draft — pending user review
**Author:** Amin Dhouib (collaborating with Claude)

---

## 1. Overview

Add a new game, **Super Voltorb Flip**, to the portfolio's `/games` page. The game is a faithful recreation of the Voltorb Flip minigame from Pokemon HeartGold/SoulSilver, enhanced with modern mechanics that address the original game's well-documented community criticisms (unavoidable 50/50 guesses, catastrophic level drops, brutal grind, no risk mitigation) while preserving the core deduction puzzle that made it beloved.

The game ships in phased milestones. **Phase 1** (this spec) is a shippable MVP that delivers the faithful core plus the highest-impact "Super" improvements. Phases 2–4 are documented as planned scope for subsequent iterations.

### 1.1 Why This Game Fits The Portfolio

- Demonstrates non-trivial game state management in React
- Shows frame-accurate animation work (sprite sequences, CSS 3D, Web Audio API synthesis)
- Creates long-term engagement (unlockable themes, meta-progression) beyond typical "one-shot" portfolio demos
- Leverages the existing `/api/leaderboard` infrastructure
- Fits thematically alongside the existing games (Geometric Flow, Typing Speed, Orbital Dodge, Code Puzzle)

### 1.2 Design Principles

1. **Purist mode always exists.** Classic Mode ships identical to the HGSS original. Super features are additive and opt-in.
2. **No new luck.** Every "Super" mechanic either removes randomness (reveal, peek, scan) or trades coins for deterministic protection (shield). Random events are cosmetic/bonus only — they never add downside risk.
3. **Partial progress is rewarded.** The #1 community complaint was losing everything from one unlucky flip. Softer drops, cash-out, and streak bonuses all address this.
4. **Faithful audiovisual homage without IP infringement.** Sprite assets from the samualtnorman open-source recreation (GPL-3.0). Music via CC0 chiptune libraries plus Web Audio API synthesis for stingers. No Nintendo-copyrighted audio ships in the portfolio.

---

## 2. Goals and Non-Goals

### 2.1 Goals (Phase 1)

- Faithful HGSS Voltorb Flip core: 5×5 grid, 8 levels × 5 configs, multiplicative scoring, row/column hints, Voltorb explosion, memo system with copy mode, frame-accurate sprite animations.
- **Classic Mode** toggle that disables every Super feature for purists.
- **Super Mode** (default) with three highest-impact upgrades: Shield, Voltorb Reveal, Cash Out (coin-powered abilities).
- **Softer level drops** based on tiles successfully flipped before hitting a Voltorb.
- **Smart Auto-Memo** toggle that auto-marks logically deduced tiles.
- **Speed Mode** toggle (3× animation speed).
- **Stats Dashboard** (localStorage-persisted lifetime metrics).
- **3 starter themes** unlockable via coins: Game Corner Classic (default, free), Starter's Meadow (2,500), Twilight Route (5,000).
- **Day/Night cycle** tied to real clock time.
- **Weather Rolls** — one of 6 atmospheric overlays per round.
- **Level-tier music** — three intensity tiers (Rookie Lv 1-3, Veteran Lv 4-6, Master Lv 7-8) via CC0 chiptune loops.
- **Original stingers** synthesized with Web Audio API (win, lose, level-up, tile flip, Voltorb explosion, coin tick).
- **Leaderboard integration** — highest single-round coins submitted to existing `/api/leaderboard`.
- **Registered** in `src/app/games/games-client.tsx` as a new game entry.

### 2.2 Non-Goals (Phase 1)

Explicitly deferred to later phases:
- Additional game modes (Tower, Roguelike, Endless, Daily Puzzle, Zen)
- Remaining coin abilities (Safe Peek, Row/Column Scan, Double Down)
- Streak bonuses, checkpoints
- Tier 2/3/4 themes (Gym Badge, Legendary, Champion)
- New tile types (Chain, Unstable Voltorbs, x4 Jackpot, Power-Up)
- Board evolution (growing boards, irregular shapes, hex grids)
- Meta-progression (prestige, upgrade tree, Voltorb collection, achievements)
- Advanced random events (Lucky Egg, Amulet Coin, Radio Broadcast, Swarm Day, Bug Hunt, Training Round, Wild Reserve, Mysterious Glow, Rainbow After Rain, Shiny Encounter)
- Nature Traits flavor variants
- Undo mechanic

---

## 3. Architecture

### 3.1 File Layout

```
src/
  app/
    games/
      games-client.tsx               # MODIFY: register new game in GAMES array
  components/
    game/
      super-voltorb-flip.tsx         # NEW: main component (single-file, like existing games)
      super-voltorb-flip/            # NEW: colocated modules (keeps main file focused)
        levels.ts                    #   level configuration tables (8 levels × 5 configs)
        board.ts                     #   board generation, row/column hint computation
        auto-memo.ts                 #   Smart Auto-Memo deduction engine
        audio.ts                     #   Web Audio API synth helpers (stingers)
        theme.ts                     #   theme definitions (starter set)
        types.ts                     #   shared TS types (Board, Tile, GameState, etc.)
public/
  games/
    super-voltorb-flip/              # NEW
      sprites/                       #   all PNG assets from samualtnorman repo (GPL-3.0)
        tile/                        #     17 tile PNGs (blank, 1/2/3, voltorb, flip frames, explode frames, memo overlays, hover)
        button/                      #     17 button PNGs (play, quit, memo controls)
        number/                      #     30 number PNGs (big, bold, thin digit variants)
        frame/                       #     4 UI chrome PNGs
        dialogue/                    #     6 dialogue box PNGs
        success_0..3.png             #     4 sparkle success frames
        background.png               #     green DS background
      music/                         #   CC0 chiptune loops
        rookie.mp3                   #     Rookie tier track (Lv 1-3)
        veteran.mp3                  #     Veteran tier track (Lv 4-6)
        master.mp3                   #     Master tier track (Lv 7-8)
        theme-classic.mp3            #     Game Corner Classic BGM
        theme-meadow.mp3             #     Starter's Meadow BGM
        theme-twilight.mp3           #     Twilight Route BGM
docs/
  superpowers/
    specs/
      2026-04-15-super-voltorb-flip-design.md   # THIS FILE
```

### 3.2 Component Boundaries

- **`super-voltorb-flip.tsx`** — the top-level client component exported as `SuperVoltorbFlipGame`. Holds UI state, renders the board, info panels, scoreboard, memo panel, and modal overlays.
- **`levels.ts`** — pure data. The 8×5 config table `[twos, threes, voltorbs, maxCoins]` per level, matching HGSS exactly.
- **`board.ts`** — pure functions: `generateBoard(level, seed?)`, `computeHints(board)`, `applyDrop(level, flippedCount)`.
- **`auto-memo.ts`** — pure deduction engine: given current board state + hints + flipped tiles, returns inferred memo marks.
- **`audio.ts`** — Web Audio API helpers: `playStinger(kind)`, `playFlipSfx()`, `startBgm(track)`, `crossfadeBgm(next)`. Synthesizes stingers from short note arrays.
- **`theme.ts`** — theme registry: each theme exports `{id, name, cost, bgUrl, bgmUrl, palette, particleOverlay}`.
- **`types.ts`** — shared TypeScript types.

This split keeps each file focused and testable; the main component stays under ~600 lines.

### 3.3 Rendering Approach

- **React components** for structure (not canvas). The board is a CSS grid; each tile is a DOM element absolutely positioning its sprite layers.
- **PNG sprites** rendered via `<img>` tags with `image-rendering: pixelated` for crisp scaling.
- **Frame-by-frame animations** driven by a React state counter incremented via `requestAnimationFrame`. Each tile's current sprite is selected by frame index.
- **CSS transforms** for hover, memo-press, and slight scale bounces.
- **Responsive scaling** — the whole game area scales proportionally within its container using `transform: scale(...)` based on a base pixel design of 240×192 (original DS screen) so it always fills the portfolio card cleanly at any viewport.

---

## 4. State Model

### 4.1 Core Types (from `types.ts`)

```ts
type TileValue = 0 | 1 | 2 | 3;  // 0 = Voltorb

type Tile = {
  value: TileValue;
  flipped: boolean;
  animFrame?: number;            // non-null while animating flip or explode
  memos: [boolean, boolean, boolean, boolean];  // [voltorb, one, two, three]
};

type LineHint = { points: number; voltorbs: number };

type GameMode = 'classic' | 'super';

type GamePhase =
  | 'loading'
  | 'ready'      // board generated, awaiting first action
  | 'playing'
  | 'memo'       // memo panel open, clicks edit memos
  | 'revealing'  // animation in progress (flip or explode)
  | 'won'        // level cleared, showing coin gain, awaiting continue
  | 'lost'       // voltorb hit, showing all tiles, awaiting continue
  | 'transition' // level-up or level-down animation
  ;

type Theme = 'classic' | 'meadow' | 'twilight';

type WeatherKind = 'clear' | 'sunny' | 'rainy' | 'snow' | 'sandstorm' | 'fog';

type GameState = {
  mode: GameMode;
  phase: GamePhase;
  level: number;               // 1-8
  board: Tile[][];             // 5x5
  rowHints: LineHint[];        // length 5
  colHints: LineHint[];        // length 5
  currentCoins: number;        // this round
  totalCoins: number;          // lifetime, persisted
  maxCoins: number;            // target for this board
  activeTheme: Theme;
  unlockedThemes: Set<Theme>;
  autoMemoEnabled: boolean;
  speedMode: boolean;
  weather: WeatherKind;
  timeOfDay: 'morning' | 'day' | 'evening' | 'night';
  shieldArmed: boolean;        // Super only: spent coins to arm shield this round
  shieldedLoss: boolean;       // true when a Voltorb was absorbed by shield (vs real loss)
  voltorbRevealsUsed: number;  // 0-2 per round
  // Stats (persisted)
  stats: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    bestStreak: number;
    currentStreak: number;
    highestSingleRoundCoins: number;
    highestLevelCleared: number;
    lifetimeCoins: number;
  };
};
```

### 4.2 State Flow

1. **Mount** → load from localStorage (`totalCoins`, `unlockedThemes`, `stats`, `activeTheme`, prefs). Generate Lv 1 board. Phase = `ready`.
2. **Ready → Playing** on first tile click.
3. **Tile click** → animate flip (4 frames × tween) → update `currentCoins *= value` → check win/lose → phase `won`/`lost`/`playing`.
4. **Voltorb hit while `shieldArmed`** → shield absorbs, coins preserved but round ends. Enters `lost` phase with a `shieldedLoss: true` flag on state so the UI can swap the dirge stinger for the shield-clang stinger and route `currentCoins → totalCoins` instead of discarding them.
5. **Won** → show coin tally animation → on continue, generate new board at level + 1, phase = `transition` → `ready`.
6. **Lost** → reveal all tiles, play explosion, show dirge → on continue, apply softer drop (see §5.3), generate new board, phase = `transition` → `ready`.
7. **Super Mode coin-ability click** (Shield / Voltorb Reveal / Cash Out) → deduct cost, apply effect, audio cue.

### 4.3 Persistence

LocalStorage key: `super-voltorb-flip-save-v1`. JSON payload:
```json
{
  "totalCoins": 0,
  "unlockedThemes": ["classic"],
  "activeTheme": "classic",
  "autoMemoEnabled": false,
  "speedMode": false,
  "stats": { ... }
}
```

Versioned key (`-v1`) so future schema changes don't corrupt saves.

---

## 5. Phase 1 Feature Details

### 5.1 Faithful Core Game

**Board generation** (matches HGSS exactly):
- Level table from samualtnorman's reverse-engineered data. 8 levels × 5 configs, each `[twos, threes, voltorbs, maxCoins]`.
- Random config chosen per round. Start all 25 tiles as value 1. Randomly place the required counts of 2s, 3s, and 0s (Voltorbs).
- `maxCoins = 2^twos × 3^threes`.

**Row/column hints** computed from board:
- `points = sum of tile values in the line`
- `voltorbs = count of zero-value tiles in the line`
- Displayed as two 2-digit numbers (points) + one 1-digit number (voltorbs) in the info panel using `bold_N.png` digit sprites.

**Scoring** (multiplicative):
- First flipped non-1 tile sets `currentCoins` to its value.
- Subsequent flips multiply: `currentCoins *= tile.value`.
- Flipping a 1-tile does nothing to the score (multiplies by 1).
- Flipping a 0-tile (Voltorb) ends the round with current coins lost (Classic Mode) or preserved (Super Mode with shield).

**Win condition:** `currentCoins === maxCoins` (every 2 and 3 has been flipped).

**Memo system:**
- Toggle "Open Memo" button to enter memo mode.
- In memo mode, clicks don't flip tiles — they open a sub-UI showing 4 toggle buttons (voltorb/1/2/3). Toggled marks show as small sprite overlays on the tile.
- "Copy memo" (`s_on`/`s_off` button) applies the selected tile's memos to the next tile clicked. Matches original.

**Animations (frame counts from samualtnorman):**
- Tile flip: 3 phases × 6 frames = 18 frames (~300ms at 60fps).
- Voltorb explosion: 9 sprite frames across ~60 frames (~1000ms).
- Success sparkle: 4 frames (~250ms).
- Scoreboard count: 1 unit per frame, capped at 99,999 (uses `big_N.png` digits).

**Speed Mode multiplies animation frame advance by 3** — still plays all frames so it feels right, just faster.

### 5.2 Super Mode — Coin-Powered Abilities

All three abilities are mutually compatible and visible only in Super Mode.

**Shield** — cost scales with level: `200 × level` coins.
- Armed at start of or during a round (single-use).
- If a Voltorb is flipped while armed, the shield absorbs the hit. Round ends with `currentCoins` preserved (added to total). No level drop. Shield consumed.
- UI: button with shield sprite. Shows "ARMED" overlay when active.

**Voltorb Reveal** — cost: `500 × level` coins, max 2 per round.
- On click: randomly select one unrevealed Voltorb tile. Flip it face-up in a "revealed safe" state (greyed, not triggering explosion). Player knows where it is, can't flip it accidentally.
- UI: button with exposed-voltorb icon. Counter "2 left".

**Cash Out** — free action, available any time after the first flip.
- Ends the round immediately. `currentCoins` added to `totalCoins`. No level-up (stays on same level next round). No level drop.
- UI: persistent button. Confirmation modal: "Cash out with X coins? Your level won't change."

### 5.3 Softer Level Drops (Super Mode only)

Original HGSS uses a weighted random drop that can plunge the player to Level 1. Replacement:

```
let drop = max(0, ceil((requiredFlips - successfulFlips) / 2))
newLevel = max(1, currentLevel - drop)
```

- `requiredFlips` = number of 2s and 3s on the board.
- `successfulFlips` = non-Voltorb tiles flipped before hitting a Voltorb.
- Flipping all 2s and 3s before hitting a Voltorb = 0 drop.
- Flipping none = drops `ceil(required/2)` levels (never more than required/2).

Classic Mode keeps the original weighted-random drop.

### 5.4 Smart Auto-Memo

Toggle in settings. When on, the following deductions auto-fill memo marks:
- **Line has 0 voltorbs** → every unflipped tile in that line gets "not voltorb" marked (all non-voltorb memo values allowed).
- **Line points equal tile count** → every unflipped tile must be value 1.
- **Line points = 2n + voltorbs_count** combined with voltorb count fully accounted → specific mark conclusions.
- **Tile is last unmarked in a line with known voltorb count** → deterministic mark.

Implementation: after any state change, run `deduceAll(board, rowHints, colHints)` which returns updates. Merge into the tile `memos` arrays. Pure function, easily testable.

### 5.5 Stats Dashboard

Collapsible panel below the game. Shows:
- Games played / wins / losses / win rate
- Best win streak
- Current streak
- Highest single-round coins
- Highest level cleared
- Lifetime coins earned

All persisted in localStorage under the save key. Zero external dependencies.

### 5.6 Starter Themes (3 total)

Each theme bundles: background image, tile palette override (optional), BGM track, particle overlay (optional).

| Theme | Cost | Visual | BGM |
|---|---|---|---|
| Game Corner Classic | Free (default) | Green DS background, original pixel tiles | CC0 casino chiptune |
| Starter's Meadow | 2,500 | Soft green meadow gradient, wooden tile frame overlay | CC0 pastoral chiptune |
| Twilight Route | 5,000 | Orange/pink sunset sky, silhouette trees | CC0 warm acoustic loop |

Theme switcher UI: click a theme card → confirm unlock (if locked) → deducts coins → applies.

### 5.7 Day/Night Cycle

Based on `new Date().getHours()`:
- 6-10: morning (warm sunrise tint overlay, +5% saturation)
- 10-17: day (no tint)
- 17-20: evening (amber tint overlay)
- 20-6: night (cool blue tint overlay + subtle star particles)

Applies as a CSS filter + overlay div on top of the theme. Does not change theme itself.

### 5.8 Weather Rolls

At start of each round, roll 1 in 5:
- `clear` (default, no effect)
- `sunny` — bright warm tint overlay
- `rainy` — falling raindrop particles (CSS @keyframes)
- `snow` — snowflake particles
- `sandstorm` — dust haze overlay
- `fog` — misty filter

Purely visual. Rendered via an overlay layer on top of the board.

### 5.9 Music System (Phase 1 subset)

**Level-tier tracks** (override the theme BGM during active rounds):
- Rookie (Lv 1-3) — cheerful chiptune, ~120 BPM
- Veteran (Lv 4-6) — added percussion, ~140 BPM
- Master (Lv 7-8) — intense orchestral chiptune, ~160 BPM

**Theme BGM** — plays when in menu/idle state, from the active theme.

**Crossfade** between tracks on level transitions (1-second linear crossfade via Web Audio `GainNode`).

**Synthesized stingers** (via `audio.ts`, using `OscillatorNode` + `GainNode`):
- Win jingle — 4-note ascending arpeggio in major key
- Lose jingle — 3-note descending minor motif
- Level up — bright "ding" + quick rising chord
- Tile flip SFX — short click + soft tone
- Voltorb explosion — noise burst + descending pitch
- Coin counter tick — rapid pitch-up blip per tick
- Shield absorb — metallic "clang"
- Voltorb reveal — rising reveal chord

Volume master slider in settings. Separate music/SFX toggles.

### 5.10 Leaderboard Integration

Reuses existing `/api/leaderboard`. On Cash Out or Win, if `currentCoins > stats.highestSingleRoundCoins`, submit:
```json
{ "game": "super-voltorb-flip", "name": "...", "score": currentCoins, "level": level }
```

Show name-entry modal on new personal best. Display top 10 global scores in the stats panel.

---

## 6. Asset Sourcing

### 6.1 Pixel Sprites

All sprites from the [samualtnorman/voltorb-flip](https://github.com/samualtnorman/voltorb-flip) repo (GPL-3.0-or-later licensed). We include the LICENSE file and a NOTICE.md in `public/games/super-voltorb-flip/sprites/` crediting the source and linking to the original repo.

Total: ~70 PNGs across `tile/`, `button/`, `number/`, `frame/`, `dialogue/`, plus `background.png` and `success_0..3.png`.

Scripted download: a one-time `scripts/fetch-voltorb-assets.mjs` node script that curls each asset URL and saves to the correct public path. Run once, then commit the assets to the repo (they're small — total <500KB).

### 6.2 Music

All CC0 or CC-BY chiptune loops sourced from OpenGameArt.org and Pixabay Music. Curated list of 6 tracks for Phase 1 documented in `public/games/super-voltorb-flip/music/CREDITS.md`. Each track ~30-60 seconds looping, total audio budget ~2-4 MB.

### 6.3 Stingers

No external files. Generated entirely at runtime in `audio.ts` via Web Audio API `OscillatorNode` sequences. Each stinger is a small TypeScript array of `{freq, duration, type}` notes.

---

## 7. Integration Points

### 7.1 Games Client Registration

In `src/app/games/games-client.tsx`:

```tsx
const SuperVoltorbFlipGame = dynamic(
  () => import("@/components/game/super-voltorb-flip").then((m) => m.SuperVoltorbFlipGame),
  { ssr: false, loading: () => <GameSkeleton /> }
);

const GAMES = [
  // ... existing games ...
  {
    id: "super-voltorb-flip",
    title: "Super Voltorb Flip",
    description: "A faithful recreation of the HGSS classic with modern upgrades. Deduce, flip, multiply your coins — without hitting the Voltorb.",
    icon: Zap,  // lucide-react
    iconColor: "text-accent-amber",
    available: true,
    controls: "Click tiles to flip. Use memo mode to mark possibilities. Spend coins on Shields & Reveals.",
  },
];
```

### 7.2 Leaderboard API

No new routes needed. Existing `/api/leaderboard/route.ts` accepts `{ game, name, score, level }` — just add `super-voltorb-flip` as a valid game value if the route filters.

---

## 8. Phased Roadmap (Phase 2–4, Documented for Context)

**Phase 2 — Modes & Themes**
- Tower Mode (30 hand-crafted floors), Endless Mode (growing board difficulty)
- Remaining coin abilities: Safe Peek, Row/Column Scan, Double Down
- Win Streak Bonus + Level Checkpoints
- Gym Badge theme tier (Thunder Hall, Haunted Tower, Steel Lighthouse, Dragon's Den)
- Random events: Lucky Egg, Amulet Coin, Radio Broadcast
- Weekly Swarm Days

**Phase 3 — Long-tail Engagement Hooks**
- Roguelike Run Mode (lives + upgrade drafts)
- Daily Puzzle Mode (shared seed, leaderboard)
- New tile types: Chain, Unstable Voltorbs, x4 Jackpot, Power-Up Tiles
- Legendary theme tier (Rainbow Feather, Silver Tide, Time Ripple)
- Rare events: Wild Reserve, Mysterious Glow, Rainbow After Rain, Shiny Encounter (1/8,192)
- Achievement system with unlock rewards
- Voltorb Collection (catch every Voltorb variant)

**Phase 4 — Endgame Polish**
- Board evolution: Growing Boards (5×5 → 6×6 → 7×7), Irregular Shapes, Hex-Grid Boss Levels
- Champion theme tier (Elite Ascension, Champion's Crown, Master Mode) — achievement-gated
- Prestige System (reset for permanent multipliers)
- Upgrade Skill Tree (persistent coin-purchased buffs)
- Zen Mode (no Voltorbs, relaxation variant)
- Nature Traits (25 cosmetic personality quirks per round)
- Undo mechanic (1 free per round)

---

## 9. Risks and Open Questions

### 9.1 Risks

- **Sprite license compliance.** samualtnorman's repo is GPL-3.0, which is copyleft. Including these sprites in the portfolio does not force the portfolio code itself to be GPL — the sprites are a separate aggregate asset. We ship the LICENSE + NOTICE, and the portfolio code stays under its existing license. Worth confirming this interpretation with a quick read of the GPL-3.0 aggregation clause before merging.
- **Music crossfade performance.** On mobile Safari, AudioContext resume requires a user gesture. We handle this by starting audio on first tile click (already a gesture).
- **Bundle size.** ~500 KB sprites + ~3 MB music = not trivial. All lazy-loaded via `dynamic()` so the main games page isn't affected. Acceptable.

### 9.2 Resolved Decisions

1. **Classic/Super mode toggle — one-time choice at first load.** On first launch, the player is presented with a choice screen: "How do you want to play?" with Classic and Super described side-by-side. The selection is persisted in localStorage and cannot be changed from settings. This creates a stronger identity for each mode (the player *commits* to a style) and avoids the confusion of "wait, why are my stats different now?" A hidden reset button in the dev console is fine for rebuilds during development.
2. **Stats are unified across modes.** One `stats` object tracks both Classic and Super games. Each stat entry also records the mode so individual-mode filtering is possible later. Leaderboards are filtered by mode (separate leaderboards for Classic vs Super to keep competition fair).
3. **Cash Out on Level 8 stays on Level 8.** The player earned their way to that level; cashing out is a safe retreat, not a demotion. Keeps Level 8 as the natural "endgame" where players loop indefinitely for score.
4. **Day/Night cycle tint starts subtle.** Phase 1 ships with ~10-15% tint opacity. If user feedback calls for stronger effect, tune in a later polish pass.

---

## 10. Success Criteria

Phase 1 is shippable when:
- [ ] Classic Mode plays identically to a reference HGSS video (manually verified against gameplay footage)
- [ ] All 40 board configurations across 8 levels generate correctly with matching maxCoins
- [ ] All sprite animations (flip, explode, sparkle) render at correct frame timing
- [ ] Super Mode abilities work as specified (Shield absorbs, Voltorb Reveal exposes, Cash Out ends round safely)
- [ ] Auto-memo correctly deduces at least the three baseline cases (all-safe lines, all-ones lines, last-unmarked tile)
- [ ] Three themes load, persist selection, and cost the correct coins to unlock
- [ ] Music crossfades without clicks on level transitions
- [ ] Web Audio stingers fire correctly on every event
- [ ] Stats persist across page reloads
- [ ] Leaderboard submission works on new personal best
- [ ] Game fits cleanly in the `/games` page layout on both desktop and mobile viewports
- [ ] No console errors in production build
