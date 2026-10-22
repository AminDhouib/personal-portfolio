# T-6414 PG2 leaderboard POST validation moved to zod, same answers

Prod 553b89ae. Leaderboard GETs return 200 {"entries":[]} (probe.txt); pg2-leaderboard-get-200.png has an injected overlay with those values, and the board UI itself only renders on the end-of-run receipt, so it was not on screen. The POST behaviour is pinned by 104 tests and a review differential; prod is not POSTed by rule.

CI: the run for 553b89ae itself (39802340707) was cancelled by the next push (ci-run-553b89ae-cancelled.png), and so was the run for its descendant 69f36d79 (39803308616). ci-run-0556ce8c-green.png is the green main run 39804924428 (CI #475) for 0556ce8c, which contains 553b89ae (git merge-base --is-ancestor: yes): all six jobs success, 11m 54s. That is CI evidence for a descendant, not for 553b89ae itself.
