# T-6766 evidence: Super Voltorb Flip split, no behavior change

Refactor PRs #180 (790aa505, bcc5eeaa, 14f954bb) and #183 (f780cdfa), live on prod in main f780cdfa (Dokploy job-4182, container booted 2026-10-23 07:55:52Z).

Headed stealth Chrome, 1440x900, no session, with */api/arcade/scores* and */api/leaderboard* blocked through CDP (nothing was submitted).

- before-*.png: prod a5387668.
- after-*.png: prod f780cdfa.
- compare-*.png: before beside after for the board, flipped, memo, instructions and daily states.
- zoom-header-*.png: header crops.
- after-extra-round-lost.png: a Level 1 round lost to a mis-read clue during the proof. It was not submitted.

Result: the only differences are the random board (clue numbers and tile values), the animated coin-spinner frame and the animated header gradient. The CSS chrome, memo bar, dialog and Voltorb sprite are identical. The Daily panel shows "Board unavailable right now" in both runs, because of the request block.
Console: 0 errors and 0 warnings in both runs.
