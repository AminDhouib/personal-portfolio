# T-7054 evidence: node 22.23.3 base image, with .nvmrc to match

- PR #203, merged as main a9ddd5f5 + c5d0bfec. It was a rebase-merge with a pinned head SHA, and the main tree equals the PR head tree. CI was green and review-203 approved.
- It carries Dependabot's #201 commit (FROM node:22.23.3-alpine@sha256:0a7108bf...2e402) plus .nvmrc 22.23.3 and a corrected Dockerfile header. #201 was closed as superseded.
- The digest was verified twice against registry-1.docker.io.
- Moving from 22.23.1 picks up 22.23.2, a security release with 10 CVEs (http2, permission, https), and 22.23.3 (OpenSSL 3.5.8, NSS 3.125 roots, an http2 use-after-free fix).
- Deployed via Dokploy compose hnV_k4WYHOmodXzsvQeDk. The new container started at 15:57:58Z.
  - `docker exec ... node -v` prints v22.23.3.
  - The boot log is clean.
  - 10 key pages return 200.

Screenshots (headed stealth Chrome; arcade and leaderboard POSTs refused in-page, nothing played or submitted):
- 1-home.png, 2-games.png, 3-blog.png and 4-home-again.png: client-side navigation via header links, with 0 console errors and no error page.
  - No /monitoring calls fired, because Sentry samples 10% and this run had no sampling override.
  - T-7035's proof an hour earlier showed all-200 /monitoring with forced sampling.
- 5-hextris.png: /games/hextris loads.
  - The /games hub fired the arcade daily-board GETs for every game.
  - A direct GET /api/arcade/scores?game=hextris&board=daily returned 200 with the expected JSON keys.
- 6-script-knight.png: /games/script-knight loads with all controls and 0 errors.
- 7-mobile-home.png: home at 390x844 with 0 errors.
