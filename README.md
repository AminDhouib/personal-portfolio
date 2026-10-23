# T-7017 evidence: client-side navigation crash fixed (posthog-js strict_script_versioning)

## The bug
Live from the 08:58Z deploy (afab354a, posthog-js 1.399 to 1.438) until the 12:30Z hotfix. A client-side navigation away from `/` could show "Something went wrong", with insertBefore and removeChild NotFoundErrors in the console (Sentry PORTFOLIO-Y and PORTFOLIO-Z).

How it happened:
1. posthog-js 1.438 defaults `strict_script_versioning` to 'fallback'. It injects versioned `/static/<ver>/*.js` scripts into `<body>` before hydration.
2. React hydrates next-themes' script fiber onto one of those script nodes.
3. Our self-hosted PostHog answers the versioned path with a 302 to /login, so the script fails to load.
4. On that failure the SDK removes the node, and the next navigation throws.

Before the fix, the crash reproduced in about 3 of 5 stealth Chrome attempts.

## The fix
#198 sets `strict_script_versioning: false` in `posthog.init`. This is the legacy `?v=` URL, with no node removal. A pinning test was written first and failed on the old code. The fix is live as main 93197fad (Dokploy job-4280, container up 2026-10-23 12:30:12Z).

## Proof on prod after the deploy
27 of 27 valid attempts passed. Each attempt was a fresh navigation, a 6 s wait, a real click, then a check 3 s later:

| Browser | Games nav link | Blog footer link |
|---|---|---|
| Stealth Chrome 155 | 10/10 | 3/3 |
| Edge 155 | 11/11 | 3/3 |

Every attempt:
- made no `/static/<ver>/` request;
- loaded every PostHog script in the `?v=` form with a 200;
- removed no `_p/4qe` script and logged no onerror;
- showed the right h1 after the click;
- left `window.__errs` empty.

No new Sentry events arrived after 12:30Z.

## Files
- attempts.txt: the per-attempt log.
- script-log.txt: the script event and resource-timing log.
- edge-raw.txt and edge-profiles.txt: the raw Edge data.
- after-nav-games.png: /games rendered after a client-side navigation.

Not tested: Firefox and Safari. The mechanism is plain DOM and React, so they are expected to behave the same.
