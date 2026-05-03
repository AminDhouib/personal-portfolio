# Super Voltorb Flip — TODO Ideas

All generated ideas for the Super Mode expansion, scored and bucketed.
Detailed scoring rationale lives in `docs/superpowers/specs/2026-04-26-voltorb-super-mode-ideas-scored.md`.

**Scoring:** Win (1-10) = player/streamer/portfolio value | Diff (1-10) = implementation cost | Net = Win - Diff

---

## Locked Foundations (must ship)

- [ ] Endless climb (one life per run) — Win 10 / Diff 4 / Net +6
- [ ] Cash Out between levels — Win 8 / Diff 2 / Net +6
- [ ] Persistent wallet separate from in-run — Win 9 / Diff 4 / Net +5
- [ ] Multi-level-per-size growth curve (2x2 to 10x10) — Win 7 / Diff 3 / Net +4
- [ ] Additive scoring in Super (vs HG/SS multiplicative) — Win 7 / Diff 3 / Net +4
- [ ] Classic mode preserved (HG/SS faithful, untouched) — Win 8 / Diff 2 / Net +6
- [ ] Mode select screen (Classic vs Super entry) — Win 7 / Diff 3 / Net +4
- [ ] Line-composition guard (no all-coin or all-voltorb rows/cols) — Win 8 / Diff 2 / Net +6
- [ ] Defuse + Safe-Peek + Clear-Board (core power-ups) — Win 9/8/8 / Diff 3 / Net +6/+5/+5
- [ ] Free main diagonal from 3x3+ — Win 8 / Diff 3 / Net +5
- [ ] Extra Life consumable — Win 9 / Diff 4 / Net +5
- [ ] DB-backed leaderboard — Win 9 / Diff 6 / Net +3

---

## v1 — Ship Together

