# T-6399 Sentry tunnel answers a malformed envelope with 400

Fix d13f89c5, live since deploy ef0dd228 at 06:45Z; prod today is 45b9948d. The Sentry issues PORTFOLIO-R and PORTFOLIO-T predate the fix.

One same-origin POST to /monitoring with body "x\n{}" and content-type application/x-sentry-envelope, sent at 2026-10-22T14:03:26.959Z from a headed browser on https://amindhou.com/: status 400, body {"error":"invalid envelope"} (probe.txt). No other request was sent.

tunnel-malformed-400.png: the text box over the page was injected by execute_script to show those live values; it is not part of the site.
