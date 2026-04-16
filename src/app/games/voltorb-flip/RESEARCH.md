# VoltorbFlip Research -- Faithful Recreation Reference

## 1. Complete Game Flow (Every State)

### Opening / Pre-Game
- Board is pre-generated BEFORE the menu is shown (next board generated on win/lose/quit too)
- Player sees a "Play VOLTORB Flip?" dialogue (`dialogue/play.png`)
- Player clicks "Yes" (Play button: `button/play.png`) to start
- The board is revealed with all tiles face-down (green blank tiles)

### Active Gameplay
- Player sees the 5x5 grid of face-down green tiles
- Row/column info panels show point sums + Voltorb counts on the right and bottom
- Scoreboard shows: Level indicator, Current Coins (this round), Total Coins
- Buttons available: Open Memo, Quit
- Player clicks tiles to flip them

### Tile Flip (Number Found: 1, 2, or 3)
1. Tile animates: blank -> flip_0 (narrowing, 6 frames) -> flip_1 (thin sliver, 6 frames) -> N_flip (widening with value, 6 frames) -> N (full revealed value)
2. Success sparkle animation plays on the tile (4 frames: success_0 through success_3, drawn as overlay)
3. Coins update: first flip = face value; subsequent flips = multiply current coins by face value
4. Scoreboard transitions (counts up/down digit by digit, 1 per frame)
5. If ALL 2s and 3s are found (currentCoins == maxCoins): WIN condition triggers

### Tile Flip (Voltorb Found: value 0)
1. Same initial flip animation as above
2. Then Voltorb tile revealed (`tile/voltorb.png`, `tile/voltorb_flip.png`)
3. Explosion animation sequence (9 frames, each 6 frames apart):
   - explode_0 through explode_8, with sprite expanding outward:
   - explode_0-2: same position
   - explode_3: x-6, y-6
   - explode_4: x-4, y-4 (cumulative -10)
   - explode_5: x-7, y-7 (cumulative -17)
   - explode_6: x-2, y-2 (cumulative -19)
   - explode_7: x-1, y-1 (cumulative -20)
   - explode_8: x-1, y-1 (cumulative -21)
4. Current coins reset to 0 (scoreboard transitions down)
5. Level demotion: level = max(min(flips, currentLevel), 1)
   - flips = number of numbered cards flipped before hitting Voltorb
   - Minimum level is 1
6. `finish()` function called

### Win Sequence (All Multiplier Tiles Found)
1. Final tile flip animation
2. Success sparkle on the final tile
3. Scoreboard transitions: current coins count up to the won amount
4. 12 frames pause (skipFrames(12))
5. Simultaneously: total coins count up, current coins count down to 0
6. `finish()` function called
7. Level advances: level++ (max 7 normally, 8 via streak)
8. Special: If player won 5 consecutive rounds at level 5+ with 8+ flips each, jump to level 8

### finish() Function -- Post-Game
- All remaining tiles reveal one by one (25 iterations, each with a tileFlip animation showing what was underneath)
- After all tiles revealed: dialogue messages appear
  - Clear dialogues: `dialogue/clear_0.png`, `clear_1.png`, `clear_2.png` (level clear messages)
  - Received dialogues: `dialogue/received.png`, `received_0.png` through `received_3.png` (coin received messages with digits)
- Level number updates
- `setup()` called to prepare next board
- Return to "Play?" dialogue

### Quit Option
- Player can click Quit (`button/quit.png`) at any time during active play
- Quit counts as a loss for level purposes (drops levels if not enough flips)
- Player KEEPS coins earned so far in the round
- Blue quit button variant exists (`button/blue/quit.png`, `quit_hover.png`, `quit_press.png`)

### Level 8 Streak Mechanic
- Track `flip8Streak` counter
- If player wins with flips+1 > 7 (i.e., flipped 8+ tiles), increment streak
- If flip8Streak > 4 (5 consecutive 8+ flip wins), level jumps to 8
- Otherwise normal level++ on win

## 2. All UI Elements

### Background
- `background.png` -- Green tiled background covering the entire screen (DS resolution reference: 256x192 per screen)
- The samualtnorman version renders at a specific pixel scale

