# T-6255 adversarial re-review of PR #149 (head e139aaed, base ef0dd228), read-only

Method: loaded `git show e139aaed:src/lib/copilot-envelope.ts` into a temp dir outside the repo
(only the safeJsonParse import stubbed with an equivalent JSON.parse wrapper). Ran it (a) alone,
and (b) in front of the REAL @copilotkit/runtime 1.77.0 from node_modules, rebuilt the way
route.ts does it (sanitize, new Request from the sanitized body, new CopilotRuntime per request,
copilotRuntimeNextJSAppRouterEndpoint, default in-memory runner, BuiltInAgent). The language model
was a stub that records the prompt it is given, so "what the model would be billed for" is
measured, not guessed. route.ts is byte-identical between ef0dd228 and e139aaed. Not run against a
live Next server or prod. No repo edits, no pushes.

## VERDICTS

F1 (caps and allow-list bypass): PARTIAL. The JSON-string body, `state`, `forwardedProps` and
non-array `context` holes are closed. A `resume` field in the run body is still uncapped and a
300 KB payload reaches the model prompt (B1 below). Everything else I tried is blocked.

F2 (method unrestricted, cross-visitor thread read): FIXED for the disclosure path. Every method
outside the allow-list is 400, no served response lists thread ids, and the documented
known-UUID residual is confirmed (B2, B3 below). One extra residual the author did not document:
agent/run with someone else's threadId overwrites what a later agent/connect replays for it.

## B1. resume is an uncapped channel into the model prompt (MEDIUM-HIGH; part of F1, not fixed)

- Where: src/lib/copilot-envelope.ts (head) checks messages, context, state, forwardedProps,
  tools, but not `resume`. The runtime copies each resume entry's payload into a tool-result
  message appended to the model prompt (@copilotkit/runtime dist/agent/index.mjs, the
  `resumeEntries` block after `convertMessagesToVercelAISDKMessages`).
- Exact request (same-origin Origin header, 20/min per key):
  {"method":"agent/run","params":{"agentId":"default"},"body":{"threadId":"t","runId":"r",
  "state":{},"forwardedProps":{},"context":[],"tools":[],
  "messages":[{"id":"u","role":"user","content":"hi"},{"id":"as1","role":"assistant","content":"",
  "toolCalls":[{"id":"call1","type":"function","function":{"name":"collectLead","arguments":"{}"}}]}],
  "resume":[{"interruptId":"call1","status":"resolved","payload":{"x":"<300000 y>"}}]}}
- Result with the real runtime: sanitizer ok; model prompt = 300,307 characters (baseline 57).
  With no matching tool call (interruptId "nomatch") the prompt was still 300,187 characters.
  The matched form is a valid assistant tool call plus tool result pair, so a real provider
  should accept it; I did not send anything to a real provider. Ceiling is the 512 KiB body cap,
  about 125k tokens per request: the same class of cost the caps were meant to remove.
- The site never sends it: `resume` is only used by CopilotKit's interrupt flow
  (@copilotkit/core dist/index.mjs:3528-3581). The site has no useInterrupt, no
  renderAndWaitForResponse, and collectLead is a plain handler action
  (src/hooks/use-lead-collector-action.ts:53-87). The 120k message cap is bypassed the same way.
- Fix: in the run branch, `delete run.resume` (or 413 when serializedLength(run.resume) is over a
  few hundred characters). Dropping it is safe for the current client.
- Pinning test: an agent/run with a 10 KB resume payload gets 413 (or arrives without the field),
  and the integration test asserts the model-facing prompt stays under a small bound.

## B2. Known-threadId replay and stop (LOW given UUID v4; confirmed, as documented)

Thread ids are uuid v4 generated in the browser (@copilotkit/shared utils/random-id.mjs:7-9,
react-core copilotkit-CP9qPAqV.mjs:138 and :230), so they are not guessable.
- agent/connect with the victim's threadId replays the whole thread: 900 bytes of events
  containing the victim's text ("jane@example.com" present in the replay). With an unknown id:
  HTTP 200 with an empty body (so a guessed id is distinguishable from a real one, but only by
  guessing).
