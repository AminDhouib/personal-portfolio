# T-6366 evidence on prod c6457e6f (deploy done 11:29:50Z), 2026-10-22 about 11:33-11:37Z

Code-path proof only. The lead form was never opened and nothing was submitted.

- chunk-lead-catch.png: the deployed chunk https://amindhou.com/_next/static/chunks/0szycfv4s0v9s.js (length 1493209, match at offset 1462831). The page is an excerpt of the chunk's own text with the match highlighted: `async function Nl(e,t){...fetch("/api/leads",{method:"POST",...signal:AbortSignal.timeout(8e3)})...catch(e){return(0,Ns.isNetworkFailure)(e)||reportError(e),{ok:!1}}`. A network failure is not reported to Sentry.
- chunk-isNetworkFailure-regex.png: the imported helper chunk https://amindhou.com/_next/static/chunks/44f1w2niqmpla.js (length 10117, offset 10029): `isNetworkFailure ... t instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed/i.test(t.message)`.
- chunk-proof.txt: the raw search output and the "issue saving your contact details" and collectLead matches.
- Note: the screenshots are rendered excerpts of the live chunk text (the files are one-line minified JS, so scrolling to the snippet was not practical). The URL and fetch time are on each image.
