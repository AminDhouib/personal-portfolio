# T-6824 evidence: Super Voltorb Flip follow-ups

- PR #206, merged as main da57b3dc (5 commits, tests first). It was a rebase-merge with a pinned head SHA, and the main tree equals the PR head tree. CI was green and review approved.
- Deployed via Dokploy compose hnV_k4WYHOmodXzsvQeDk. The container booted at 18:13:20Z with a clean log.
- Changes:
  - How to play: Escape now plays the animated exit.
  - flipCardsDown: folds any board width (?size=2..10).
  - Removed dead code: prevLevelRef and the null game Footer.
  - Removed the stale Settings comment.
  - The CSS chrome, CoinSpinner, labels, memo glyphs, sprite and music are untouched.

Prod measurements (headed stealth Chrome, in-page MutationObserver plus a 30 ms sampler; tool latency of about 1 s makes the timed screenshots show end states, so the timings below are the evidence):

**Item 1, How to play Escape.** On a real CDP Escape keypress the backdrop went `svf-modal-open`, then `svf-modal-closing` (about 186 ms), then was removed. The Settings control behaves the same way.

**Item 4, fold-down after a Quit with no coins and Enter.** Whole columns fold left to right about 200 ms apart, with no stray revealed tiles at the end:

| Board | Columns folded at (ms) | Final state |
|---|---|---|
| ?size=7 | 1373, 1587, 1785, 1985, 2169, 2370, 2584 | 49 face down, 0 revealed |
| ?size=3 | 452, 667, 841 | all face down |
| ?size=5 (control) | 902, 1118, 1321, 1502, 1716 | all face down, unchanged behaviour |

Other checks:
- The real Voltorb sprite renders.
- "Made by JV" is absent; the only footer is the site footer.
- 0 console errors.
- 0 arcade or leaderboard POST attempts.

Screenshots:
- 1-escape-closing.png and 2-escape-gone.png: How to play dismissed.
- 3-size7-revealed.png: the revealed 7x7 board with "You quit with no coins."
- 4-size7-fold-300.png, 5-size7-fold-700.png, 6-size7-redealt.png, 7-size3-fold.png and 8-size5-fold.png: end states after the fold (see the timing note above).
