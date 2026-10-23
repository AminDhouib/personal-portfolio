# T-6765 evidence: space-shooter split, no behavior change

Refactor PRs #179 (1b5a5cbd) and #182 (2f94881c, 48fddac1), live on prod in main f780cdfa (Dokploy job-4182, container booted 2026-10-23 07:55:52Z).

Headed stealth Chrome, 1440x900, no session, with */api/arcade/scores* and */api/leaderboard* blocked through CDP (no score was submitted).

- before-*.png: prod a5387668, taken before the split was deployed.
- after-*.png: prod f780cdfa.
- compare-*.png: before (left) beside after (right) for each state: armed, playing, pause, dead, shop.

Result: no visible difference beyond run-dependent values (score 311 vs 285, kills 5 vs 4, coins +1 vs +2, each with a matching pickup count). Layout, buttons, achievements, shop tabs and items are identical.
Console: 0 errors in both runs. THREE.Clock deprecation warnings appear in both (6 before, 5 after), with the same text; this is pre-existing.