### 5x5 Tile Grid
- 25 tiles arranged in 5 rows x 5 columns
- Each tile is 32x32 pixels (placed at x=12+col*32, y=204+row*32 in the samualtnorman layout)
- Blank/face-down state: `tile/blank.png` -- solid green square tile
- Hover state: `tile/hover.png` -- highlighted version when mouse is over
- Memo overlays on tiles: `tile/memo_0.png` through `tile/memo_3.png` (small marks in corners)

### Tile States (All Assets)
- `tile/blank.png` -- Face-down green tile
- `tile/hover.png` -- Hovered face-down tile
- `tile/flip_0.png` -- Flip animation frame 0 (narrowing)
- `tile/flip_1.png` -- Flip animation frame 1 (thin sliver)
- `tile/1.png` -- Revealed "1" tile
- `tile/1_flip.png` -- "1" widening during flip
- `tile/2.png` -- Revealed "2" tile
- `tile/2_flip.png` -- "2" widening during flip
- `tile/3.png` -- Revealed "3" tile
- `tile/3_flip.png` -- "3" widening during flip
- `tile/voltorb.png` -- Revealed Voltorb tile
- `tile/voltorb_flip.png` -- Voltorb widening during flip
- `tile/explode_0.png` through `tile/explode_8.png` -- 9-frame explosion animation
- `tile/memo_0.png` through `tile/memo_3.png` -- Small memo marks (Voltorb, 1, 2, 3)

### Row/Column Info Panels
- Displayed to the RIGHT of each row and BELOW each column
- Each panel shows two numbers:
  - Top number: sum of all tile values in that row/column (2 digits, bold font)
  - Bottom number: count of Voltorbs in that row/column (1 digit, bold font)
- Frame: `frame/frame.png` -- the panel border/background
- Hover states: `frame/hover_0.png`, `frame/hover_1.png`, `frame/hover_2.png`

### Scoreboard Area
- Level indicator: Uses thin digit font at position (173, 11)
- Current coins (this round): 5-digit display using big digit font
- Total coins (cumulative): 5-digit display using big digit font

### Number/Digit Assets
- **Big digits** (for scoreboards): `number/big_0.png` through `number/big_9.png`
- **Bold digits** (for row/column info): `number/bold_0.png` through `number/bold_9.png`
- **Thin digits** (for level number): `number/thin_1.png` through `number/thin_9.png` (no thin_0)

### Memo System UI
- Memo overlay on tiles: `memo/0.png` through `memo/3.png` (marks for Voltorb, 1, 2, 3)
- Memo frame: `memo/frame.png` -- the memo panel that slides down
- Memo hover: `memo/hover.png`
- Memo press: `memo/press.png`

### Buttons
- **Open Memo**: `button/memo/open.png`, `button/memo/open_press.png`
- **Close Memo**: `button/memo/close.png`, `button/memo/close_press.png`
- **Memo hover**: `button/memo/hover.png`
- **Memo toggle buttons** (0/Voltorb, 1, 2, 3): `button/memo/0_off.png`, `button/memo/0_on.png` through `button/memo/3_off.png`, `button/memo/3_on.png`
- **Memo S button** (repeat/recurse): `button/memo/s_off.png`, `button/memo/s_on.png`
- **Play**: `button/play.png`
- **Quit** (red): `button/quit.png`
- **Quit (blue)**: `button/blue/quit.png`, `button/blue/quit_hover.png`, `button/blue/quit_press.png`
- **Game Info**: `button/game_info.png`

### Dialogue/Message Assets
- `dialogue/play.png` -- "Play VOLTORB Flip?" prompt
- `dialogue/clear_0.png` -- Level clear message part 0
- `dialogue/clear_1.png` -- Level clear message part 1
- `dialogue/clear_2.png` -- Level clear message part 2
- `dialogue/received.png` -- "Received X coins!" message
- `dialogue/received_0.png` through `dialogue/received_3.png` -- Coin digits for received message

### Other Assets
- `background.png` -- Main green background
- `favicon.png` -- Favicon
- `missing.png` -- Missing texture placeholder
- `success_0.png` through `success_3.png` -- Sparkle/success animation overlay (4 frames)
- `public/voltorb.svg` -- Vector Voltorb icon
- `public/favicon.ico` -- Site favicon

## 3. Sound Effects & Music

### Music (from samualtnorman source)
- **Intro**: `music_intro.mp3` -- Plays once on game start (the "Voltorb Flip Start" theme)
- **Loop**: `music_loop.mp3` -- Loops continuously after intro ends
- Music pauses on blur, resumes on focus
- Volume controlled by slider

