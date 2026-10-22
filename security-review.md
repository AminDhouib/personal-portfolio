# T-6169 security review (read-only), main = ef0dd228

Method: read the code at ef0dd228 (git archive to a scratch dir), ran the real
@copilotkit/runtime 1.77.0 code from node_modules against copilot-envelope.ts and rate-limit.ts
copied from ef0dd228. No repo edits, no traffic to prod. A live Next dev server never answered on
this machine, so nothing below was run against a live Next server or prod.
Dependabot: `gh api .../dependabot/alerts` open count = 0.

Ranked findings (HIGH first). F = finding.

## F1. HIGH: envelope `body` sent as a JSON string bypasses every cap and the tool allow-list

- Location: src/lib/copilot-envelope.ts:100-132 (`const run = envelope.body; if (isRecord(run)) {...}`).
- Request: POST /api/copilotkit with a same-origin Origin header and body
  `{"method":"agent/run","params":{"agentId":"default"},"body":"<RunAgentInput as a JSON string>"}`.
- What happens:
  - The sanitizer sees a string, so isRecord(run) is false and it skips the message-count, char,
    context and tool checks. It returns ok and forwards the envelope.
  - The runtime's createJsonRequest passes a string body through unchanged (serializeJsonBody in
    single-route-helpers.mjs), and parseRunRequest parses it (agent-utils.mjs:218-231).
  - In my test, 301 messages, a `system` message, an `evilTool`, 50 KB of context and 100 KB of
    state all reached the parsed run input (parseRunRequest returned them). The object form of the
    same input got 413 "conversation too long".
  - Only the 512 KiB body cap remains: about 175k input tokens per request at 20 requests per
    minute per key. That is the exact attack T-5525 was meant to close.
- Related gap on the object form: `state` and `forwardedProps` are never checked. A 100 KB `state`
  passed. The agent injects `state` into the system prompt (agent/index.mjs:536-538), so it
  sidesteps the 8,000-char context cap.
- Register: not covered. DESIGN.md:953-977 says the caps hold.
- Fix: in sanitizeCopilotEnvelope, return 400 when `method` is agent/run, agent/suggest or
  agent/connect and envelope.body is not an object. Cap serializedLength(run.state) and
  run.forwardedProps too.
- Pinning tests: (a) a string `body` returns 400 or 413; (b) a property test that for each body
  shape the caps hold on what createJsonRequest produces; (c) an oversized `state` returns 413.

## F2. HIGH: the envelope `method` is not restricted, so any visitor can read other visitors' chat threads

- Location: src/lib/copilot-envelope.ts:92 (no `method` check); src/app/api/copilotkit/route.ts:81-111.
- Request: `{"method":"resource/request","params":{"path":"/threads?agentId=default","httpMethod":"GET"}}`.
  No thread id is needed.
- What happens: the route builds `new CopilotRuntime()` with the default in-memory runner, whose
  thread store is a module-level global shared by all visitors (in-memory.mjs:266-267 `sharedStore`).
  Against the real runtime, after a "victim" run containing a name and email:
  - /threads?agentId=default listed the victim's thread id.
  - /threads/<id>/messages returned the victim's text.
  - /threads/<id>/events returned the full run input, including any collectLead arguments.
  - /threads/clear with POST returned 204 (wipes everyone's history).
- Limits: one request per read, within 20 per minute per key, same-origin header required (curl can
  send it). My PoC used a stub agent instead of BuiltInAgent; the thread store lives in the runner,
  so that does not change the result.
- Register: partly. DESIGN.md:972-975 records "Not restricted: the envelope's method (the runtime
  also serves transcribe, resource/request and the inspector methods; the byte cap bounds them)".
  It frames this as a cost issue; the cross-visitor data disclosure is not recorded.
- Fix: allow-list `method` to the four the site uses (table below): info, agent/run,
  agent/connect, agent/stop. Return 400 for anything else, including a missing or non-string method.
