# T-6982 evidence: versioned PostHog static bundle URLs map onto the flat files

Main 874b9cbf (PR #214, on top of 11e9766b), deployed with Dokploy compose hnV_k4WYHOmodXzsvQeDk.
The deployment record shows "Commit: 874b9cbf701d62fda07169cc56569c2c47e7acf5", status done,
finished 2026-10-30T18:05:55Z.

Post-deploy probes (2026-10-30 18:07Z, redirects not followed):
- /api/health: 200 {"status":"ok","uptime":71,"checks":{"db":"connected"}}
- / : 200
- /api/arcade/scores?game=hextris&board=daily: 200
- /_p/4qe/static/1.438.19/surveys.js: 200 text/javascript, 102100 bytes (before this change the
  versioned path fell through to PostHog and was redirected to /login)
- /_p/4qe/static/surveys.js (flat): 200 text/javascript, 102100 bytes, the same file
- /_p/4qe/static/1.438.19/surveys.js?v=1: 200 text/javascript
- /_p/4qe/static/1.438.19-beta.1/surveys.js: 302 to /login, the designed prerelease fall-through
  to the generic /static/:path* rule

Headed stealth Chrome, 1440 wide, own clone profile, CalculateNativeWinOcclusion disabled:
- Home loaded; PostHog through /_p/4qe: config.js, /e/, static/surveys.js?v=1.438.19 and
  static/posthog-recorder.js?v=1.438.19, all 200 (strict_script_versioning stays false, T-7017).
- Client-side navigation by clicking Next links in one document (one navigation entry for the
  whole run): / -> /games -> /reviews -> / -> /blog/quality-gates-that-earn-their-keep -> / ->
  /work/shorty -> /. No window errors, no unhandled rejections, no console.error (no
  insertBefore/removeChild), and all 11 /_p/4qe requests returned 200.
- 1-home-after-client-nav-1440.png: home after the navigation run.
- 2-versioned-surveys-js-1440.png: the versioned bundle URL served as JavaScript in the browser.