### Original DS Game Music Tracks (from HGSS soundtrack)
From the KHInsider gamerip / Super Music Collection:
- **Track 49: "Goldenrod Game Corner"** -- The main Game Corner BGM
- **Track 50: "Voltorb Flip Start"** -- The intro/start music for Voltorb Flip
- **Track 51: (between Voltorb Flip Start and Retire)** -- The main Voltorb Flip gameplay loop
- **Track 52: "Goldenrod Game Corner (Retire)"** -- Music when leaving/finishing
- **Track 53: "You're a Winner!"** -- Win jingle/fanfare

Also on SoundCloud (user-519096026):
- "Goldenrod Game Corner"
- "Voltorb Flip Start"  
- "Goldenrod Game Corner (Retire)"

### Sound Effects in the Original DS Game
The original game uses SDAT/SSEQ format NDS audio. Key sound effects:
- **Tile flip**: Quick card-flip sound
- **Voltorb explosion/Self-Destruct**: Distinctive explosion SFX
- **Win jingle**: Level clear fanfare
- **Lose/game over**: Short defeat sound
- **Coin counting/ticking**: Rapid tick sound as coins count up
- **Memo open/close**: UI panel slide sound
- **Button press**: Subtle click/press sound
- **Number reveal**: Brief chime when a number tile is revealed

NOTE: The samualtnorman recreation does NOT include sound effects -- only background music (intro + loop). A faithful recreation would need to add SFX separately.

## 4. Sound Effect Sources

### Primary Download Sources
1. **Internet Archive -- HGSS Super Music Collection**: https://archive.org/details/pkmn-hgss-soundtrack
   - Full official soundtrack, 174 files, 449 MB
   - Includes Game Corner and Voltorb Flip tracks
   
2. **KHInsider**: https://downloads.khinsider.com/game-soundtracks/album/pokemon-heartgold-and-soulsilver
   - Free MP3 downloads of all HGSS tracks
   - Track 49: Goldenrod Game Corner
   - Track 50: Voltorb Flip Start
   - Track 52: Goldenrod Game Corner (Retire)
   - Track 53: You're a Winner!

3. **The Sounds Resource (Spriters Resource)**: https://sounds.spriters-resource.com/ds_dsi/pokemonheartgoldsoulsilver/
   - DS sound rips including SFX (may require extraction)
   - Note: Returns 403 on direct fetch; browse in a real browser

4. **Project Pokemon Forums**: https://projectpokemon.org/home/forums/topic/5653-hgssptdp-sound-effects/
   - Discussion of SDAT extraction from NDS ROMs
   - SDAT files contain all SFX as SSEQ sequences

5. **SoundCloud**: https://soundcloud.com/user-519096026
   - "Voltorb Flip Start" stream
   - "Goldenrod Game Corner" stream
   - "Goldenrod Game Corner (Retire)" stream

6. **Smash Custom Music**: https://smashcustommusic.net/game/73
   - HGSS music available for download

### For Royalty-Free Alternatives
- Consider creating 8-bit/chiptune-style recreations of the SFX
- Use Web Audio API to synthesize similar sounds programmatically
- The explosion can be a white noise burst with frequency sweep
- The tile flip can be a short click/pop
- Win jingle can be a major scale ascending arpeggio
- Coin counting can be a repeating high-pitched tick

## 5. samual.uk/voltorb-flip/ (samualtnorman Version) Description

### Technology
- Written in TypeScript, built with Vite
- Single `index.ts` file (~950 lines) containing all game logic
- Canvas-based rendering with a custom Sprite system
- Generator-based animation system (yield* for frame sequencing)

### Layout (What You See)
- Green tiled background filling the screen
- Top area: Scoreboard with Level number, Current Coins (5 digits), Total Coins (5 digits)
- Center: 5x5 grid of green tiles
- Right of grid: 5 row info panels (point sum + Voltorb count)
- Below grid: 5 column info panels (point sum + Voltorb count)
- Bottom-right area: Open Memo / Close Memo button, Quit button
- When memo is open: Panel slides down revealing toggle buttons for Voltorb/1/2/3 marks + "S" (repeat/recurse) button
- Volume slider below the canvas