- Pinning tests: resource/request, transcribe, inspector/metadata, inspector/learning and
  trajectory/connect each return 400; the four allowed methods pass through unchanged.
- Verify in a browser after the change: open the widget, send a message, check suggestion chips and
  a collectLead round trip.

### Methods the site's own client sends

The site mounts `<CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint showDevConsole={false}>`
at src/components/chat/widget-panel.tsx:109 and src/components/chat/ai-page-chat.tsx:32. It uses
CopilotPopup / CopilotChat, useCopilotChatSuggestions, useCopilotReadable and one useCopilotAction
(collectLead, src/hooks/use-lead-collector-action.ts:53). No useThreads, no transcription, no
inspector in src/.

| Method | Sent by client? | Evidence |
|---|---|---|
| info | Yes, on connect | @copilotkit/core dist/index.mjs:1323 and :1354; route.integration.test.ts:214; copilot-envelope.test.ts:95 |
| agent/run | Yes, every chat turn | core dist/index.mjs:1238; route.integration.test.ts:136; route.test.ts:81; copilot-envelope.test.ts:35 |
| agent/connect | Yes (CopilotChat calls copilotkit.connectAgent) | core dist/index.mjs:1198; react-core dist/index.mjs:58; react-core dist/copilotkit-CP9qPAqV.mjs:9072 and :9153. Keep allowed. |
| agent/stop | Yes, when the user aborts | core dist/index.mjs:1075; copilot-envelope.test.ts:96 |
| agent/suggest | No | In single transport suggestions clone the agent and call agent/run with the copilotkitSuggest tool (core dist/index.mjs:2660-2672, useStateless needs runtimeTransport !== "single"). That is why copilotkitSuggest is on the tool allow-list. |
| resource/request | No | Only for thread and memory paths (core dist/index.mjs:1435-1490); the site has no thread or memory hooks. |
| inspector/metadata | No | Sent only if /info returns inspectorMetadata: true (core dist/index.mjs:2347); runtime sets it only for Intelligence runtimes (runtime get-runtime-info.mjs:97-100). |
| transcribe | No | No microphone or transcription code in src/; /info reports audioFileTranscriptionEnabled false without a transcriptionService. |
| trajectory/connect | No | CopilotKit trajectory feature; not used by the site. |

## F3. MEDIUM: the in-memory thread store keeps up to 512 MiB of attacker-chosen content

- Source: @copilotkit/runtime dist/v2/runtime/runner/in-memory.mjs:8-12 (1000 threads, 100 runs per
  thread, 512 MiB, least-recently-used eviction). The route uses `new CopilotRuntime()` with the
  default runner; the store is a module-level global. route.integration.test.ts also notes "The
  runtime keeps run state per thread id in a process-wide store".
- Request: repeated agent/run envelopes with distinct threadId values. A run keeps its input in the
  store (my PoC showed it in the RUN_STARTED event). With F1 each input can be up to 512 KiB, so
  memory grows until eviction at 512 MiB.
- Impact: memory pressure on the app container. No memory limit seen in compose.yml. A restart also
  resets the lead email counter (F6).
- Register: not covered.
- Fix: build the runtime with a small-limit InMemoryAgentRunner, or stop retaining history. Do it
  together with F1 and F2.
- Test: after N runs the store size stays under a small bound.

## F4. MEDIUM: a direct-to-origin client picks its own rate-limit key (T-5533)

- Location: src/lib/rate-limit.ts getClientIp. Precedence:
  1. CF-Connecting-IP, validated by isIP, no %zone, 45-char cap, trimmed, then canonicalised (IPv6 to
     /64, IPv4-mapped to IPv4).
  2. The rightmost X-Forwarded-For entry, only if it is an address.
  3. "unknown".
  X-Real-Ip is ignored.
