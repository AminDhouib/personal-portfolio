# T-6314 evidence: did Indexing API submits lead to crawls? (pool-wide audit)

A read-only audit, 2026-10-22, run by the pool-audit agent for MASTER. It made about 80 GSC `inspect_url` calls and submitted nothing.

- `pool-audit.md`: the full table. Submits dated 2026-10-12 to 10-15 in context/seo/indexing-pool.md, each with at least 7 days elapsed, compared with GSC last_crawl.

Summary: of 328 submits, 63 name exact URLs.
- 3 of those 63 were crawled within 7 days, all on amindhou.com, and the causation is unclear.
- 53 of the 63 are still unknown to Google.
- Excluding the 3, 0 of 60 were crawled. That includes sendly 0 of 48 and BioFlow 0 of 3.

The other 265 submits appear only as counts and could not be scored.

Outcome: MASTER suspended the whole Indexing API pool on 2026-10-22. Apps switched to sitemap resubmits, IndexNow, internal links, and the shared GSC Request-indexing ledger.