- agent/stop with a known id on an idle thread: 200 {"stopped":false,...}; same shape for an
  unknown id, no existence oracle there. Stopping a RUNNING thread needs its id and works as the
  author says.
- Nothing served lists ids: info (keys: version, agents, audioFileTranscriptionEnabled, mode,
  threadEndpoints, singleRoute, suggestions, a2uiEnabled, openGenerativeUIEnabled,
  telemetryDisabled), inspector/metadata (204), agent/run (own thread), agent/connect (own id),
  agent/stop (echoes the id the caller sent). I found no response that exposes another visitor's id.
- Note: info still advertises singleRoute.resourceOperations: true and threadEndpoints, which is
  harmless now that resource/request is refused.

## B3. Undocumented residual: agent/run on someone else's threadId rewrites their replay (LOW)

With the victim's threadId, an attacker agent/run (own messages) succeeds; a following
agent/connect on that threadId replays the attacker's text (verified: replay contains
"ATTACKER WROTE THIS"). Needs the UUID, so same exposure class as B2, but DESIGN.md's residual
paragraph mentions only replay and stop. Worth one more sentence there. Fix, if wanted, is
server-issued session binding (as the author says), or a per-thread owner map.

## B4. Method ruling: inspector/metadata (author is wrong about "always advertised")

impl-pra's claim: get-runtime-info.mjs:100 always advertises `inspectorMetadata: true`, so the
client always requests it. Checked against the code and by running the real handler:
- get-runtime-info.mjs:97-100 puts `inspectorMetadata: true` inside
  `...isIntelligenceRuntime(runtime) && webEnabled ? { intelligence: {...}, inspectorMetadata: true, ... } : {}`.
  This route uses the default runner and no CopilotKitIntelligence, so the spread is empty.
- Real `info` through the route pipeline returned `inspectorMetadata: undefined` (key list above).
- The client only requests it when `runtimeInfoResponse.inspectorMetadata === true`
  (@copilotkit/core dist/index.mjs:2347, gate at :1971-1975). So this site never sends
  inspector/metadata. My original table was right.
- Impact of keeping it: none. The handler returns an empty 204 for a non-Intelligence runtime
  (handle-inspector-metadata.mjs:14-19, confirmed 204 here). Allowed methods that need no body.
