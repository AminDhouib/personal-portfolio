# Password Game 2 -- Design Spec

## Overview

A spiritual successor to Neal Fun's Password Game. The player types a password while progressively revealed rules impose increasingly absurd constraints. What makes this a sequel, not a clone:

1. **Randomized rule pools** -- each playthrough draws ~15 rules from a pool of 30-40, with randomized parameters within each rule
2. **Seeded PRNG** -- share a seed to replay the exact same run; enables competitive speedrunning
3. **Progressive UI destruction** -- the game's interface visually deteriorates as chaos escalates
4. **Interactive chaos** -- environmental hazards, adversarial AI, and mini-game interrupts that physically attack the player's password
5. **Daily challenge** -- one shared seed per day for global competition

## Core Loop

1. Player starts a run (random seed or entered seed)
2. Password input appears, clean UI
3. Rules reveal one at a time as previous rules are satisfied
4. Rules escalate through 5 tiers of increasing chaos
5. Environmental hazards and adversarial mechanics activate in later tiers
6. UI progressively cracks, glitches, and falls apart
7. On completion: shareable result card + leaderboard submission

## Rule System

### Structure

- **Total pool:** 30-40 rules
- **Per run:** ~15 rules drawn from the pool
- **Tiers:** 5 tiers, each draws from its own sub-pool
- **Parameters:** Each rule has randomized parameters (e.g., "digits sum to X" where X is random 20-30)
- **Seed:** A numeric seed determines which rules appear, their parameters, and the order within each tier
- **Extensibility:** Adding new rules = adding to the pool. No structural changes needed.

### Tier 1 -- Warm-up with a Wink (rules 1-4)

Draws 4 rules from ~10 options. Classic password constraints with randomized params, plus one "foreshadowing moment" drawn randomly per run.

