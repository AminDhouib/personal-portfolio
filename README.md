# T-7002 evidence: live GA4 MAU on /work and the home page

- PR #204, merged as main f0fbb574 + 15ca5466 + 74edbcb4. It was a rebase-merge with a pinned head SHA, and the main tree equals the PR head tree. The tests commit failed 5 of 24 against the old code first. CI was green, and review-204 approved after asking for RUNBOOK and comment fixes.
- Changes:
  - /work/[slug]: no build-time prerender, ISR 3600 s.
  - /: ISR 300 s.
  - ga4.ts: a one-time warning when GA4 is unconfigured at runtime.
  - RUNBOOK warm-up step and a DESIGN register entry.
- Deployed together with #205 as 74edbcb4. The container booted at 17:33:46Z, with no [ga4] warning in its log.

Prod results:
- **/work pages:** all five answered MISS on the first request with `s-maxage=3600`, and carry the "live · last 30 days" badge.
- **/:** the build-time page answered HIT until 17:37:53Z, then STALE, then HIT with 5 `>live<` markers. That is the 300 s window working as designed.

Screenshots (headed stealth Chrome; nothing submitted, arcade POSTs refused in-page):
- 1-home-work-live.png: the home Work cards, each with a "live" marker:
  | Product | Live | Fallback |
  |---|---|---|
  | Shorty | 66.0K | 55.0K |
  | uNotes | 70.5K | 65.0K |
  | Caramel | 10.2K | 3.0K |
  | upup | 8 | 10 |
  | GetItDone | 18 | 5 |
- 2-home-proofbar.png: the ProofBar reads 140K+ users (the live sum of 146.7K, floored). The fallback was 120K+.
- 3-work-shorty.png and 4-work-unotes.png: 66.0K and 70.5K with the live badge.
- 5-nav-games.png: client-side navigation from /work/unotes to / to /games, with 0 console errors.
- 6-mobile-shorty.png: /work/shorty at 390x844.
