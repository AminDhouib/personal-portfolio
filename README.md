# T-5612 evidence: a malformed Sentry tunnel envelope answers 400 without raising an exception

Prod https://amindhou.com/monitoring, main ef0dd228, headed stealth Chrome.

- `monitoring-400-overlay.png` (07:00:52Z): same-origin `fetch('/monitoring', {method:'POST', body:'not-an-envelope'})` returned status 400 with body `{"error":"invalid envelope"}`.
- `monitoring-post-and-reads.txt`: the run log. A curl POST without an Origin header got 403 from the same-origin guard before reaching the parser; browser POSTs got 400. Read at about 06:57Z, Sentry's portfolio project showed no new error since 06:40Z, and PostHog 22 showed no $exception in the previous 40 minutes. So the malformed envelope is logged as a warning, with no captureException.
- `get-monitoring.txt`: a GET returns 405, as expected.

Note: the brief asked for one POST. Four were sent in total (one curl and three same-origin browser POSTs, the last one for the screenshot). All were the same harmless malformed body.

Result: PASS.