- Exploit: a direct request with `CF-Connecting-IP: <any IP>` gets a fresh bucket every time. I
  confirmed getClientIp returns the forged value. That evades the chat (20/min), leads (5/min),
  arcade POST (10/min), PG2 POST (10/min) and monitoring (60/min) limits. Chat is the costly one:
  with F1 and F3 each request can be about 175k tokens.
- Register: covered by T-5533 and DESIGN.md:1697. Only the firewall or authenticated origin pulls
  close it.
- Fixable in the app meanwhile:
  - Process-wide ceilings per route, keyed with a constant (src/lib/arcade/failover-gates.ts:174
    already does this for replays).
  - A global rate or row cap on leads: src/lib/leads-store.ts:20-26 has no cap or dedupe, so forged
    keys can store unlimited rows. Emails are capped; rows are not.
- Memory/CPU: the key map is bounded at 10,000 keys; 200k unique keys took about 1.5 s total, so a
  key flood is not a CPU or memory problem.

## F5. MEDIUM: a direct attacker can burn a specific victim's budget (T-5533)

- Request: 25 requests with `CF-Connecting-IP: <victim IP>`. Result: the victim's next real request
  got allowed:false, retryAfter 60.
- Impact: locks a known IP out of chat, leads and scores, including everyone behind a shared NAT.
- Register: T-5533. A global ceiling does not help; only closing the origin does.

## F6. MEDIUM: the lead email cap can be exhausted by one real IP

- Location: src/app/api/leads/route.ts:19-48 (LEAD_EMAIL_DAILY_CAP = 50, takeEmailSlot).
- Request: POST /api/leads at 5 per minute from one IP uses all 50 slots in about 10 minutes. After
  that leads are stored but not emailed; the only signal is a logWarn (route.ts:129). Forged keys
  (F4) make it instant.
- The cap itself is sound: the slot is taken synchronously before the await, the day rolls over, a
  failed send releases its slot, and subject, reply and HTML body are sanitised (src/lib/sendly.ts).
- The collectLead path cannot be driven server-side: the tool handler runs in the visitor's browser
  and POSTs /api/leads (src/hooks/use-lead-collector-action.ts:29). A direct attacker just posts to
  /api/leads, which is F6 plus F4.
- Register: not covered; the comment names spam, not notification starvation.
- Fix: send one "cap reached, N leads stored" email, or reserve slots for distinct emails.
- Test: after 50 slots the next lead still produces one notice.

## F7. LOW: eviction at 10,000 keys also resets shared global buckets

- Location: src/lib/rate-limit.ts MAX_BUCKETS, least-recently-used eviction.
- 10,001 other keys evicted a spent bucket and it became allowed again. That includes
  failover-replay:<gen>:all, the process-wide CPU cap on replays (30/min).
- Needs forged keys, so T-5533 covers it. Cheap hardening: keep global buckets in a separate map
  that is never evicted.

## F8. LOW: each RUN_ERROR frame becomes a Sentry event

- Location: src/lib/copilot-run-error-tap.ts:62-69 (captureException per frame with the frame
  message).
- With forged keys and a payload that makes the upstream fail, event volume is unbounded. Add dedupe
  or a cap in the tap.

## F9. LOW: getBlogPost(slug) does not validate the slug

- Location: src/lib/blog.ts:30-34.
- path.join(BLOG_DIR, "../../README.md") resolves outside the blog directory. Checked at the path
  level only, not through Next's %2F decoding.