### In-Run Power-Ups (live coin spend)
- [ ] Shield (insure one upcoming flip) — Win 7 / Diff 3 / Net +4
- [ ] Coin doubler (next flip's value 2x) — Win 5 / Diff 2 / Net +3
- [ ] Tax shelter (next Clear-Board 30% instead of 50%) — Win 4 / Diff 2 / Net +2

### Hint Mechanics
- [ ] Free main diagonal (already locked)
- [ ] Purchasable second diagonal (anti-diagonal), per board — Win 7 / Diff 3 / Net +4

### Persistent Wallet (non-cosmetic)
- [ ] Cheaper power-ups (-15% permanent) — Win 7 / Diff 3 / Net +4
- [ ] Starting stake (next run begins with N in-run coins) — Win 7 / Diff 3 / Net +4
- [ ] Cash-Out bonus (+10% on persistent conversion) — Win 5 / Diff 2 / Net +3
- [ ] Starting level boost (skip warmup levels) — Win 6 / Diff 3 / Net +3
- [ ] Level skip voucher (skip one level mid-run) — Win 6 / Diff 3 / Net +3
- [ ] Peek-the-future (next board difficulty preview) — Win 6 / Diff 3 / Net +3

### Themes (Pokemon-flavored)
- [ ] Default Johto HG/SS (free, baseline) — Win 8 / Diff 1 / Net +7
- [ ] Shiny theme (1/8192 unlock) — Win 9 / Diff 3 / Net +6
- [ ] Team Rocket — Win 7 / Diff 4 / Net +3
- [ ] Game Corner / Celadon (neon) — Win 6 / Diff 4 / Net +2
- [ ] Kanto Gen I (8-bit monochrome) — Win 6 / Diff 4 / Net +2

### Shiny / Rare Events
- [ ] Shiny encounter (1/8192 board, clears + unlocks theme) — Win 9 / Diff 4 / Net +5
- [ ] Rare 5x golden tile (~1/20 boards) — Win 6 / Diff 3 / Net +3

### Drama / Juice / Streamability
- [ ] Floating combat text (+3! STREAK x4!) — Win 7 / Diff 3 / Net +4
- [ ] Post-run receipt card (shareable) — Win 8 / Diff 4 / Net +4
- [ ] Screen-shake + slow-mo on near-misses — Win 7 / Diff 4 / Net +3
- [ ] Voltorb chain reaction on death (cascading explosions) — Win 8 / Diff 5 / Net +3
- [ ] Streak counter + bonus (consecutive boards cleared) — Win 6 / Diff 3 / Net +3

### Audio / Sensory
- [ ] Tile pitch system (face value to musical pitch) — Win 7 / Diff 3 / Net +4
- [ ] Adaptive BGM tempo (speeds up under tension) — Win 6 / Diff 4 / Net +2

### Identity / Texture
- [ ] Board "personality" types announced pre-play — Win 6 / Diff 4 / Net +2
- [ ] Titles (Defuse Artist, Voltorb Slayer, etc.) — Win 5 / Diff 3 / Net +2

### Roguelike Layer
- [ ] Run modifiers drafted at start (pick 2 of 5) — Win 9 / Diff 5 / Net +4
- [ ] Path picker (choose between 2 boards every 5 levels) — Win 7 / Diff 4 / Net +3

### Alt Puzzle Modes
- [ ] Memorize phase (board visible 3s, then hidden) — Win 7 / Diff 4 / Net +3
- [ ] Sudden Death board (1% rare, single tile) — Win 5 / Diff 3 / Net +2
- [ ] Reaction bonus round (tiles flash 2/3/voltorb; tap 2s & 3s for bonus, tapping voltorb or a non-flashing tile penalizes — chaotic action twist on the same engine) — Win 6 / Diff 4 / Net +2

### Easter Eggs
- [ ] The Forgotten Voltorb (page-corner spawn after ~50 runs) — Win 5 / Diff 3 / Net +2

### Anti-Meta / Chaos
- [ ] Voltorb prophet (run-start fate prediction; beat for bonus) — Win 5 / Diff 3 / Net +2
- [ ] Random session modifier (rolls daily, lasts 24h) — Win 5 / Diff 3 / Net +2

### Accessibility
- [ ] Colorblind palettes — Win 5 / Diff 2 / Net +3
- [ ] Reduced motion mode — Win 5 / Diff 2 / Net +3
- [ ] Haptic feedback on mobile (pulse strength = face value) — Win 5 / Diff 2 / Net +3

---

## v2 — After v1 Ships

- [ ] Floor + boss structure (every 5 levels = floor + perk pick) — Win 8 / Diff 6 / Net +2
- [ ] Team Rocket boss boards every 10 levels — Win 8 / Diff 6 / Net +2
- [ ] Daily Seed Challenge unlock — Win 8 / Diff 5 / Net +3
- [ ] Save-and-continue mid-run — Win 8 / Diff 6 / Net +2
- [ ] Inversion level (voltorbs pay coins) — Win 6 / Diff 4 / Net +2
- [ ] Voltorb's POV (voltorbs visible, avoid coins) — Win 5 / Diff 4 / Net +1
- [ ] Rain (every 5th flip +50%) — Win 5 / Diff 3 / Net +2
- [ ] Sun (face values 2x, voltorb 2x penalty) — Win 5 / Diff 3 / Net +2
- [ ] Hail (10% flip cancellation) — Win 4 / Diff 3 / Net +1
- [ ] Sandstorm (clue precision -1) — Win 5 / Diff 5 / Net 0
- [ ] Hoenn Gen III theme (tropical) — Win 5 / Diff 4 / Net +1
- [ ] Sinnoh Gen IV theme (snow/aurora) — Win 5 / Diff 4 / Net +1
- [ ] Safari Zone theme — Win 5 / Diff 4 / Net +1
- [ ] Type packs (Fire/Water/Electric/Psychic/Ghost) — Win 6 / Diff 5 / Net +1
- [ ] Legendary themes set (Lugia/Ho-Oh/Mewtwo/Rayquaza) — Win 7 / Diff 5 / Net +2
- [ ] Achievement Pokedex (50+ unlockable badges) — Win 6 / Diff 5 / Net +1
- [ ] Build draft at run start (Aggressive/Patient/Hoarder) — Win 7 / Diff 5 / Net +2
- [ ] Trainer Card (customizable, shareable PNG) — Win 7 / Diff 5 / Net +2
- [ ] Replay viewer (watch others' runs) — Win 7 / Diff 7 / Net 0
- [ ] Elite Four checkpoints (L25/30/35/40) — Win 7 / Diff 6 / Net +1
- [ ] NPC encounters (mid-run deals) — Win 6 / Diff 5 / Net +1

---

## v2 — More Power-Ups & Wallet Items

### Additional In-Run Power-Ups
- [ ] Row decoder (reveal hidden row faces) — Win 6 / Diff 3 / Net +3
- [ ] Voltorb tracker (mark one voltorb permanently) — Win 6 / Diff 3 / Net +3
- [ ] Second chance (reactive: refund 30% on death) — Win 7 / Diff 4 / Net +3
- [ ] Boost bank (+20% next level coin face values) — Win 4 / Diff 2 / Net +2
- [ ] Two-step immunity (next 2 flips can't be voltorbs) — Win 5 / Diff 3 / Net +2
- [ ] Greed toggle (board doubled but death penalty) — Win 5 / Diff 3 / Net +2
- [ ] Scanner (reveal all of one row/col) — Win 5 / Diff 3 / Net +2
- [ ] Probability whisper (hover = see voltorb % for 5s) — Win 7 / Diff 5 / Net +2
- [ ] Rewind (undo last N flips) — Win 6 / Diff 5 / Net +1
- [ ] Reshuffle (re-randomize voltorbs, clues stay) — Win 5 / Diff 4 / Net +1
- [ ] Sweep (reveal 3x3 around a tile) — Win 5 / Diff 4 / Net +1
- [ ] Adjacency peek (3x3 voltorb count on hover) — Win 5 / Diff 4 / Net +1
- [ ] Board reset (regenerate same clues, different voltorbs) — Win 4 / Diff 3 / Net +1
- [ ] Harvest (auto-flip all 1x tiles) — Win 4 / Diff 3 / Net +1
- [ ] Blackjack flip (next tile +/-50% gamble) — Win 3 / Diff 2 / Net +1

### Additional Wallet Items
- [ ] Lucky charm (+5% chance of coin face value upgrade) — Win 5 / Diff 3 / Net +2
- [ ] Power-up voucher pack (preloaded items in run) — Win 6 / Diff 4 / Net +2
- [ ] Run history stats screen — Win 5 / Diff 3 / Net +2
- [ ] Blind mode unlock — Win 5 / Diff 3 / Net +2
- [ ] Speedrun mode unlock — Win 5 / Diff 3 / Net +2
- [ ] Endless+ unlock (harder density curve) — Win 4 / Diff 2 / Net +2
- [ ] Run-insurance bundle (3 Defuse + Shield + 2nd Chance) — Win 4 / Diff 2 / Net +2
- [ ] Frost vision (1 tile auto-peeked per board) — Win 4 / Diff 3 / Net +1
- [ ] Extra memo slot (5th flag) — Win 4 / Diff 3 / Net +1
- [ ] Mirror/Fog/Timed modifier unlocks — Win 5 / Diff 4 / Net +1
- [ ] Custom seed entry — Win 5 / Diff 4 / Net +1
- [ ] Handicap toggles (no power-ups, etc) — Win 5 / Diff 4 / Net +1
- [ ] Larger boards (N=11, N=12) — Win 4 / Diff 3 / Net +1

### Additional Hint Mechanics
- [ ] Risk heatmap overlay (Bayesian voltorb probabilities) — Win 8 / Diff 7 / Net +1
- [ ] Memo auto-fill (clue-derived flag suggestions) — Win 6 / Diff 5 / Net +1

### Additional Alt Puzzle Modes
- [ ] Voltorb chain combo bonus — Win 5 / Diff 4 / Net +1

### Additional Alt Game Modes
- [ ] Naked run (no clue cards, 5x payout) — Win 5 / Diff 2 / Net +3
- [ ] Marathon mode (capped 100 levels, no Cash Out) — Win 6 / Diff 3 / Net +3
- [ ] One-life classic (HG/SS faithful, no Cash Out) — Win 4 / Diff 2 / Net +2
- [ ] Sprint mode (race to L20) — Win 5 / Diff 3 / Net +2

### Additional Drama / Juice
- [ ] Sweat meter (red pulse on high voltorb risk) — Win 7 / Diff 6 / Net +1

### Additional Speedrun Tooling
- [ ] Frame-perfect mode (skip animations) — Win 4 / Diff 2 / Net +2
- [ ] Per-board grading (A/B/C/D/F) — Win 5 / Diff 4 / Net +1

### Additional Horror / Atmospheric
- [ ] Cursed run (1/200 spawn, dim aesthetics, unique theme drop) — Win 5 / Diff 4 / Net +1

### Additional Easter Eggs
- [ ] Hidden secret room (after badges + shiny + 100 runs) — Win 5 / Diff 4 / Net +1
- [ ] Konami code to 8-bit pixel mode — Win 4 / Diff 3 / Net +1

### Additional Pressure Mechanics
- [ ] Heat meter (forces Cash Out timing) — Win 5 / Diff 4 / Net +1

### Deckbuilder Layer
- [ ] Item deck (pre-run draft, draw 1 random per board) — Win 7 / Diff 6 / Net +1

### XP / Progression
- [ ] XP-based skill tree (unlocks capabilities, not items) — Win 8 / Diff 7 / Net +1

### Daily / Quests
- [ ] Daily quests (3 random goals/day) — Win 6 / Diff 5 / Net +1

---

## Stretch / Future / Probably Skip

- [ ] Voltorb Trainer journey (badges + gym leaders + champion) — Win 8 / Diff 7 / Net +1
- [ ] Gym Leader packs (Brock/Misty/Erika/Sabrina) — Win 6 / Diff 6 / Net 0
- [ ] Seasonal themes (Halloween/Winter/Anniversary) — Win 5 / Diff 5 / Net 0
- [ ] Casino theme with 4x tile variant — Win 5 / Diff 6 / Net -1
- [ ] Mewtwo encounter (1/1000 ultra-rare) — Win 5 / Diff 5 / Net 0
- [ ] Cheating board (mid-flip voltorb relocation) — Win 5 / Diff 5 / Net 0
- [ ] Cursed boards (5% lying clues, 2x payout) — Win 5 / Diff 5 / Net 0
- [ ] Safe-tile guarantee (highlight one provably safe) — Win 6 / Diff 6 / Net 0
- [ ] Clue focus (whisper voltorb positions in row/col) — Win 5 / Diff 5 / Net 0
- [ ] Kamikaze (detonate one row deliberately) — Win 4 / Diff 4 / Net 0
- [ ] Double-or-nothing flip (50/50 doubled or zeroed) — Win 3 / Diff 3 / Net 0
- [ ] Voltorb lottery (50/50 reveal voltorb or 3x) — Win 3 / Diff 3 / Net 0
- [ ] Better clue cards (extra hints option) — Win 4 / Diff 4 / Net 0
- [ ] Charging items (regen 1 use per real-world hour) — Win 4 / Diff 4 / Net 0
- [ ] Voltorb sonar (hover ping with probability frequency) — Win 5 / Diff 5 / Net 0
- [ ] Reverse psychology mode (clues lie, catch them) — Win 5 / Diff 5 / Net 0
- [ ] Voltorb collection book (variants per theme) — Win 5 / Diff 5 / Net 0
- [ ] Voltorb whisperer (chat-bubble hints, sometimes lying) — Win 5 / Diff 5 / Net 0
- [ ] Lights-out theme variant — Win 4 / Diff 4 / Net 0
- [ ] The Watcher (silhouette in corner of some boards) — Win 3 / Diff 3 / Net 0
- [ ] Defused-voltorb ghosts (residue on board) — Win 3 / Diff 3 / Net 0
- [ ] Backwards mode (voltorbs visible, avoid coins) — Win 3 / Diff 3 / Net 0
- [ ] Detailed run analytics (stats screen) — Win 5 / Diff 5 / Net 0
- [ ] Player profile pages — Win 5 / Diff 5 / Net 0
- [ ] Race-to-clear async PvP (same seed, 24h window) — Win 7 / Diff 7 / Net 0
- [ ] Replay viewer — Win 7 / Diff 7 / Net 0
- [ ] Wallet challenge (clear with exactly N coins) — Win 4 / Diff 4 / Net 0
- [ ] Cash-out safety net (50% reimbursement) — Win 4 / Diff 3 / Net +1
- [ ] Tax shelter pre-arm — Win 4 / Diff 3 / Net +1
- [ ] Diagonal pre-unlock (free from L1) — Win 3 / Diff 2 / Net +1

---

## Likely Cut (negative Net)

- [ ] Close-call replay (last 2s) — Win 5 / Diff 6 / Net -1
- [ ] Two-board duel (parallel boards) — Win 5 / Diff 6 / Net -1
- [ ] Aerial run map (roguelike-style journey visualization) — Win 5 / Diff 6 / Net -1
- [ ] Background pet farm (passive coin trickle) — Win 4 / Diff 5 / Net -1
- [ ] Pokemon Day event boards — Win 4 / Diff 5 / Net -1
- [ ] Halloween / Winter / Anniversary events — Win 4 / Diff 5 / Net -1
- [ ] Voltorb Day annual event — Win 3 / Diff 4 / Net -1
- [ ] Heatmap analytics (per-account flip patterns) — Win 5 / Diff 6 / Net -1
- [ ] Pokemon team (6 mons with passive boosts) — Win 6 / Diff 7 / Net -1
- [ ] Ghost runs (replay-vs-self) — Win 5 / Diff 6 / Net -1
- [ ] Weekly Pokemon spotlight — Win 4 / Diff 6 / Net -2
- [ ] Voltorb dreams (between-runs vignettes) — Win 4 / Diff 6 / Net -2
- [ ] Voltorb language Easter egg — Win 3 / Diff 5 / Net -2
- [ ] Steal mode (ghost defenders) — Win 6 / Diff 8 / Net -2
- [ ] Coach mode (AI review) — Win 5 / Diff 7 / Net -2
- [ ] Replay timeline scrubber — Win 4 / Diff 6 / Net -2
- [ ] Solver mode toggle — Win 5 / Diff 7 / Net -2
- [ ] Berry crafting — Win 4 / Diff 6 / Net -2
- [ ] Replay export (.webm) — Win 4 / Diff 7 / Net -3
- [ ] Highlight auto-capture — Win 6 / Diff 9 / Net -3
- [ ] Voice control — Win 3 / Diff 6 / Net -3
- [ ] Async weekly tournaments — Win 5 / Diff 8 / Net -3
- [ ] Custom theme uploader — Win 5 / Diff 9 / Net -4
- [ ] Twitch chat votes — Win 5 / Diff 9 / Net -4
- [ ] Tag-team designer mode — Win 4 / Diff 8 / Net -4
- [ ] Co-op shared board — Win 5 / Diff 9 / Net -4
- [ ] Donation tip jar power-ups — Win 4 / Diff 9 / Net -5
- [ ] Subscriber-only run modifiers — Win 3 / Diff 9 / Net -6
