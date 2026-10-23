# T-7035 evidence: the Sentry ESM injection hook's whole import closure is traced into standalone

- PR #202, merged as main e57a861c + bc32fa7c. It was a rebase-merge with a pinned head SHA, and the main tree equals the PR head tree. CI was green on the PR and on main. review-202 approved after asking for one change (the root package.json globs).
- It widens `outputFileTracingIncludes["/*"]` to cover:
  - @sentry/core `build/esm`;
  - @sentry/server-utils `orchestrion/config`;
  - @sentry/conventions `dist/{index,attributes,op}.mjs`;
  - each package's root package.json.
- Deployed via Dokploy compose hnV_k4WYHOmodXzsvQeDk. The new container booted at 15:19:43Z.

Prod results:
- **Boot log is clean.** The full log since boot is 5 Next.js lines, with no `Cannot find module .../@sentry/core/build/esm/index.js`. That error was there on the #199 container.
- **Server db spans are back in Sentry.** pg-pool.connect and arcade_scores SELECT spans appear at 15:20:52Z, 15:21:12Z and 15:21:14Z, and pg2 ensure-step spans appear later. No db span arrived between the Sentry 11 deploy at 13:14Z and this deploy.
- **Client-side navigation is clean.** The route was home to /games to /blog to home, using header-link clicks after a more than 4 s wait. There were 0 console errors and no error page, and every /monitoring request returned 200.

Screenshots (headed stealth Chrome):
- 1-home.png, 2-games.png, 3-blog.png and 4-home-again.png: the client-side navigation route.
- 5-hextris.png: /games/hextris loads. Nothing was played or submitted.
- 6-sentry-db-spans.png: Sentry Explore, db spans from the new container.
