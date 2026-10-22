# T-6452 player-name sanitizer (#173), hub regression check on prod 0556ce8c

Headed Chrome on https://amindhou.com/games, 2026-10-22 ~16:05Z. The hub renders normally with the Today strip in view (games-hub-today.jpg). All 8 daily boards read "No runs yet today. Be the first.", and GET /api/arcade/scores?game=hextris&board=daily returned 200 with "entries":[]. So no player name was on screen: the sanitizer behaviour is proven by tests and CI, not on prod, because we do not POST scores.

hextris-board.jpg is the /games/hextris page (200, renders; the leaderboard panel is not shown on the page before a run, so it is not a board view). The board view in this proof is the hub Today strip.

Console errors on the hub and the Hextris page: 0 (page-level hook for window error, unhandledrejection and console.error, self-tested).
