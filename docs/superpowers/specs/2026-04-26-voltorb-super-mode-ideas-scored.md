# Voltorb Super Mode — Scored Idea Bank

Date: 2026-04-26
Status: Pre-spec — brainstorming output, not committed

## Scoring methodology

- **Win** (1–10): expected player + streamer + portfolio-impression value if shipped well
- **Diff** (1–10): implementation cost (1 = trivial CSS, 10 = multi-week with external infra)
- **Net** = Win − Diff (range −9 to +9). Higher = better ROI for shipping.

The Net score is a *priority signal*, not a verdict. Some +1 items are still "must-ship" because they're foundational; some −2 items are worth eating the cost because they define the game's identity. Use Net to sort within categories, then layer judgment.

---

## A. Run loop foundations (locked / required)

These were approved in dialogue and form the spine. Net is mostly informational.

| Idea | Win | Diff | Net |
|---|---|---|---|
| Endless climb (one life per run) | 10 | 4 | +6 |
| Cash Out between levels | 8 | 2 | +6 |
| Persistent wallet separate from in-run | 9 | 4 | +5 |
| Multi-level-per-size growth curve (2×2 → 10×10) | 7 | 3 | +4 |
| Additive scoring in Super (vs HG/SS multiplicative) | 7 | 3 | +4 |
| Classic mode preserved (HG/SS faithful, untouched) | 8 | 2 | +6 |
| Mode select screen (Classic vs Super entry) | 7 | 3 | +4 |
| Line-composition guard (no all-coin or all-voltorb rows/cols) | 8 | 2 | +6 |

---

## B. In-run power-ups (live coin spend)

