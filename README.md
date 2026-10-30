# T-10379 evidence: high-advisory overrides + approved zod audit exception

Main f0023be4 (PR #212), deployed with Dokploy compose hnV_k4WYHOmodXzsvQeDk. The deployment
record shows "Commit: f0023be4e7db1f9b2eaab0a7f7c5c0c34c147263", status done, finished
2026-10-30T16:44:52Z.

Post-deploy probes (2026-10-30 16:45Z):
- /api/health: 200 {"status":"ok","uptime":32,"checks":{"db":"connected"}}
- / : 200
- /api/arcade/scores?game=hextris&board=daily: 200 (daily:2026-10-30)

Headed stealth Chrome, 1440 wide, own clone profile, CalculateNativeWinOcclusion disabled:
- Home loaded and was observed for about 79 s: no console errors, no unhandled rejections, no
  resource at or above 400.
- PostHog through /_p/4qe: config.js, /e/, static/surveys.js?v=1.438.19 and
  static/posthog-recorder.js?v=1.438.19, all 200.
- The Amin AI chat panel opens (1-home-chat-open-1440.png): greeting, suggestions, input. No
  message was sent. Still no errors or failed resources after opening it.

CI on main f0023be4: every job green, including both audit jobs for the first time since
2026-10-23. Dependabot alert #20 (zod, GHSA-mrhx-c7xc-m3w5) is dismissed as tolerable_risk under
the approved exception (T-7156), which expires 2026-11-28.