### Interactions
- Click tile to flip it
- Hover over tile shows highlight overlay
- Click Open Memo to toggle memo mode
- In memo mode, click a tile then toggle marks (0/1/2/3)
- S button enables copy-memo-to-next-tile mode (non-original feature)
- When only 1 memo on a tile, shows big version instead of small corner (non-original feature)
- Click Quit to end round early
- Post-game: all tiles reveal, dialogue sequence, then Play button to start next round

### Canvas Dimensions
- Renders at a DS-like pixel resolution, then scales to fit browser window
- Uses `imageRendering: pixelated` for crisp pixel art scaling
- Scale = min(innerHeight/canvas.height, innerWidth/canvas.width)

## 6. playvoltorbflip.com Comparison

### Technology
- Built by Brandon Stein (steiner26 on GitHub)
- Source: https://github.com/steiner26/voltorbflip
- React-based web application

### Layout
- Level indicator at top
- Total Coins and "Coins collected this Level" displays
- 5x5 grid of tiles
- Row info panels on the RIGHT side
- Column info panels on the BOTTOM
- Each info panel shows: point sum (top number) / Voltorb count (bottom number, with Voltorb sprite icon)
- "Open Memo" button

### Controls
- X: Open/Close Memo
- Space or Enter: Flip Tile
- 0 or ~: Toggle 0 Memo (Voltorb)
- 1: Toggle 1 Memo
- 2: Toggle 2 Memo  
- 3: Toggle 3 Memo

### Differences from Original
- No background music or sound effects
- Simplified visual style (CSS-based rather than pixel-art sprites)
- Uses the Voltorb sprite and tile background assets from the original
- Max level is 7 (confirmed in description)
- No explosion animation on Voltorb hit
- No coin counting animation
- No dialogue messages

## 7. Complete Level Configuration Table

Format: [num_2s, num_3s, num_voltorbs, max_coins]
Each level has 5 possible configurations (randomly selected).
Remaining tiles (25 - 2s - 3s - voltorbs) are all 1s.

### Level 1 (6 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 3        | 1        | 6        | 24        |
| 2      | 0        | 3        | 6        | 27        |
| 3      | 5        | 0        | 6        | 32        |
| 4      | 2        | 2        | 6        | 36        |
| 5      | 4        | 1        | 6        | 48        |

### Level 2 (7 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 1        | 3        | 7        | 54        |
| 2      | 6        | 0        | 7        | 64        |
| 3      | 3        | 2        | 7        | 72        |
| 4      | 0        | 4        | 7        | 81        |
| 5      | 5        | 1        | 7        | 96        |

### Level 3 (8 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 2        | 3        | 8        | 108       |
| 2      | 7        | 0        | 8        | 128       |
| 3      | 4        | 2        | 8        | 144       |
| 4      | 1        | 4        | 8        | 162       |
| 5      | 6        | 1        | 8        | 192       |

### Level 4 (8-10 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 3        | 3        | 8        | 216       |
| 2      | 0        | 5        | 8        | 243       |
| 3      | 8        | 0        | 10       | 256       |
| 4      | 5        | 2        | 10       | 288       |
| 5      | 2        | 4        | 10       | 324       |

### Level 5 (10 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 7        | 1        | 10       | 384       |
| 2      | 4        | 3        | 10       | 432       |
| 3      | 1        | 5        | 10       | 486       |
| 4      | 9        | 0        | 10       | 512       |
| 5      | 6        | 2        | 10       | 576       |

### Level 6 (10 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 3        | 4        | 10       | 648       |
| 2      | 0        | 6        | 10       | 729       |
| 3      | 8        | 1        | 10       | 768       |
| 4      | 5        | 3        | 10       | 864       |
| 5      | 2        | 5        | 10       | 972       |

### Level 7 (10-13 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 7        | 2        | 10       | 1,152     |
| 2      | 4        | 4        | 10       | 1,296     |
| 3      | 1        | 6        | 13       | 1,458     |
| 4      | 9        | 1        | 13       | 1,536     |
| 5      | 6        | 3        | 10       | 1,728     |

### Level 8 (10 Voltorbs)
| Config | x2 tiles | x3 tiles | Voltorbs | Max Coins |
|--------|----------|----------|----------|-----------|
| 1      | 0        | 7        | 10       | 2,187     |
| 2      | 8        | 2        | 10       | 2,304     |
| 3      | 5        | 4        | 10       | 2,592     |
| 4      | 2        | 6        | 10       | 2,916     |
| 5      | 7        | 3        | 10       | 3,456     |

