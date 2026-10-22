# T-6312 evidence: IndexNow key hosted and URLs submitted (PR #152)

Prod on main 64ce3c5e (deployed 2026-10-22T09:01:43Z).

- indexnow-key.png: headed browser view of https://amindhou.com/924e95a6967d10429f3fa42b3c3a2975.txt. The body is exactly the 32-char key.
- key-curl.txt: curl -i of the key URL: HTTP 200, text/plain, Content-Length 32.
- indexnow-submit.json: IndexNow submit at 09:11Z for /ai, /reviews, /games/script-knight and /blog/a-codebase-that-explains-itself: submitted 4, skipped 0, HTTP 202, verdict ok.
