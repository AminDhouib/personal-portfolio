# T-6775 evidence: eslint-config-next 16.4.2 and react-hooks 7.1.1 fixes

PR #190 is live on prod as main 57a469ed (its tree is byte-identical to PR head 8629027c). The container booted around 08:21Z on 2026-10-23.

The checks ran in headed stealth Chrome at 1440x900 with no session. */api/arcade/scores* and */api/leaderboard* were blocked through CDP, and nothing was submitted. Across all pages the console showed 0 errors, 0 warnings and 0 hydration messages (see after-console.txt).

1. Hextris (hextris-*.png): PASS.
   - The start overlay shows, then the tutorial sheet shows on each run.
   - The sound toggle persists in hextris_sound.
   - "Play again" after GAME OVER starts a clean run: score 0, no stale state.
2. Script Knight mute (sk-mute-*.png): PASS. "Sound off" survives a full reload with no hydration warning.
3. Voltorb banner on the /games hub card (banner.png): PASS. Rolled values render with no console entry.
4. Super Voltorb Flip progress (voltorb-*.png): PASS. A saved svf:progress (level 3, 25 coins) is restored after reload.
   - By design only progress is persisted. A mid-round board is not restored; only the Daily restores its board.
5. Daily panel (daily.png): PASS. It shows "Loading." and then settles. "Board unavailable right now" is expected with the block on.
6. Solver (solver.png): PASS. Filling a row's coins and Voltorbs fields moves focus to the next row's coins box.
