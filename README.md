# T-5526 stream-read body caps (PR #143, merge b669e075), prod 0556ce8c

Honest scope: the cap behaviour (a body over the limit is rejected while streaming) is proven by the unit tests and CI, NOT on prod, because proving it live would need a write POST, which is off limits. This proof only shows the paths the change must not break.

- curl-health.txt (2026-10-22T16:08Z): GET /api/health -> 200; GET /api/health/ -> 308 redirect to https://amindhou.com/api/health. That is the proxy skipping /api paths without a trailing slash, with the slash redirect intact.
- games-hub-arcade-gets-200.jpg: headed /games hub; its Today strip read GET /api/arcade/scores for 7 games plus the Password Game 2 leaderboard, all 200 (PerformanceResourceTiming overlay, injected for the screenshot). The Hextris page itself makes no scores request on load, so the hub was used. /api reads work after the change.
- ci-and-tests.txt: PR #143 checks 4 passed, 0 failed; b669e075 is an ancestor of 0556ce8c; green main run 39804924428 for 0556ce8c, all six jobs success; test file src/lib/__tests__/read-capped-body.test.ts (listed with git ls-tree on origin/main).
Console errors on the hub: 0.
