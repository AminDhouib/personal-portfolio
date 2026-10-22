# T-6361 evidence on prod c6457e6f (deploy done 11:29:50Z), 2026-10-22 about 11:35-11:40Z

Headed stealth Chrome, desktop 1440x900. /api/arcade/scores blocked in the browser via CDP Network.setBlockedURLs, set before navigation. No score POST was attempted and nothing reached prod.

## Full run (the path the fix covers)
- run-end-state.png: /games/space-shooter, Play clicked, ship destroyed after 13 s (score 372). The game-over screen shows TOP PILOTS with "Could not load the board", the read-error state of the blocked board GET.
- run-network-console.txt: the block was confirmed by a probe fetch that rejected. The request list shows GET /api/arcade/scores?probe=1 and GET /api/arcade/scores?game=space-shooter&board=all-time, both blocked (status 0), and no POST. No pilot name was typed and Submit was not clicked. Page and console errors: 0, so no unhandled "Failed to fetch".

## Earlier page-load check (same day)
- space-shooter-blocked.png and leaderboard-area.png: page load alone makes no /api/arcade request; kept for reference.

## Sentry
- sentry-after.txt (11:38Z) plus the re-check noted in the report: PORTFOLIO-V stays at 1 event (2026-10-22T09:11:16Z). That event matches my earlier Play run at about 09:11Z with scores blocked, before this fix.
