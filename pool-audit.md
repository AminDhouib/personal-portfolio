# T-6314 Indexing API pool audit (read-only), run 2026-10-22

Method: log in context/seo/indexing-pool.md plus per-app queue files (sendly-submissions-2026-10-12..15.md, personal-portfolio queue in Temp/games). Window = submits dated 2026-10-12..10-15. Only inspect_url was called; nothing was submitted. Crawled within 7d = last_crawl >= submit time and <= submit + 7d.

## 1. Resolvable URLs (exact URLs known): 63 submits, all 63 inspected (no sampling needed)

### sendly (sc-domain:sendly.now): 48 submits, all docs.sendly.now, via submit_url
Log lines: 10-12 08:06Z, 10-13 07:57Z, 10-14 07:51Z, 10-15 08:07Z, 12 each.
- Crawled within 7d: 0. Crawled any time after submit: 0.
- Still unknown to Google (fetch_error, last_crawl null): 41.
- Pre-existing crawl (not indexed), crawl date before the submit and no recrawl since: 7.
  - 10-12: domains/deleteDomain (crawl 09-28), domains/getDomain (09-24)
  - 10-13: emails/sendEmail (09-24), emails/sendEmailBatch (09-24), api-reference/errors (08-17)
  - 10-14: lists/subscribeToList (09-26), suppression/listSuppressions (09-26)
- Unknown per batch: 10-12 = 10 of 12; 10-13 = 9 of 12; 10-14 = 10 of 12; 10-15 = 12 of 12.
- Same-site comparison (NOT submitted): webhooks/createWebhook and webhooks/listWebhooks are also never crawled. Submitted and unsubmitted unknown pages behave the same (zero crawls). webhooks/deleteWebhook (never submitted) was crawled 09-25 and is indexed.
- Extra, outside the window (10-11 04:08Z submits): docs.sendly.now/ crawled 10-15 03:22Z (4.9d), integrations/microsoft-copilot crawled 10-15 05:56Z (4.9d), integrations/slack crawled 10-17 20:29Z (6.7d), changelog never crawled.

### personal-portfolio (sc-domain:amindhou.com): 12 submits via submit_url (3/day)
| URL | submitted | last_crawl | category | crawled within 7d |
|---|---|---|---|---|
| /games/failover | 10-12 | 2026-10-19T00:16Z | indexed | yes (6.7d) |
| /games/script-knight | 10-12 | none | fetch_error | no (resubmitted 10-19, 10-22) |
| /games/super-voltorb-flip/solver | 10-12 | 2026-10-15T19:02Z | indexed | yes (3.4d), confounded: a server-rendered link from /games was added 10-15 16:12Z |
| /games/password-game/hints | 10-13 | 2026-10-16T23:59Z | indexed | yes (3.7d) |
| /games/typing-speed | 10-13 | none | fetch_error | no (resubmitted 10-20) |
| /games/tower-stacker | 10-13 | none | fetch_error | no (resubmitted 10-20) |
| /games/space-shooter | 10-14 | none | fetch_error | no (resubmitted 10-20) |
| /games/password-game | 10-14 | none | fetch_error | no (resubmitted 10-21) |
| /ai | 10-14 | none | fetch_error | no (resubmitted 10-19, 10-22) |
| /reviews | 10-15 | none | fetch_error | no |
| /blog | 10-15 | none | fetch_error | no (resubmitted 10-21) |
| /blog/a-codebase-that-explains-itself | 10-15 | none | fetch_error | no (resubmitted 10-18, 10-22) |
- Crawled within 7d: 3 of 12. Crawled any time after: 3 of 12. Unknown: 9. No pre-existing crawl on any of the 12.
- Not-submitted comparison (already-indexed pages, so not like-for-like): /games/hextris crawled 10-15 18:56Z (6 minutes before the solver crawl, same pass), /work 10-20, /work/upup 10-11, /blog/5-apps-5-lessons 09-21. The solver crawl looks like part of a site-wide Googlebot pass on 10-15 ~19:00Z, not clearly submit-driven.

### BioFlow (sc-domain:getbioflow.com): 3 submits on 10-13 (named in the 10-20 log line)
- /what-is-linktree, /about, /apps: all still never crawled (fetch_error) 9 days later. Crawled within 7d: 0.

## 2. Unresolvable (count only in the log, no URLs, no queue file): 265 submits, not scored
GetItDone 5, shorty 48, upup 20, superbooks 20, devino-landing-page 20, demofy 19, shop.devino.ca 11, dodomain 12, notifly 12, safemeet 12, snapvisor 12, unotes 12, stealth 11, uptimely 11, upAPI 10, voicelabs 8, dokploy-community 7, BioFlow 3 (the other 3 BioFlow submits are resolved above), anotifier 5, uprank 4.
Qualitative signals from later log lines for those apps:
- devino-landing-page: 4 service pages resubmitted 5 times 10-17..10-21, still never fetched; its 10-15 line says 9 of 11 candidates were unknown to GSC.
- stealth: /bot-detection submitted 6 times 10-16..10-21, never crawled (already suspended 10-21).
- demofy: /use-cases/help-center-videos and /url-to-demo-video never fetched after 6+ submits.
- unotes: 10-19 line says 3 of the 10-14 submits were still unknown to Google 5 days later.
- dodomain: /glossary/dns-propagation still unknown after the 10-16 submit.

## 3. Too recent (submits 10-16 and later): not evaluated
Includes snapvisor's 36 submits from 10-20..10-22, all unknown to Google on 10-22.

## Totals
- Resolvable in window: 63, inspected 63. About 80 inspect calls in total including the 10-11 extras and controls (budget 150 not exceeded).
- Crawled within 7 days of submit: 3 of 63 (5%), all amindhou.com, one confounded by a new internal link.
- Crawled any time after submit: 3 of 63.
- Still unknown to Google: 53 of 63 (41 sendly, 9 portfolio, 3 BioFlow). 7 sendly pages had a crawl before the submit and were not recrawled.
- Unresolvable: 265 submits, cannot be scored.

## Conclusion
Of the 63 submits that can be checked, 3 (5%) were crawled within 7 days and 0 of the 51 sendly and BioFlow URLs were crawled, so the evidence supports MASTER zeroing the pool; the 265 unscorable submits cannot add to or contradict it.

Caveat: a crawl after a submit does not prove the submit caused it. Googlebot crawls on its own (unsubmitted /games/hextris and /work were crawled in the same period), and unsubmitted sendly pages stayed uncrawled just like submitted ones, which points to submits having no effect.
