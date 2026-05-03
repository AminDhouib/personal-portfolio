# Voltorb Flip — HG/SS audio audit

Source: every `PlaySE` / `Sound_SetSceneAndPlayBGM` call in
[pret/pokeheartgold/src/voltorb_flip](https://github.com/pret/pokeheartgold/tree/master/src/voltorb_flip).
Numeric SE IDs from `include/constants/sndseq.h`.

## Background music

| BGM scene | When |
|---|---|
| **64** (`BGM scene 64`) | Set on `NewRound_Begin` (round start) and again on `AwardCoins_Main` start (so the BGM ducks back to it during the payout text). |
| **70** (`BGM scene 70`) | Switched in by `NewRound_TidyUp` once `SLOT01/02` finish playing — i.e. **after** the level-up/level-down jingle. Also restored in `AwardCoins_Main` once payout finishes. |
| **0x46** (`BGM scene 70` decimal) | One-shot at app boot in the main entry — the title splash. |

## Sound effects (per-event, ordered by gameplay flow)

| Phase | SE constant | C trigger | What plays it |
|---|---|---|---|
| Round-start, level went up | `SEQ_SE_GS_SLOT01` | `voltorb_flip.c:635` | Banner shows "Advanced to Game Lv. N!" + this rising chime. |
| Round-start, level went down | `SEQ_SE_GS_SLOT03` | `voltorb_flip.c:640` | "Dropped to Game Lv. N." + falling chime. |
| Cursor moves on the board | `SEQ_SE_DP_SELECT` | `voltorb_flip_input.c:384, 395` | Whenever the focus indicator changes cell. |
| Cursor moves between memo buttons | `SEQ_SE_DP_SELECT` | `voltorb_flip_input.c:235` | While memo overlay is open. |
| Tap an already-flipped tile | `SEQ_SE_DP_BOX03` | `voltorb_flip.c:832, 1754` | "thunk" — invalid action sound. |
| Tap memo toggle | `SEQ_SE_DP_SELECT` | `voltorb_flip.c:840, 1127, 1135, 1191` | Generic confirm. Each cursor/state transition that *succeeds* but is not a final commit. |
| Tap "Quit" button | `SEQ_SE_DP_DECIDE` | `voltorb_flip.c:850, 1141, 1202` | Final-decision tone. |
| Open memo overlay | `SEQ_SE_DP_CARD2` | `voltorb_flip.c:1701` | Card flutter — open. |
| Close memo overlay | `SEQ_SE_DP_CARD2` | `voltorb_flip.c:1713` | Same SE — close. |
| Toggle a memo flag on a tile | `SEQ_SE_DP_BOX01` | `voltorb_flip.c:1758` | "Flip-flap" toggle. |
| Memo "Back" button | `SEQ_SE_DP_BUTTON3` | `voltorb_flip.c:1197` | Back / clear. |
| **Tile flip — about to reveal** | `SEQ_SE_GS_PANERU_MEKURU` | `voltorb_flip.c:916` | Single-tile flip animation start. |
| **Tile flip — anim step 0** | `SEQ_SE_GS_PANERU_MEKURU` | `voltorb_flip.c:1630` | `VFCardFlipAnim_RenderStep` re-emits at `step == 0` for every animated tile (the multi-tile reveal). |
| Reveal animation (whole board, win/lose end) | `SEQ_SE_GS_PANERU_MEKURU` | `voltorb_flip.c:1077` | `RevealBoard_Main` — flips ALL tiles up. |
| Pre-reveal "what are you doing" warning fanfare | `SEQ_ME_CARDGAME1` (fanfare, not SE) | `voltorb_flip.c:905` (via `PlayFanfare`) | Triggered when a row/col is ≥75% voltorb-likely and you're about to flip there anyway. |
| **Voltorb hit (game over)** | `SEQ_SE_GS_COIN_HAZURE` | `voltorb_flip.c:944` | Inside `CardFlipEffect_Main`, only when `type == CARD_TYPE_VOLTORB`. |
| **Tile reveal: any non-voltorb (1/2/3)** | *(no SE — just the PANERU_MEKURU from earlier)* | — | Confirmed: no separate "coin" tone fires per-flip. The coin chime only plays during the post-round payout. |
| Per-coin tally chime (on the "Coins received" banner countup) | `SEQ_SE_GS_OKOZUKAI` | `voltorb_flip.c:1343, 1347` | Plays once every 4 ticks of the counter as it scrolls up; once more on completion. |
| Awarded coins → bank running tally | `SEQ_SE_GS_COIN_PAYOUT_ONE` | `voltorb_flip.c:1048, 1381` | Played at start of the payout banner, then again every 4 coins as they tick down. |
| Awarded coins → final coin in chain | `SEQ_SE_GS_COIN_PAYOUT_LAST` | `voltorb_flip.c:1384` | Closes the payout chain. |

## Timing rules baked into the C

1. **Tile-flip click and reveal are one event in HG/SS.** `PANERU_MEKURU` plays at the start of the flip animation (`step == 0`); the visual anim is what the player perceives as "the flip". There's no separate "click" SE.
2. **Number tiles never play a separate SE.** Revealing a "1", "2", or "3" only emits `PANERU_MEKURU`. The coin jingle is reserved for the post-round payout.
3. **Voltorb hit emits `COIN_HAZURE` *during* the same flip animation** that already played `PANERU_MEKURU` — so a voltorb tile plays two overlapping SE: flip-click + the slow buzzer.
4. **Payout banner has TWO chains:**
   - First chain (`OKOZUKAI`, every 4 ticks) — coin counter scrolls UP showing how many you earned.
   - Second chain (`COIN_PAYOUT_ONE`, every 4 ticks; `COIN_PAYOUT_LAST` once) — coins drain from the banner into the player's wallet.
5. **The "level up/down" SE (`SLOT01` / `SLOT03`)** plays before the new round starts; the gameplay BGM (scene 70) is held off until those finish.

## What our port currently does vs. what HG/SS does

| Event | Current SVF port | HG/SS canonical | Action |
|---|---|---|---|
| Tile flip (any) | `tile-flip.mp3` (PANERU_MEKURU) | Same — `PANERU_MEKURU` on every flip | ✅ matches |
| x1 tile reveal | Plays `tile-flip` (click SE) | No additional SE | ⚠️ Currently we *also* trigger sparkle visual + tile-flip; HG/SS only plays the flip SE. Our visual is a deliberate enhancement; sound is correct. |
| x2 / x3 reveal | Plays `coin-payout-one` immediately | No additional SE — coin SE is for payout banner only | ❌ Move the coin SE to the level-clear payout sequence. Per-tile reveal should only play `tile-flip`. |
| Voltorb hit | Plays `voltorb-pop` (HAZURE) | Plays `PANERU_MEKURU` *and* `HAZURE` overlapping | ⚠️ Should also play the flip SE just before the buzzer. |
| Memo open/close | n/a | `DP_CARD2` | Add wiring. |
| Memo toggle on tile | n/a | `DP_BOX01` | Add wiring. |
| Memo cursor move | n/a | `DP_SELECT` | Add wiring. |
| Tap an already-flipped tile | n/a | `DP_BOX03` | Add wiring. |
| Level cleared | `level-clear` (OKOZUKAI) one-shot | `OKOZUKAI` ticked every 4 frames during counter, then once more | ⚠️ One-shot is OK, but accuracy needs the per-tick animation. |
| Level up / down between rounds | n/a | `SLOT01` / `SLOT03` | Currently no concept of level-up/down — moot for now. |
| Game-over board reveal | n/a | `PANERU_MEKURU` once for whole-board flip | Add at `flipCardsUp` time. |

## Concrete next changes (when you want them)

1. **Move coin SE off the per-tile reveal**, attach it to the post-round level-clear flow. Per-tile keeps only `tile-flip`.
2. **Voltorb hit plays both** `tile-flip` and (~150ms later) `voltorb-pop` so it matches the overlapping HG/SS audio.
3. **Wire memo SE**: add `sfx.memoOpen()` / `sfx.memoClose()` (both `card-flip.mp3`), `sfx.memoToggle()` (we don't have BOX01 yet — need to extract it), `sfx.memoMove()` (`memo-select.mp3`).
4. **Add `sfx.invalidTap()`** for already-flipped tiles (need BOX03).
5. **Per-tick `OKOZUKAI` during the `flipCardsUp` win sequence**, not a single one-shot.
6. **Board-reveal SE** at the start of `flipCardsUp` (`tile-flip.mp3` / PANERU_MEKURU).

Audio file names already wired in `audio.ts`:
`tile-flip`, `coin-payout-one`, `coin-payout-last`, `voltorb-pop`, `level-clear`,
`memo-select`, `card-flip`, `board-reveal`.

To finish the audit's coverage we also need:
- **`SEQ_SE_DP_BOX01`** (memo flag toggle on a tile)
- **`SEQ_SE_DP_BOX03`** (already-flipped tile / invalid tap)
- **`SEQ_SE_GS_SLOT01`** + **`SEQ_SE_GS_SLOT03`** (level up / down) — only if/when level transitions get visualized.
