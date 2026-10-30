# T-4597 evidence: fan-out umbrella closed

The umbrella task for the 2026-10-19 parallel fan-out. All of its children are COMPLETED, each with its own proof: T-4598 (menu Escape), T-4599 (reduced-motion gating), T-4600 (SSR-hidden reveals), T-4601 (home mobile TBT), T-4602 (PostHog proxy follow-ups), T-4604 (root-files .git in worktrees) and T-5354 (live prove of the batch).

## Final headed check, 2026-10-30 ~05:10Z

`1-solver-1440.png` shows https://amindhou.com/games/super-voltorb-flip/solver in a headed stealth Chrome clone (no session) at 1440 px wide. Read from the live DOM:

- title: "Voltorb Flip Solver and Calculator: Tile Odds — Amin Dhouib"
- meta description: "Free online Voltorb Flip solver and odds calculator. ..."
- JSON-LD types: Person, Organization, WebSite, WebApplication, FAQPage, BreadcrumbList
- PostHog loads only unversioned /_p/4qe/static/*.js?v=1.438.19 (no /static/<ver>/ path requests)

## Search Console (read-only)

- Solver URL inspect: PASS, indexed, canonical self. Last crawl is still 2026-10-15T19:02Z, before #136 shipped on 10-21, so Google has not seen the new title, description or FAQ yet.
- 28 days ending 2026-10-27, solver page: "voltorb flip solver" 56 impressions, 3 clicks, position 5.5. "voltorb flip calculator" still ranks only the game page (10 impressions, position 23.6).

The effect of #136 on "voltorb flip calculator" can only be observed after a recrawl. That is an observation, not open work.