**Rule pool:**
- Password must be at least N characters (N = 6-9, random)
- Must include N digits (N = 1-3)
- Must include an uppercase letter
- Must include a special character from a random subset (e.g., only @#$ or only !%^)
- Digits must add up to N (N = 15-30)
- Must include a color name (from pool: red, blue, green, indigo, violet, coral, etc.)
- Must include a day of the week
- Must include a planet name
- Must contain a palindrome of at least 3 characters
- Password must contain N words (N = 2-4, space-separated)

**Foreshadowing moments (one per run, triggered around rule 3-4):**
- **The Nudge:** Input field subtly shifts a few pixels away from cursor on click. Once. Then normal.
- **The Gaslighter:** One typed character flickers to a different character for a single frame, then reverts.
- **The Peek:** A hairline crack appears in the input field corner. An eye peers through for 1 second. Crack seals.
- **The Rumble:** Entire page does a single micro-shake. Rules flicker. Faint rumble sound (if audio on). Then calm.

### Tier 2 -- Knowledge Checks (rules 5-8)

Draws 4 rules from ~10 options. Tests general knowledge and pattern recognition.

**Rule pool:**
- Identify a country from its flag image (bundled SVG flags, pool of ~50 countries)
- Include a periodic table element whose atomic number is within a random range
- Include a two-letter element symbol where the element is in a specific group (noble gas, alkali metal, etc.)
- Name the programming language from a displayed code snippet (pool of ~10 languages with ~3 snippets each)
- Include a word in a randomly selected foreign language (pool: Spanish, French, German, Japanese romanji, Italian -- with hint shown)
- Spell out the NATO phonetic alphabet word for a random letter (e.g., "Foxtrot" for F)
- Solve a displayed math equation and include the answer (basic arithmetic, random operands)
- Include a Roman numeral whose value falls in a random range (e.g., between 10 and 50)
- Password must include the name of a displayed hex color (show color swatch, player types the color name -- from a curated pool of recognizable colors)
- Include the capital city of a randomly selected country

### Tier 3 -- Formatting Chaos (rules 9-11)

Draws 3 rules from ~8 options. The password input becomes a rich text editor. Rules now control formatting.

**Rule pool:**
- Every Nth character must be uppercase (N = 2-4, random)
- All vowels must be a specific color (random color displayed as swatch)
- Password must contain exactly N words (N = 3-6)
- Characters must alternate between two specific font families
- A random letter must appear in superscript every time it occurs
- Bold/italic ratio: must contain N times as many italic chars as bold (N = 1-3)
- At least N% of password must be in a symbol/wingdings-style font (N = 15-40)
- The font size of each digit must equal its value times a random multiplier

### Tier 4 -- Environmental Hazards (rules 12-13)

Draws 2 rules from ~8 options. The password is now under attack from environmental forces.

**Rule pool:**
- **Gravity:** Letters slowly drift downward in the input. Player must "catch" them by clicking or they fall off and disappear.
- **Rain:** Water drops fall on the input. Characters hit by drops smudge to "?" -- player must retype them.
- **Earthquake:** Every N seconds (N = 15-25), letters shuffle their positions within the password.
- **Black Hole:** A vortex appears at a random position in the input. Adjacent characters slowly get pulled toward it and consumed.
- **Freeze:** Random sections of the password become frozen (uneditable) for N seconds (N = 8-15). Frozen text has ice crystal visual effect.
- **Fire:** Characters catch fire and burn away. Player must "extinguish" by clicking the burning characters. Spreads if ignored.
- **Vines:** Plant vines slowly grow over characters, obscuring them. Player must "trim" by clicking.
- **Glitch Storm:** Random characters visually corrupt (display as wrong chars) for short bursts. The actual value is unchanged but player can't see what they have.

### Tier 5 -- Adversarial Chaos (rules 14-15)

Draws 2 rules from ~6 options. The game itself is now the enemy.

**Rule pool:**
- **Typo Gremlin:** A small animated gremlin character runs across the input, randomly swapping characters every few seconds. Player can click the gremlin to stun it briefly.
- **Autocorrect:** The game "helpfully" replaces words with wrong corrections (e.g., "hello" -> "jello"). Player must fix them.
- **The Censor:** Random sections get redacted with black bars. Player must retype the hidden content.
- **Mirror Mode:** Input displays reversed. Player types normally but sees everything backwards.
- **Mini-game Interrupt:** Play freezes. Player must complete a quick challenge (sliding puzzle / catch falling letters / memory sequence / Simon Says pattern). Fail = a random rule's parameters get harder.
- **Shrinking Field:** The password input slowly narrows in width. Text wraps and becomes harder to read/manage.

## Progressive UI Destruction

The game's visual state degrades as the player progresses through tiers.

### Tier 1-2: Pristine
- Clean container with smooth rounded borders
- Crisp typography
- Smooth animations on rule reveal
- Subtle gradient background

### Tier 3: Hairline Fractures
- Fine cracks appear in the container border (SVG/CSS overlay)
- Slight screen shake on each new rule reveal (150ms, 2px amplitude)
- Background hue shifts subtly (barely perceptible)
- Rule cards have a faint shadow jitter

### Tier 4: Structural Damage
- Cracks widen. Multiple crack lines across the container.
- Background color desaturates and shifts
- Elements drift slightly from grid alignment (random 1-5px offsets)
- Rule cards start overlapping each other slightly
- Occasional full-screen flicker (opacity 0.95 for 1 frame)
- Ambient particle effects (dust, sparks)

### Tier 5: Total Chaos
- Heavy glitch effects on all text (CSS clip-path + color channel split)
- Screen flickers between normal and inverted colors
- The submit button physically dodges the cursor (moves away on hover)
- Rule cards are visibly damaged -- torn edges, burnt corners
- Background has active noise/static
- Container border is shattered -- pieces floating

## Shareable Result Card

Canvas-rendered image generated on game completion.

**Contents:**
- Game title "Password Game 2"
- Seed number
- Completion time
- Number of rules conquered
- Icons representing each rule faced (small symbolic icons in a row)
- Difficulty rating (calculated from rule combination)
- A procedurally generated title based on performance (e.g., "The Unbreakable", "Barely Survived", "Chaos Whisperer")
- Visual style matches the tier the player reached -- pristine card for early exit, glitched/cracked card for full completion
- QR code or short URL to play the same seed

**Actions:**
- Copy image to clipboard
- Download as PNG
- Direct share (if Web Share API available)

## Dedicated Leaderboard Page

Route: `/games/password-game/leaderboard`

**Features:**
- Global top times (all seeds)
- Filter by specific seed
- Daily challenge tab: today's seed, rankings, countdown to next
- Weekly challenge tab: curated difficult seed
- Each entry shows: rank, player name, time, seed, date, rules count
- Click any entry to play that seed

**Daily Challenge:**
- Deterministic seed derived from the date (e.g., hash of "2026-04-15")
- Same seed for all players worldwide
- Resets at midnight UTC
- Cannot submit a daily challenge score more than once per day

## Assets Required

### Country Flags (SVG)
- **Source:** Open-source flag icon packs (e.g., `flag-icons` npm package or `lipis/flag-icons` GitHub repo)
- **Scope:** ~50 countries -- mix of easy (USA, Japan, Canada) and tricky (Romania vs Chad, Monaco vs Indonesia)
- **Format:** SVG files bundled in `public/assets/password-game/flags/`
- **Data:** JSON mapping of country code -> country name

### Periodic Table Data (JSON)
- **Source:** Open-source periodic table datasets (e.g., Bowserinator/Periodic-Table-JSON on GitHub)
- **Scope:** All 118 elements -- symbol, name, atomic number, group
- **Format:** Single JSON file `src/data/periodic-table.json`

### Code Snippets (JSON)
- **Source:** Hand-curated. Real, recognizable idioms from each language.
- **Languages:** Python, JavaScript, Rust, Go, C, Java, Ruby, Swift, Kotlin, TypeScript
- **Per language:** 3 snippets, each 3-6 lines. Distinctive syntax. No comments revealing the language.
- **Format:** JSON file `src/data/code-snippets.json` with `{ language, snippet }` entries

### Sound Effects
- **Source:** Free SFX libraries (freesound.org, mixkit.co -- check licenses)
- **Sounds needed:**
  - Rumble (low, short, ~0.5s)
  - Crack (glass/ceramic, sharp, ~0.3s)
  - Glitch buzz (digital corruption, ~0.4s)
  - Fire crackle (ambient loop, ~3s)
  - Rain/water drops (ambient loop, ~3s)
  - Gremlin chittering (playful, short, ~0.5s)
  - Success chime (completion)
  - Earthquake rumble (deeper, ~1s)
- **Format:** MP3 or OGG, small file size (<50KB each), stored in `public/assets/password-game/sfx/`
- **Note:** Audio is opt-in. Muted by default with a toggle.

### Visual Effect Assets
- **Cracks:** CSS/SVG generated. No raster images needed.
- **Fire particles:** CSS animation (no sprite sheets). Orange/red gradient particles with upward drift.
- **Rain drops:** CSS animation. Blue translucent circles falling.
- **Ice crystals:** CSS frost effect (backdrop-filter + SVG overlay).
- **Vines:** SVG paths that animate along bezier curves.
- **Glitch effect:** Pure CSS (clip-path + rgb channel offset).
- **Black hole:** CSS radial gradient + rotation animation.
- **Dust/sparks particles:** Lightweight canvas-based particle system or CSS.

### Font Files
- **Symbol font:** A wingdings-equivalent web font or subset (e.g., Webdings from Google Fonts, or bundle a small custom symbol font)
- **Format:** WOFF2, stored in `public/fonts/`

### Foreign Words Data (JSON)
- **Source:** Hand-curated list of common words with translations
- **Languages:** Spanish, French, German, Italian, Japanese (romanji)
- **Per language:** ~20 words with English meaning as hint
- **Format:** JSON file `src/data/foreign-words.json`

### NATO Alphabet Data
- Hardcoded constant. 26 entries. No external source needed.

### Color Names Data (JSON)
- **Source:** CSS named colors subset (~30 recognizable colors)
- **Format:** JSON with `{ hex, name }` entries in `src/data/color-names.json`

### Country Capitals Data (JSON)
- **Source:** Open dataset
- **Scope:** ~50 countries matching the flag set
- **Format:** JSON with `{ country, capital }` in `src/data/countries.json`

## Technical Architecture

### Routing

The existing games page (`/games`) uses a single-page tab layout for small mini-games. Password Game 2 is a full-scale game and gets its own dedicated route. A card on the `/games` page links to it.

- `/games/password-game` -- the game itself (own page, not a tab)
- `/games/password-game/leaderboard` -- dedicated leaderboard page
- `/games` -- existing tab view gets a card that links to `/games/password-game`

### File Structure
```
src/
  components/game/
    password-game/
      password-game.tsx        # Main game component (entry point)
      rules/                   # Individual rule implementations
        tier1.ts
        tier2.ts
        tier3.ts
        tier4.ts
        tier5.ts
      engine.ts                # Rule engine, seed logic, state machine
      effects.ts               # UI destruction effects, visual hazards
      rich-input.tsx           # Rich text password input (contentEditable)
      result-card.tsx          # Canvas-based shareable card
      mini-games.tsx           # Mini-game interrupt components
      foreshadowing.ts         # Tier 1 surprise moments
      sound.ts                 # Audio manager (lazy-load, opt-in)
      types.ts                 # TypeScript types for rules, state, config
  data/
    periodic-table.json
    code-snippets.json
    foreign-words.json
    color-names.json
    countries.json             # flags, capitals, names
  app/
    games/
      password-game/
        page.tsx               # Game page (dedicated route)
        leaderboard/
          page.tsx             # Dedicated leaderboard page
    api/password-game/
      route.ts                 # Leaderboard API endpoints
public/
  assets/password-game/
    flags/                     # SVG flag files
    sfx/                       # Sound effect files
  fonts/
    symbols.woff2              # Symbol/wingdings font
```

### Key Implementation Details

**Seeded PRNG:**
- Use a simple, deterministic PRNG (e.g., mulberry32 or xoshiro128)
- Seed displayed in UI during play, copyable
- URL param `?seed=12345` to start with a specific seed
- Daily seed = hash of ISO date string

**Rich Text Input:**
- `contentEditable` div styled as input
- Tracks formatting per-character (bold, italic, font, size, color)
- Custom paste handler (strip formatting on paste)
- Selection and cursor management for hazard interactions

**Rule Engine:**
- Each rule is an object: `{ id, tier, name, description, validate(password, state), params, onActivate?, onTick? }`
- `validate` returns `{ passed: boolean, message?: string }`
- `onActivate` runs once when rule appears (e.g., start a timer)
- `onTick` runs every frame/second for real-time rules (hazards, timers)
- Engine manages rule queue, validation loop, tier progression

**Effect System:**
- CSS custom properties control destruction level (`--chaos-level: 0-5`)
- Effects are CSS classes applied to the game container
- Particle effects use a lightweight canvas overlay
- All effects are performant -- no layout thrashing, GPU-composited where possible

**Leaderboard API:**
- POST `/api/password-game` -- submit score (seed, time, rulesCompleted, playerName)
- GET `/api/password-game?type=global` -- top 100 global scores
- GET `/api/password-game?seed=12345` -- scores for specific seed
- GET `/api/password-game?type=daily` -- today's daily challenge scores
- Rate limited. Basic anti-cheat: minimum possible time threshold, server-validated seed.

## Scope & Phasing

### Phase 1 (MVP)
- Rule engine with seed system
- 25 rules across all 5 tiers
- Basic UI destruction (3 levels)
- 4 foreshadowing moments
- Result card generation
- Basic leaderboard (global + seed filter)

### Phase 2 (Polish)
- Remaining 5-15 rules to reach full pool
- Sound effects
- Daily/weekly challenges
- Advanced UI destruction effects
- Mini-game interrupts
- Share card improvements

### Phase 3 (Growth)
- Community seed sharing
- Replay/spectate mode
- New rule drops (announced on social)
- Tournament mode (bracket of seeds)

## Success Criteria
- Player completes a full run and shares the result card
- Two runs with different seeds feel meaningfully different
- Streamers cannot predict what comes next even after multiple plays
- Leaderboard has active daily challenge participation
- The game is the most-played game on the portfolio