- Ruling: remove it for the tightest list (methods the client sends: info, agent/run,
  agent/connect, agent/stop), or keep it as a harmless extra; either is safe. But the code
  comment, the DESIGN.md text ("on provider mount") and the test name ("which the chat sends on
  load") state something false and should be corrected either way.

## Everything I tried that is blocked (exact request shapes; all confirmed)

Method (envelope-only runs, all 400 "unsupported method" unless noted):
- Case/whitespace/lookalike: "Agent/Run", " agent/run", "agent/run ", "agent/run\u0000",
  "agent/run" with a zero-width space, Cyrillic-lookalike "agent/rսn", "AGENT/RUN", "agent//run",
  "/agent/run".
- Wrong type: method as array ["agent/run"], ["resource/request"], object {"toString":...},
  number, true, null, empty string, missing.
- Not on the list: resource/request, transcribe, agent/suggest, inspector/learning,
  trajectory/connect, threads/list.
- Duplicate key `{"method":"resource/request","method":"agent/run",...}`: JSON.parse takes the
  last (agent/run), the sanitizer forwards a re-serialised envelope with exactly one `method`
  key, so the runtime sees what the sanitizer saw. The reverse order is rejected. A unicode-escaped
  key (method) and a __proto__ key do not smuggle a method.
Body:
- agent/run and agent/connect with body as string, array, null, or missing: 400 "invalid body".
  An object that merely looks like a Buffer ({"type":"Buffer","data":[...]}) passes the sanitizer
  and is rejected by the runtime's zod parse; it is an ordinary object with no payload effect.
- agent/stop: no body OK; string body 400; null body 400; {"runId":...} OK. The runtime itself
  400s any stop body with a key other than runId.
- info with a string body 400; with an object body up to the byte cap it passes and the runtime
  ignores it (no model call, bounded by 512 KiB).
- Object wrapping a string: `messages` as a 400 KB string or as an object passes the sanitizer
  and the runtime's zod rejects it (HTTP 400, no model call).
params smuggling: params.path / params.httpMethod / params.body on info or agent/run are ignored
(only agentId and, for stop, threadId are read). An unknown agentId gets the runtime's 404.
Caps:
- state 8001 chars, state as 4000-element array, state as a 9000-char string: all 413. A
  7.9K state reaches the model as an 8,157-char prompt, so the cap works as intended.
- forwardedProps with toolChoice plus 2.1K padding: 413. toolChoice/model/maxOutputTokens inside
  the cap: accepted and ignored (prompt unchanged at 57 chars; BuiltInAgent has no overridable
  properties).
- context as a 9000-char string or object: 413 (new "whatever its type" check works). 7.8K array
  context reaches the model as a 7,929-char prompt.
- system/developer messages: dropped, "SYS-INJECT" never reached the model.
- 60 copies of collectLead at 7.9 KB each: pass the sanitizer, but the runtime keys tools by name
  (convertToolsToVercelAITools builds an object by name), so the model saw one collectLead; the
  prompt stayed at 57 chars. Bounded.
- An unknown 400 KB run field ("junk"): passes the sanitizer, ignored by zod, prompt 57 chars.
- Top-level envelope `forwardedProps` (outside body) with mcpServers [{endpoint:
  http://169.254.169.254/}] on info and on agent/run: runs normally, no MCP fetch (the route has
  no createMCPClient). forwardedProps.mcpServers inside the run body: same.
- User message with an image URL part: accepted by the sanitizer. In my harness the stub model
  reported no native URL support, so the AI SDK tried to download it itself and refused the
  metadata IP ("URL with IP address 169.254.169.254 is not allowed"). The real
  @ai-sdk/openai chat model declares URL support for images, so I expect the URL goes to the
  provider instead of being fetched by this server; I did not verify that. The site has no image
  upload. INFO only.
Order of checks: the 512 KiB stream-read cap (route.ts, readCappedBody) runs before JSON.parse,
and within the sanitizer the method check runs before any body check, so no oversized body is
parsed past the byte cap.

## Notes on the PR's tests (no code changes made)

copilot-envelope.test.ts and the integration test cover method refusals, string body, state and
forwardedProps caps and agent/connect; none exercise `resume`, so B1 is untested. Suggested test:
a run with {"resume":[...10 KB payload...]} returns 413 (or has the field removed) in
copilot-envelope.test.ts, plus an integration assertion on the upstream request size.

## Cleanup

Scratch only under /tmp/sec-rr (env.ts, m1.mjs, m2.mjs, m3.mjs, out_*.txt). Repo, node_modules
and git status untouched.

## ADDENDUM: head moved to f46dd1d7 (commits 9dc96261, e139aaed, 1129e26d, f46dd1d7)

Diff e139aaed..f46dd1d7 changes src/lib/copilot-envelope.ts by 7 lines only: `inspector/metadata`
is removed from COPILOT_ALLOWED_METHODS. Nothing about `resume` changed.

- Allow-list is now exactly info, agent/run, agent/connect, agent/stop. Re-run of the sanitizer
  on f46dd1d7: those four OK; inspector/metadata, resource/request, transcribe, agent/suggest
  each 400 "unsupported method"; string body 400; state 8001 chars 413.
- Safety of refusing inspector/metadata: CONFIRMED. @copilotkit/core dist/index.mjs:2013-2021:
  `if (response.status === 204 || !response.ok) return;` inside the request, and the surrounding
  try/catch sets `nextMetadata = void 0` on any rejection, so a 400 is treated as "no metadata"
  exactly like the 204. Also this site never sends it at all, because it is only requested when
  info advertises inspectorMetadata: true (core dist/index.mjs:2347), which this runtime does not.
- Stale wording still in the head (cosmetic): copilot-envelope.ts:23 says "(info,
  inspector/metadata, stop) pass through after the method check"; the comment at :76 and
  DESIGN.md:987 say the client "asks for it on load", which is not true for this runtime (it never
  asks, per the point above); copilot-envelope.test.ts:265 still says "info and inspector/metadata
  on load".
- F1 stays PARTIAL: `resume` is still uncapped on f46dd1d7. Sanitizer result for an agent/run
  with a 300 KB resume payload: OK (passes). The 300,307-char model prompt measured earlier was
  on e139aaed with an identical run branch (no resume handling was added in the later commits),
  so it applies. agent/connect with a resume payload also passes, but connect makes no model call.
- F2 stays FIXED, with the same B2/B3 residuals.

## ADDENDUM 2: head e504fc7b (findForbidden walker, COPILOT_MAX_DEPTH = 32, try/catch backstop)

Re-ran m5, m6, m8, m9, m11, the m2 end-to-end set, plus new m12/m13 against
`git show e504fc7b:src/lib/copilot-envelope.ts` with the real runtime parser and a stub model.

- F1 resume: FIXED. 300 KB / null / [] resume on agent/run and agent/connect 400; duplicate and
  escaped resume keys 400; `__proto__:{resume}` now 400 "unsupported field" (m6, m8 end to end:
  SANITIZER 400, no model call). Envelope-level / params / agent/stop resume still pass but the
  runtime never reads them (unchanged, harmless).
- __proto__ (any depth): FIXED. 400 for: top of body, envelope level, params, messages[0],
  toolCalls item, tools[].parameters, state, array-inside-state, and the unicode-escaped spelling.
  The walker uses Object.keys on the parsed value, so escapes are covered. A string VALUE
  "__proto__" and a `constructor` key are accepted (inert, as established). m9 (state / context /
  tools / forwardedProps / messages via __proto__): all 400.
- Deep nesting: FIXED. Depth 5,000 and 250,000 arrays in context, messages[].content and params
  all 400 "nested too deeply" (no throw). Walk of 120k nested arrays took 36 ms. Boundary: an
  object chain through state is accepted up to depth 33 and rejected at 34 (off by one against the
  documented 32, cosmetic). 100k empty objects in state are 413 (size cap). Regression set
  (string body, state 8001, forwardedProps 2100, context string, inspector/metadata,
  resource/request, 60 x collectLead, system message drop, image URL) all as before.
- Residuals unchanged: known-UUID agent/connect replay (PII visible), agent/stop, and
  agent/run overwriting another thread's replay (B2/B3).

(a) Can a legitimate CopilotKit 1.77 request exceed depth 32? No, from what the site sends. Counting
the envelope as depth 1, the deepest real shape is the suggestions run: body > tools[] > tool >
parameters > properties > suggestions > items > properties > title = depth 10 (copilotkitSuggest
schema, core dist/index.mjs:2888-2913). collectLead parameters are about 6, an assistant message
with toolCalls is 7, forwardedProps.toolChoice 4, context items 4, state is `{}`. The measured
legit suggestions-run envelope was depth 10, accepted. Margin is 3x. A tool schema with deeply
nested object properties would only exceed 32 if the site added one (it has none; extra tools are
dropped anyway), and useCoAgent shared state is not used by the site (state is `{}`).

(b) Other special keys in the runtime's zod parse? None found beyond `__proto__`. Probing a
harmless key at every level (m13) shows RunAgentInput is passthrough EVERYWHERE: top level,
messages (user, assistant, tool), toolCalls and toolCall.function, tools and tools[].parameters,
context items, state, forwardedProps and message.metadata all KEEP unknown keys. So any hazard
comes from key assignment semantics, and `__proto__` is the only name with magic assignment
behaviour (`constructor`, `prototype` verified inert). Related, not key tricks but worth knowing:
- tools[].parameters of the two allowed tools is fully client-controlled JSON Schema (8,000-char
  cap). The runtime compiles it into a validator that runs on the model's tool-call arguments, so a
  hostile `pattern` could make validation slow (ReDoS) if the model were steered to emit
  matching arguments. Not tested, LOW. Mitigation if wanted: replace allowed tools' definitions with
  the server's own copy instead of the client's.
- Unknown keys are kept and forwarded (for example a 400 KB junk field), but they are not sent
  to the model (prompt stayed 57 chars) and are bounded by the 512 KiB body cap.

Verdicts at e504fc7b: F1 FIXED, F2 FIXED (known-UUID residuals documented), __proto__ OPEN->FIXED,
deep nesting FIXED, resume FIXED. No bypass found.
