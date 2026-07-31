/**
 * Forwards CopilotKit chat-run failures to Sentry.
 *
 * A failed chat run is not an HTTP failure. The AG-UI endpoint answers 200,
 * reports the failure *inside* the SSE body as a `data: {"type":"RUN_ERROR"}`
 * frame, and then completes the stream normally. Nothing throws, so no catch
 * block anywhere sees it and Sentry stays silent -- which is how the 60s
 * deadline bug (module-scope CopilotRuntime) ran dead in production for days
 * without raising a single event.
 *
 * The installed @copilotkit/runtime 1.54.1 offers no usable hook for this, and
 * that was checked in the package rather than assumed:
 *   - `CopilotRuntime`'s `onError` option is declared on the constructor type
 *     but never read anywhere in copilot-runtime.ts, and its own doc comment
 *     calls it a paid Copilot Cloud feature that needs a publicApiKey.
 *   - the `observability_c` hooks are stored on the instance, but every call
 *     site (`logObservabilityBeforeRequest` / `AfterRequest`) is still a
 *     commented-out TODO.
 *   - `createCopilotEndpointSingleRoute`, which actually serves this route,
 *     accepts only { runtime, basePath, cors }.
 * So the stream is read here instead.
 *
 * The body is tee'd: one branch goes back to the client untouched, the other is
 * drained concurrently by this module. The client is never blocked on the scan
 * and never sees a modified byte.
 */

import { captureException, logWarn } from "@/lib/log";
import { safeJsonParse } from "@/lib/safe-json";

const SCOPE = "copilotkit:run-error";

/**
 * Only bounds a pathological stream that never sends a newline; real frames are
 * a few hundred bytes. Without this, a malformed upstream could grow `pending`
 * for the lifetime of the request.
 */
const MAX_PENDING_CHARS = 64 * 1024;

/**
 * The encoder writes `data: ${JSON.stringify(event)}\n\n` as a *string*, so the
 * stream yields strings here rather than bytes. Uint8Array is still handled:
 * the branch costs one `typeof` and stops this from breaking if a future
 * version encodes binary (the encoder already has an `encodeBinary` path).
 */
type SseChunk = Uint8Array | string;

interface RunErrorFrame {
  type?: string;
  message?: string;
  code?: string;
}

function reportRunError(frame: RunErrorFrame): void {
  const code = frame.code ? ` [${frame.code}]` : "";
  const error = new Error(
    `CopilotKit chat run failed${code}: ${frame.message ?? "no message provided"}`,
  );
  // Groups these under their own Sentry issue instead of a generic Error.
  error.name = "CopilotRunError";
  captureException(SCOPE, error);
}

function inspectLine(line: string): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const payload = trimmed.slice("data:".length).trim();
  if (!payload) return;

  // Reported through logWarn, not the usual server `captureException`: this is
  // a passive observer of someone else's wire format, so a frame we cannot
  // parse is not itself an incident. Routing it to Sentry would turn one
  // upstream format change into an alert storm on every chat.
  const frame = safeJsonParse<RunErrorFrame>(payload, SCOPE, null, (scope, err) =>
    logWarn(scope, "ignored an unparseable SSE frame", err),
  );

  if (frame?.type === "RUN_ERROR") reportRunError(frame);
}

/**
 * Reads the mirrored branch to completion, reporting any RUN_ERROR frame.
 * Never rejects: it is a side channel, and a failure to observe the stream must
 * not affect the request.
 */
async function drainAndReport(stream: ReadableStream<SseChunk>): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;

      pending += typeof value === "string" ? value : decoder.decode(value, { stream: true });

      // Frames can straddle chunk boundaries, so only whole lines are parsed
      // and the remainder is carried into the next read.
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        inspectLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }

      if (pending.length > MAX_PENDING_CHARS) pending = "";
    }

    // A final frame with no trailing newline would otherwise be dropped.
    inspectLine(pending);
  } catch (error) {
    // A read failure here (client aborted, upstream reset) says nothing about
    // whether the chat run itself succeeded, so it is a log rather than a
    // Sentry event -- otherwise every cancelled chat would page someone.
    logWarn(SCOPE, "stopped reading the mirrored chat stream", error);
  }
}

/**
 * Returns a response that streams identically to `response`, while any
 * RUN_ERROR frame in the body is forwarded to Sentry.
 *
 * Non-SSE responses (the 503 config error, the guard rejections) are returned
 * as-is, by identity: they carry no run events, and leaving them untouched
 * keeps this off the error paths entirely.
 */
export function tapRunErrors(response: Response): Response {
  const body = response.body;
  if (!body) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return response;
  }

  const [clientBranch, watchBranch] = body.tee();
  void drainAndReport(watchBranch);

  return new Response(clientBranch, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