## 8. Board Generation Algorithm

### From scotteh.me analysis:
1. Set all 25 tiles to value 1
2. Place Voltorbs randomly (roll 0-24, retry if occupied, max 100 attempts per tile type)
3. Place value-2 tiles randomly (same retry logic)
4. Place value-3 tiles randomly (same retry logic)
5. Validate board: check constraints on "free value tiles" (2s/3s in rows/columns with 0 Voltorbs)
6. If invalid, regenerate (up to 1000 attempts; if all fail, keep last board anyway)

### Board configuration selection:
- 80 total configurations (10 per level, indices 0-79)
- Random number modulo 100, round up to nearest 10, divide by 10, add level*10
- This gives equal 10% probability for each of the 10 configs per level
- The 5 configs in samualtnorman's `levels` array correspond to every OTHER config (the 10 original configs have 5 unique tile distributions, each appearing twice with different free-tile constraints)

### Coin Calculation
- Max coins = product of all 2s and 3s on the board
- Example Level 1 Config 4: 2 twos and 2 threes = 2*2*3*3 = 36 max coins
- Example Level 8 Config 5: 7 twos and 3 threes = 2^7 * 3^3 = 128 * 27 = 3,456 max coins

## 9. Animation Timing Reference (from samualtnorman source)

All animations use generator-based frame skipping. The game runs at ~60fps via requestAnimationFrame.

### Tile Flip Animation (function* tileFlip)
1. Set to flip_0 image, shift x+3: wait 6 frames (100ms)
2. Set to flip_1 image, shift x+6: wait 6 frames (100ms) 
3. Set to value_flip image (e.g., 2_flip), shift x-4: wait 6 frames (100ms)
4. Set to final value image (e.g., 2), shift x-5
- Total: ~24 frames (~400ms)

### Explosion Animation (function* blowup)
1. Bring tile to layer 5 (on top): wait 6 frames
2. explode_0: wait 6 frames
3. explode_1: wait 6 frames
4. explode_2: wait 6 frames
5. explode_3 + expand (-6,-6): wait 6 frames
6. explode_4 + expand (-4,-4): wait 6 frames
7. explode_5 + expand (-7,-7): wait 6 frames
8. explode_6 + expand (-2,-2): wait 6 frames
9. explode_7 + expand (-1,-1): wait 6 frames
10. explode_8 + expand (-1,-1): wait 6 frames
- Total: ~60 frames (~1000ms)

### Success Sparkle (function* success)
- 4 frames of sparkle overlay drawn directly to canvas context
- success_0 through success_3 images drawn centered on tile

### Memo Panel Animation (function* memoButtonPress)
- Button press appearance: 6 frames
- Panel slide: 4 steps of 2 frames each (16px, 17px, 17px, 17px = 67px total)
- Total open/close: ~14 frames (~233ms)

### Scoreboard Transition (function* transitionsScoreboard)
- Counts from old value to new value, 1 unit per frame
- Updates all 5 digit sprites each frame
- Speed = 1 coin per frame (fast for small amounts, slow for large)

### Post-Game Tile Reveal (inside finish)
- Reveals all 25 tiles sequentially
- Each tile: full tileFlip animation (~24 frames)
- Total: ~600 frames (~10 seconds for all 25 tiles)

## 10. Key Differences: Original DS vs. Web Recreations

| Feature | Original DS | samualtnorman | playvoltorbflip.com |
|---------|-------------|---------------|---------------------|
| Music | Full SSEQ BGM | MP3 intro + loop | None |
| Sound FX | Full SFX set | None | None |
| Tile flip anim | Yes | Yes (pixel-perfect) | No (instant) |
| Explosion anim | Yes | Yes (9 frames) | No |
| Success sparkle | Yes | Yes (4 frames) | No |
| Memo system | Yes | Yes + extras | Yes (simplified) |
| Coin counting | Animated | Animated (digit by digit) | Instant |
| Dialogue messages | Yes (NPC text) | Yes (image-based) | No |
| Level 8 streak | Yes | Yes | Unknown |
| Max coins cap (50,000) | Yes | Not confirmed | Not confirmed |
| Board generation | Mersenne Twister RNG | Math.random() | Math.random() |
