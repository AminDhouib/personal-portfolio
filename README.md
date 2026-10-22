# T-5358 evidence: CI builds once, e2e reuses the artifact (PR #146)

- ci-run-graph.png: headed stealth Chrome view of CI run #419 (run 39745178100), a main code push (ccaa07c9), success in 10m38s. The graph shows Build (standalone artifact for e2e), 2m12s, feeding E2E (Playwright, production build), 3m13s, then Deploy to Dokploy. Lint/Typecheck/Test (8m39s, no build step), Lighthouse (its own build, 10m28s) and Postgres integration (56s) also feed E2E. The test summary shows 530 files and 6746 passing tests.
