# T-6749: security hotfix headed proof on prod

Prod is compose hnV_k4WYHOmodXzsvQeDk, deployment tIoHHczm3sHkdbBSvg-wB of main a5387668 (#176). It was done at 2026-10-23T03:09:28Z, outside the 23:55-00:05Z window. /api/health showed uptime 885 s at 03:24:14Z. The boot log says "Next.js 16.4.2".

Proof was taken in headed stealth Chrome at about 03:25Z:
- home-desktop.png: the home page renders.
- games-desktop.png: /games renders.
- version.txt: window.next.version is 16.4.2 and window.__SENTRY__.version is 10.76.2. /_next/static/chunks/333eij9az5mu1.js returns 200. x-powered-by is absent, because Next 16 does not send it by default.
- monitoring.txt: ONE client_report-only envelope to /monitoring returned 200. No error event was sent.
- image.txt: /_next/image for profile.png at w=640 returned 200 as image/avif, and 4 /_next/image requests on / returned 200.
- console.txt: 0 errors on / and /games. One THREE.Clock deprecation warning on /. three.js was not changed by #176.

Checks:
- SHADOW post-deploy tally is 0, and failover.verify was empty.
- Sentry org devino has no new amindhou.com issue.
- PostHog 22 received the proof's 2 pageviews at 03:25Z, so capture works on the new build.
- GSC check_alerts returned no alerts.
