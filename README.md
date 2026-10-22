# T-5531 evidence: PostHog proxy forwards exact capture paths only, and capture still ingests

Prod https://amindhou.com, main ef0dd228 (deploy finished 2026-10-22 06:45:05Z), headed stealth Chrome, desktop 1440 px.

- `capture-overlay.png` (07:00:44Z, fresh load): an overlay of performance resource entries under /_p/4qe on the live page. Capture `/_p/4qe/e/` returned 200 (fetch); `config.js`, `posthog-recorder.js` and `surveys.js` returned 200 (script). The project key is redacted as `<key>`.
- `capture-requests.txt` (06:54Z load): capture `/_p/4qe/i/v0/e/` returned 200. The other capture spelling is covered too.
- `posthog22-pageviews.txt`: a HogQL query on PostHog project 22 (read-only, 06:57Z) shows the $pageview for `https://amindhou.com/` at 06:54:02 with `$lib_custom_api_host` /_p/4qe, so events ingest through the proxy. There were no $exception rows.

Result: PASS.
