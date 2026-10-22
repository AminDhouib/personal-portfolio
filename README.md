# T-6413 player names strip invisible fillers, headed read-only look on prod 553b89ae

At the time of the proof every prod board was empty ("No runs yet today"; leaderboard GETs return {"entries":[]}), so no player name was on screen and the not-empty assertion is vacuous (names.txt). The Password Game 2 board only renders on the end-of-run receipt, so pg2-leaderboard-read.png shows the page with an injected overlay of the GET results, not a rendered board. The name stripping itself is covered by tests; this does not demonstrate it on prod. Nothing was posted.