| Idea | Win | Diff | Net |
|---|---|---|---|
| **Defuse** (flip with no risk; voltorb removed) | 9 | 3 | +6 |
| **Safe-Peek** (translucent reveal, ~3s cooldown) | 8 | 3 | +5 |
| **Clear-Board** (50% wallet → end level safely) | 8 | 3 | +5 |
| **Shield** (insure one upcoming flip) | 7 | 3 | +4 |
| Coin doubler (next flip's value 2x) | 5 | 2 | +3 |
| Row decoder (reveal hidden row faces) | 6 | 3 | +3 |
| Voltorb tracker (mark one voltorb permanently) | 6 | 3 | +3 |
| Second chance (reactive: refund 30% on death) | 7 | 4 | +3 |
| Tax shelter (next Clear-Board 30% instead of 50%) | 4 | 2 | +2 |
| Boost bank (+20% next level coin face values) | 4 | 2 | +2 |
| Two-step immunity (next 2 flips can't be voltorbs) | 5 | 3 | +2 |
| Greed toggle (board doubled but death penalty) | 5 | 3 | +2 |
| Scanner (reveal all of one row/col) | 5 | 3 | +2 |
| Probability whisper (hover → see voltorb % for 5s) | 7 | 5 | +2 |
| Rewind (undo last N flips) | 6 | 5 | +1 |
| Reshuffle (re-randomize voltorbs, clues stay) | 5 | 4 | +1 |
| Sweep (reveal 3×3 around a tile) | 5 | 4 | +1 |
| Adjacency peek (3×3 voltorb count on hover) | 5 | 4 | +1 |
| Board reset (regenerate same clues, different voltorbs) | 4 | 3 | +1 |
| Harvest (auto-flip all 1x tiles) | 4 | 3 | +1 |
| Blackjack flip (next tile ±50% gamble) | 3 | 2 | +1 |
| Kamikaze (detonate one row deliberately) | 4 | 4 | 0 |
| Double-or-nothing flip (50/50 doubled or zeroed) | 3 | 3 | 0 |
| Voltorb lottery (50/50 reveal voltorb or 3x) | 3 | 3 | 0 |

## C. Hint mechanics (board-info layer)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Free main diagonal (↘) from 3×3+ | 8 | 3 | +5 |
| Purchasable second diagonal (↙), per board | 7 | 3 | +4 |
| Risk heatmap overlay (Bayesian voltorb probabilities) | 8 | 7 | +1 |
| Memo auto-fill (clue-derived flag suggestions) | 6 | 5 | +1 |
| Safe-tile guarantee (highlight one provably safe) | 6 | 6 | 0 |
| Clue focus (whisper voltorb positions in row/col) | 5 | 5 | 0 |

## D. Persistent wallet (non-cosmetic uses)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Extra Life consumable (rare; revives on death) | 9 | 4 | +5 |
| Cheaper power-ups (-15% permanent) | 7 | 3 | +4 |
| Starting stake (next run begins with N in-run coins) | 7 | 3 | +4 |
| Cash-Out bonus (+10% on persistent conversion) | 5 | 2 | +3 |
| Starting level boost (skip warmup levels) | 6 | 3 | +3 |
| Level skip voucher (skip one level mid-run) | 6 | 3 | +3 |
| Peek-the-future (next board difficulty preview) | 6 | 3 | +3 |
| Daily Seed Challenge unlock | 8 | 5 | +3 |
| Lucky charm (+5% chance of coin face value upgrade) | 5 | 3 | +2 |
| Power-up voucher pack (preloaded items in run) | 6 | 4 | +2 |
| Run history stats screen | 5 | 3 | +2 |
| Save-and-continue mid-run | 8 | 6 | +2 |
| Blind mode unlock | 5 | 3 | +2 |
| Speedrun mode unlock | 5 | 3 | +2 |
| Endless+ unlock (harder density curve) | 4 | 2 | +2 |
| Run-insurance bundle (3 Defuse + Shield + 2nd Chance) | 4 | 2 | +2 |
| Cash-out safety net (50% reimbursement on early death) | 4 | 3 | +1 |
| Tax shelter pre-arm | 4 | 3 | +1 |
| Diagonal pre-unlock (free from L1) | 3 | 2 | +1 |
| Frost vision (1 tile auto-peeked per board) | 4 | 3 | +1 |
| Extra memo slot (5th flag) | 4 | 3 | +1 |
| Mirror/Fog/Timed modifier unlocks | 5 | 4 | +1 |
| Custom seed entry | 5 | 4 | +1 |
| Handicap toggles (no power-ups, etc — bonus payouts) | 5 | 4 | +1 |
| Larger boards (N=11, N=12) | 4 | 3 | +1 |
| Better clue cards (extra hints option) | 4 | 4 | 0 |
| Ghost runs (replay-vs-self) | 5 | 6 | −1 |
| Replay export (.webm) | 4 | 7 | −3 |

## E. Themes (Pokémon-flavored shop stock)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Default Johto HG/SS (free, baseline) | 8 | 1 | +7 |
| Shiny theme (1/8192 unlock — see F) | 9 | 3 | +6 |
| Team Rocket | 7 | 4 | +3 |
| Game Corner / Celadon (neon) | 6 | 4 | +2 |
| Kanto Gen I (8-bit monochrome) | 6 | 4 | +2 |
| Legendary themes set (Lugia/Ho-Oh/Mewtwo/Rayquaza) | 7 | 5 | +2 |
| Hoenn Gen III (tropical) | 5 | 4 | +1 |
| Sinnoh Gen IV (snow/aurora) | 5 | 4 | +1 |
| Safari Zone | 5 | 4 | +1 |
| Type packs (Fire/Water/Electric/Psychic/Ghost) | 6 | 5 | +1 |
| Gym Leader packs (Brock/Misty/Erika/Sabrina) | 6 | 6 | 0 |
| Seasonal themes (Halloween/Winter/Anniversary) | 5 | 5 | 0 |
| Casino theme with 4x tile variant | 5 | 6 | −1 |

## F. Shiny / rare event mechanics

| Idea | Win | Diff | Net |
|---|---|---|---|
| Shiny encounter (1/8192 board, clears + unlocks theme) | 9 | 4 | +5 |
| Rare 5x golden tile (~1/20 boards) | 6 | 3 | +3 |
| Mewtwo encounter (1/1000 ultra-rare) | 5 | 5 | 0 |

## G. Drama / juice / streamability

| Idea | Win | Diff | Net |
|---|---|---|---|
| Floating combat text (+3! STREAK x4!) | 7 | 3 | +4 |
| Post-run receipt card (shareable) | 8 | 4 | +4 |
| Screen-shake + slow-mo on near-misses | 7 | 4 | +3 |
| Voltorb chain reaction on death (cascading explosions) | 8 | 5 | +3 |
| Streak counter + bonus (consecutive boards cleared) | 6 | 3 | +3 |
| Sweat meter (red pulse on high voltorb risk) | 7 | 6 | +1 |
| Cheating board (mid-flip voltorb relocation, telegraphed) | 5 | 5 | 0 |
| Close-call replay (last 2s) | 5 | 6 | −1 |
| Highlight auto-capture (.webm clips of dramatic events) | 6 | 9 | −3 |

## H. Roguelike layer (run shape modifiers)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Run modifiers drafted at start (pick 2 of 5) | 9 | 5 | +4 |
| Path picker (choose between 2 boards every 5 levels) | 7 | 4 | +3 |
| Floor + boss structure (every 5 levels = floor + perk pick) | 8 | 6 | +2 |
| NPC encounters (mid-run deals) | 6 | 5 | +1 |
| Cursed boards (5% lying clues, 2x payout) | 5 | 5 | 0 |

## I. Alt puzzle modes (one-off levels mid-run)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Memorize phase (board visible 3s, then hidden) | 7 | 4 | +3 |
| Sudden Death board (1% rare, single tile) | 5 | 3 | +2 |
| Inversion level (voltorbs pay coins) | 6 | 4 | +2 |
| Voltorb's POV (voltorbs visible, avoid coins) | 5 | 4 | +1 |
| Voltorb chain combo bonus | 5 | 4 | +1 |
| Two-board duel (parallel boards) | 5 | 6 | −1 |

## J. Pokémon weather modifiers (run-wide flavor)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Rain (every 5th flip +50%) | 5 | 3 | +2 |
| Sun (face values 2x, voltorb 2x penalty) | 5 | 3 | +2 |
| Hail (10% flip cancellation) | 4 | 3 | +1 |
| Sandstorm (clue precision −1) | 5 | 5 | 0 |

## K. Boss / antagonist content

| Idea | Win | Diff | Net |
|---|---|---|---|
| Team Rocket boss boards every 10 levels | 8 | 6 | +2 |
| Elite Four checkpoints (L25/30/35/40) | 7 | 6 | +1 |
| Voltorb Trainer journey (badges + gym leaders + champion) | 8 | 7 | +1 |

## L. Alt game modes (whole separate loops)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Naked run (no clue cards, 5x payout) | 5 | 2 | +3 |
| Marathon mode (capped 100 levels, no Cash Out) | 6 | 3 | +3 |
| One-life classic (HG/SS faithful, no Cash Out) | 4 | 2 | +2 |
| Sprint mode (race to L20) | 5 | 3 | +2 |
| Wallet challenge (clear with exactly N coins) | 4 | 4 | 0 |

## M. Live / event content (real-world calendar)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Pokémon Day event boards (Feb 27) | 4 | 5 | −1 |
| Halloween / Winter / Anniversary events | 4 | 5 | −1 |
| Voltorb Day annual event (June 1) | 3 | 4 | −1 |
| Weekly Pokémon spotlight | 4 | 6 | −2 |

## N. Spectator / community / async PvP

| Idea | Win | Diff | Net |
|---|---|---|---|
| DB-backed leaderboard (mode-split, mirroring space-shooter) | 9 | 6 | +3 |
| Replay viewer (watch others' runs, stored move sequences) | 7 | 7 | 0 |
| Player profile pages | 5 | 5 | 0 |
| Race-to-clear async PvP (same seed, 24h window) | 7 | 7 | 0 |
| Steal mode (ghost defends; loser pays persistent coins) | 6 | 8 | −2 |
| Async weekly tournaments (entry fee, bracket, prize pool) | 5 | 8 | −3 |
| Custom theme uploader (community library) | 5 | 9 | −4 |
| Tag-team designer mode (one places voltorbs, one solves) | 4 | 8 | −4 |
| Co-op shared board (alternating flips, shared wallet) | 5 | 9 | −4 |

## O. Identity / texture

| Idea | Win | Diff | Net |
|---|---|---|---|
| Trainer Card (customizable, shareable PNG) | 7 | 5 | +2 |
| Board "personality" types announced pre-play | 6 | 4 | +2 |
| Titles (Defuse Artist, Voltorb Slayer, etc.) | 5 | 3 | +2 |

## P. Easter eggs / hidden

| Idea | Win | Diff | Net |
|---|---|---|---|
| The Forgotten Voltorb (page-corner spawn after ~50 runs) | 5 | 3 | +2 |
| Hidden secret room (after badges + shiny + 100 runs) | 5 | 4 | +1 |
| Konami code → 8-bit pixel mode | 4 | 3 | +1 |

## Q. Pressure mechanics

| Idea | Win | Diff | Net |
|---|---|---|---|
| Voltorb prophet (run-start fate prediction; beat for bonus) | 5 | 3 | +2 |
| Heat meter (forces Cash Out timing) | 5 | 4 | +1 |

## R. Speedrun / TAS-friendly tooling

| Idea | Win | Diff | Net |
|---|---|---|---|
| Frame-perfect mode (skip animations) | 4 | 2 | +2 |
| Per-board grading (A/B/C/D/F) | 5 | 4 | +1 |
| Replay timeline scrubber | 4 | 6 | −2 |

## S. Mechanical curveballs

| Idea | Win | Diff | Net |
|---|---|---|---|
| Aerial run map (roguelike-style journey visualization) | 5 | 6 | −1 |
| Voltorb dreams (between-runs vignettes) | 4 | 6 | −2 |
| Voltorb language Easter egg (decode whispers after 100 Defuses) | 3 | 5 | −2 |

## T. Audio / sensory layer

| Idea | Win | Diff | Net |
|---|---|---|---|
| Tile pitch system (face value → musical pitch) | 7 | 3 | +4 |
| Adaptive BGM tempo (speeds up under tension) | 6 | 4 | +2 |
| Voltorb sonar (hover ping with probability frequency) | 5 | 5 | 0 |

## U. Second progression track (XP, separate from coins)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Achievement Pokédex (50+ unlockable badges) | 6 | 5 | +1 |
| XP-based skill tree (unlocks capabilities, not items) | 8 | 7 | +1 |

## V. Card / deckbuilder layer (radical re-shape)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Build draft at run start (Aggressive/Patient/Hoarder) | 7 | 5 | +2 |
| Item deck (pre-run draft, draw 1 random per board) | 7 | 6 | +1 |

## W. Idle / passive layer

| Idea | Win | Diff | Net |
|---|---|---|---|
| Charging items (regen 1 use per real-world hour) | 4 | 4 | 0 |
| Background pet farm (passive coin trickle when idle) | 4 | 5 | −1 |

## X. Streaming chat integration

| Idea | Win | Diff | Net |
|---|---|---|---|
| Twitch chat votes for tile selection | 5 | 9 | −4 |
| Donation tip jar power-ups | 4 | 9 | −5 |
| Subscriber-only run modifiers | 3 | 9 | −6 |

## Y. Branching narrative / mid-run choices

| Idea | Win | Diff | Net |
|---|---|---|---|
| Daily quests (3 random goals/day) | 6 | 5 | +1 |

(NPC encounters covered in H.)

## Z. Collection / Pokédex layer

| Idea | Win | Diff | Net |
|---|---|---|---|
| Voltorb collection book (variants per theme) | 5 | 5 | 0 |
| Pokémon team (6 mons with passive boosts) | 6 | 7 | −1 |
| Berry crafting (3 berries → 1 power-up potion) | 4 | 6 | −2 |

## AA. Anti-meta / chaos

| Idea | Win | Diff | Net |
|---|---|---|---|
| Random session modifier (rolls daily, lasts 24h) | 5 | 3 | +2 |
| Reverse psychology mode (clues lie, catch them) | 5 | 5 | 0 |

## AB. Tactile / accessibility

| Idea | Win | Diff | Net |
|---|---|---|---|
| Haptic feedback on mobile (pulse strength = face value) | 5 | 2 | +3 |
| Colorblind palettes | 5 | 2 | +3 |
| Reduced motion mode | 5 | 2 | +3 |
| Solver mode toggle (show optimal flip — for learning) | 5 | 7 | −2 |
| Voice control ("flip A1") | 3 | 6 | −3 |

## AC. Replay & analytics

| Idea | Win | Diff | Net |
|---|---|---|---|
| Detailed run analytics (stats screen) | 5 | 5 | 0 |
| Heatmap analytics (per-account flip patterns) | 5 | 6 | −1 |
| Coach mode (AI 2-sentence post-run review) | 5 | 7 | −2 |

## AD. Horror / atmospheric

| Idea | Win | Diff | Net |
|---|---|---|---|
| Cursed run (1/200 spawn, dim aesthetics, unique theme drop) | 5 | 4 | +1 |
| Voltorb whisperer (chat-bubble hints, sometimes lying) | 5 | 5 | 0 |
| Lights-out theme variant | 4 | 4 | 0 |
| The Watcher (silhouette in corner of some boards) | 3 | 3 | 0 |
| Defused-voltorb ghosts (residue on board) | 3 | 3 | 0 |

## AE. Misc weird

| Idea | Win | Diff | Net |
|---|---|---|---|
| Backwards mode (voltorbs visible, avoid coins) | 3 | 3 | 0 |

---

## Summary tables

### Top 25 by Net Score (best ROI)

| # | Idea | Win | Diff | Net |
|---|---|---|---|---|
| 1 | Default Johto HG/SS theme | 8 | 1 | +7 |
| 2 | Endless climb (one life per run) | 10 | 4 | +6 |
| 3 | Cash Out between levels | 8 | 2 | +6 |
| 4 | Classic mode preserved | 8 | 2 | +6 |
| 5 | Defuse | 9 | 3 | +6 |
| 6 | Shiny theme unlock (1/8192) | 9 | 3 | +6 |
| 7 | Line-composition guard (difficulty) | 8 | 2 | +6 |
| 8 | Persistent wallet system | 9 | 4 | +5 |
| 8 | Safe-Peek | 8 | 3 | +5 |
| 9 | Clear-Board (50% rescue) | 8 | 3 | +5 |
| 10 | Free main diagonal from 3×3+ | 8 | 3 | +5 |
| 11 | Extra Life consumable | 9 | 4 | +5 |
| 12 | Shiny encounter mechanic | 9 | 4 | +5 |
| 13 | Multi-level-per-size growth curve | 7 | 3 | +4 |
| 14 | Additive scoring | 7 | 3 | +4 |
| 15 | Mode select screen | 7 | 3 | +4 |
| 16 | Shield (insure one flip) | 7 | 3 | +4 |
| 17 | Purchasable second diagonal | 7 | 3 | +4 |
| 18 | Cheaper power-ups (permanent) | 7 | 3 | +4 |
| 19 | Starting stake | 7 | 3 | +4 |
| 20 | Floating combat text | 7 | 3 | +4 |
| 21 | Post-run receipt card | 8 | 4 | +4 |
| 22 | Run modifiers drafted at start | 9 | 5 | +4 |
| 23 | Tile pitch system (audio) | 7 | 3 | +4 |
| 24 | Team Rocket theme | 7 | 4 | +3 |
| 25 | DB leaderboard | 9 | 6 | +3 |

### Bottom 15 by Net Score (likely cut)

| Idea | Win | Diff | Net |
|---|---|---|---|
| Subscriber-only run modifiers | 3 | 9 | −6 |
| Donation tip jar power-ups | 4 | 9 | −5 |
| Custom theme uploader | 5 | 9 | −4 |
| Twitch chat votes | 5 | 9 | −4 |
| Tag-team designer mode | 4 | 8 | −4 |
| Co-op shared board | 5 | 9 | −4 |
| Replay export (.webm) | 4 | 7 | −3 |
| Highlight auto-capture | 6 | 9 | −3 |
| Voice control | 3 | 6 | −3 |
| Async weekly tournaments | 5 | 8 | −3 |
| Steal mode (ghost defenders) | 6 | 8 | −2 |
| Coach mode (AI review) | 5 | 7 | −2 |
| Replay timeline scrubber | 4 | 6 | −2 |
| Solver mode toggle | 5 | 7 | −2 |
| Voltorb language Easter egg | 3 | 5 | −2 |

### "Locked foundations" — must ship by definition

- Endless climb (one life per run)
- Cash Out between levels
- Persistent wallet separate from in-run
- Multi-level-per-size growth curve (2×2 → 10×10)
- Additive scoring
- Classic mode preserved
- Mode select screen
- Defuse + Safe-Peek + Clear-Board (the spec-defined power-ups)
- Free main diagonal from 3×3+
- Line-composition guard (no row/col is 100% coins or 100% voltorbs)
- Extra Life consumable
- DB leaderboard

### Shape proposal: v1 / v2 / stretch buckets

A reasonable cut for a v1 sprint, balancing wins against finite time:

**v1 (ship together — Net ≥ +3 and core to identity):**
- All locked foundations (above)
- Power-ups: Defuse, Safe-Peek, Clear-Board, Shield, Coin doubler, Tax shelter
- Hint: Free + purchasable diagonals
- Persistent wallet: Extra Life, Cheaper power-ups, Starting stake, Cash-Out bonus, Starting level boost, Level skip voucher, Peek-the-future
- Themes: Default + Team Rocket + Game Corner + Kanto + Shiny (5 themes total)
- Shiny encounter (1/8192) + Rare 5x golden tile
- Drama: Floating combat text, Voltorb chain reaction on death, Streak counter, Post-run receipt
- Audio: Tile pitch system, Adaptive BGM
- Identity: Board personality types, Titles
- Roguelike: Run modifiers drafted at start, Path picker
- Alt-puzzle: Memorize phase, Sudden Death board
- Easter egg: The Forgotten Voltorb
- Anti-meta: Voltorb prophet, Random session modifier
- Accessibility: Colorblind palettes, Reduced motion, Haptic feedback
- DB leaderboard

**v2 (next sprint, after v1 ships and gets feedback):**
- Floor + boss structure
- Team Rocket boss boards
- Daily Seed Challenge
- Save-and-continue
- Inversion level + Voltorb's POV
- Pokémon weather modifiers
- More themes (Hoenn/Sinnoh/Safari/Type packs/Legendary)
- Achievement Pokédex
- Build draft (deckbuilder layer)
- Trainer Card
- Replay viewer

**Stretch / future / probably skip:**
- Voltorb Trainer journey (full gym leader narrative — huge content lift)
- XP-based skill tree
- Pokémon team (6 mons with passive boosts)
- Async PvP modes (Race-to-clear, Steal mode, Co-op)
- Custom theme uploader
- Twitch / streaming infra integrations
- Replay export, highlight auto-capture
- Live event content (seasonal boards)