- Impact is small: only .md or .mdx files are read, and .dockerignore strips *.md except content/**
  from the image.
- Fix: validate slug against getAllBlogSlugs().
- Test: a slug containing / or .. returns null.

## F10. INFO

- serializeJsonLd (src/lib/structured-data.ts:21-23) escapes only `<`. U+2028 and U+2029 stay raw,
  which has no effect because ld+json is not executed as JavaScript.
- src/app/blog/[slug]/page.tsx:105 repeats the same `<` escape inline instead of calling
  serializeJsonLd.
- src/lib/player-name.ts leaves U+2800, U+3164, U+00AD and variation selectors, so a PG2 name can
  render blank. Cosmetic.
- PG2 validation is hand-rolled in src/app/api/password-game-2/leaderboard/route.ts:63-68 and
  :156-173. The persistence-schemas.ts zod schemas cover only the legacy password-game file.

## Areas that came back clean, and what I checked

Password Game 2 leaderboard SQL (route.ts, pg2-leaderboard.ts, player-name.ts)
- Every pool.query and client.query (route.ts:100-225, pg2-leaderboard.ts:77-98) uses $n
  placeholders. The only template interpolation is the constant SELECT_COLUMNS. I also grepped all
  of src/ for `.query(` followed by a template with `${`: the only hits were that constant and a
  CI-only test with a numeric literal.
- ORDER BY and LIMIT are fixed text or bound parameters; there is no identifier interpolation.
- Input checks: seed must be an integer in 0..2^32-1 and ?seed= must match ^\d{1,10}$; timeMs is
  range-checked 10,000..3,600,000; daily must be strictly true and, if true, an accepted daily seed;
  name is capped at 16 characters with C0/C1, bidi and zero-width characters stripped (so NUL cannot
  reach Postgres); the POST body is capped at 16 KiB by guardedJsonRoute.
- No dangerouslySetInnerHTML renders a name anywhere in src/.

JSON-LD and inline scripts
- All dangerouslySetInnerHTML uses in src/ are the 10 JSON-LD scripts. I ran the real
  serializeJsonLd body on `</script><script>`, `<!--` and `</SCRIPT`: no `<` survived and the output
  parsed back to the same data.
- Inputs are static src/data, repo MDX frontmatter, and a slug that must resolve to a real file.
- The GA4 id appears only in next/script templates (src/components/analytics/google-analytics.tsx).
  I did not check how it is set in the deploy env, so I cannot rule out that it is controllable
  there.

Chat route body-size cap order
- guardRequest (origin plus rate limit) reads only headers. readCappedBody then stream-reads against
  512 KiB (read-capped-body.ts:17-50), cancelling without awaiting. Only after that does JSON.parse
  run (copilot-envelope.ts:95). API routes also bypass proxy.ts (T-5526).

Error and stack leakage
- The route returns sanitizeCopilotErrors(tapRunErrors(response)) (route.ts:193).
- Status 400 and above becomes the generic body, which covers the runtime's 400 `details:
  error.message` (agent-utils.mjs:223-226) and 500 `message: error.message` (handle-run.mjs). RUN_ERROR
  frames are replaced, and an unparseable line that names RUN_ERROR fails closed. A handler throw
  gives a generic 500 after captureException. Server-side console.error stacks stay in logs.
- The 503 body names only a variable. I found no leak path.

Rate limiter parsing
- Header validation is strict (isIP, no %zone, 45-char cap, trimmed).
- A 300k-case IPv6 fuzz (about 109k valid addresses) produced no exceptions or malformed keys.
  Addresses in the same /64 shared a key, and ::ffff:a.b.c.d folded onto IPv4.
- A direct attacker cannot force the "unknown" bucket if Traefik appends its peer address to
  X-Forwarded-For. I did not verify Traefik's behaviour.

System and developer messages
- BuiltInAgent drops them unless forwardSystemMessages / forwardDeveloperMessages is set
  (agent/index.mjs:289-296, 541-542). Running convertMessagesToVercelAISDKMessages on a system, a
  developer and a user message with no flags returned only the user message. The sanitizer also
  strips them. Client tools reach the model only as tool definitions; I found no server-side
  execution.

Dependabot
- `gh api repos/AminDhouib/personal-portfolio/dependabot/alerts` returned 0 open alerts.

## Cleanup

Scratch files are only under /tmp/sec-poc and /tmp/sec-ef0dd228. A `next dev` I started on port 3999
under a 420 s timeout should have exited on its own. The repo, node_modules and git status are
unchanged (the untracked docs/superpowers/ was already there).
