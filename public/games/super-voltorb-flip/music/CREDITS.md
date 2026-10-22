# Music credits

The background music and the round-cleared and round-lost jingles are the original recordings
from Pokemon HeartGold and SoulSilver (the Voltorb Flip Game Corner minigame). They belong to
Nintendo, Game Freak and Creatures Inc. They are used here in an unofficial, non-commercial fan
recreation; this site is not affiliated with or endorsed by those companies, and the recordings are
not licensed to it. They live in `audio/` and play as set out in
`src/components/game/super-voltorb-flip/music.ts`: `music_intro.mp3` once, then `music_loop.mp3`
for as long as the game plays, with `music_level_win.mp3` when a round is cleared and
`game_over.mp3` when it is lost. The files were mirrored from the samualtnorman/voltorb-flip
recreation (GPL-3.0, see `../sprites/LICENSE`).

The three `theme-*.mp3` tracks in this folder are CC0 chiptunes kept for the skin variants that
were never built; nothing plays them.

| File | Title | Author | License | Source |
|---|---|---|---|---|
| `music_intro.mp3` | Voltorb Flip intro (HGSS) | Nintendo, Game Freak, Creatures Inc. | Not licensed: fan use | Pokemon HeartGold and SoulSilver |
| `music_loop.mp3` | Voltorb Flip loop (HGSS) | Nintendo, Game Freak, Creatures Inc. | Not licensed: fan use | Pokemon HeartGold and SoulSilver |
| `music_level_win.mp3` | Level cleared jingle (HGSS) | Nintendo, Game Freak, Creatures Inc. | Not licensed: fan use | Pokemon HeartGold and SoulSilver |
| `game_over.mp3` | Game over jingle (HGSS) | Nintendo, Game Freak, Creatures Inc. | Not licensed: fan use | Pokemon HeartGold and SoulSilver |
| `theme-classic.mp3` | Talking Cute Chiptune | Pro Sensory (Alex McCulloch) | CC0 | https://opengameart.org/content/talking-cute-chiptune |
| `theme-meadow.mp3` | Flowerbed Fields Loop | Zane Little Music | CC0 | https://opengameart.org/content/flowerbed-fields-loop |
| `theme-twilight.mp3` | Slow Melancholic Theme C64 Style | skrjablin | CC0 | https://opengameart.org/content/slow-melancholic-theme-c64-style |

## Attribution of the CC0 tracks

The three `theme-*.mp3` tracks are CC0 (public domain). No attribution is legally required, but is
appreciated per the authors' wishes.

- **Pro Sensory (Alex McCulloch)** - "Just include my name Alex McCulloch. Attribution appreciated but not required."
- **Zane Little Music** - A cute chiptune loop for adventure games.
- **skrjablin** - Commodore SID chip chiptune made with Goat Tracker. Loopable. Dual-licensed CC-BY 3.0 and CC0; used here under CC0.

## Sound effects and the risk warning

Original. They are generated in the browser with the Web Audio API from the tables in
`src/components/game/super-voltorb-flip/sound-cues.ts` and ship as code, not audio files. The two
jingle entries in that file (round cleared, round lost) no longer sound; only their lengths are used,
as the round flow's timing.
