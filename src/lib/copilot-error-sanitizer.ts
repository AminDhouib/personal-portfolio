/**
 * Keeps CopilotKit's error text away from the visitor.
 *
 * Two paths carry it. A failed chat run is not an HTTP failure: the AG-UI endpoint answers 200 and
 * reports the failure inside the SSE body as a `RUN_ERROR` frame whose `message` is whatever the
 * upstream or the runtime said (an OpenRouter error body, a stack-shaped string). And a runtime
 * rejection (bad envelope, internal error) is a 4xx/5xx JSON body with its own message. Both are
 * replaced here with one generic message; the detail is logged server-side instead.
 *
 * Logging of the stream path is not duplicated: `tapRunErrors` (copilot-run-error-tap.ts) is
 * handed the raw response first and forwards each RUN_ERROR frame, detail included, to Sentry.
 * This module runs on what that tap returns, so it only rewrites what the client receives. It
 * changes no model, retry or proxy behaviour, and every frame that is not RUN_ERROR passes through
 * byte for byte.
 */

import { logError } from "@/lib/log";

export const GENERIC_CHAT_ERROR = "The assistant ran into a problem. Please try again.";

const SCOPE = "copilotkit:error-response";

/** How much of an error body is logged; a hostile upstream could send megabytes. */
const MAX_LOGGED_BODY_CHARS = 2000;

/**
 * A line longer than this is dropped rather than scanned. Real AG-UI frames are well under a few
 * KB; the bound exists so a stream that never sends a newline cannot grow the buffer for the life
 * of the request, and dropping fails closed (an unscanned line could be an error frame).
 */
const MAX_LINE_CHARS = 1024 * 1024;

type SseChunk = Uint8Array | string;

const STREAM_ERROR_FRAME = {
  type: "RUN_ERROR",
  message: GENERIC_CHAT_ERROR,
  code: "chat_error",
} as const;

function genericFrame(timestamp: number | undefined): string {
  return JSON.stringify(
    timestamp === undefined ? STREAM_ERROR_FRAME : { ...STREAM_ERROR_FRAME, timestamp },
  );
}

/**
 * Rewrites one SSE line (no trailing newline). Only `data:` lines mentioning RUN_ERROR are parsed;
 * everything else is returned as is. A line that mentions RUN_ERROR but does not parse is replaced
 * too, since it is exactly the shape an error frame would have.
 */
function sanitizeLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:") || !trimmed.includes("RUN_ERROR")) return line;

  const cr = line.endsWith("\r") ? "\r" : "";
  const payload = trimmed.slice("data:".length).trim();
  let frame: { type?: unknown; timestamp?: unknown } | null;
  try {
    frame = JSON.parse(payload) as { type?: unknown; timestamp?: unknown } | null;
  } catch {
    // silent-ok: an unparseable line that names RUN_ERROR is replaced below, not forwarded
    return `data: ${genericFrame(undefined)}${cr}`;
  }
  if (frame === null || typeof frame !== "object" || frame.type !== "RUN_ERROR") return line;
  const timestamp = typeof frame.timestamp === "number" ? frame.timestamp : undefined;
  return `data: ${genericFrame(timestamp)}${cr}`;
}

function sanitizeStream(body: ReadableStream<SseChunk>): ReadableStream<SseChunk> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let binary = false;
  let pending = "";
  let discarding = false;

  const emit = (controller: TransformStreamDefaultController<SseChunk>, text: string) => {
    if (text === "") return;
    controller.enqueue(binary ? encoder.encode(text) : text);
  };

  return body.pipeThrough(
    new TransformStream<SseChunk, SseChunk>({
      transform(chunk, controller) {
        if (typeof chunk === "string") pending += chunk;
        else {
          binary = true;
          pending += decoder.decode(chunk, { stream: true });
        }

        let out = "";
        let newline = pending.indexOf("\n");
        while (newline !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (discarding) discarding = false;
          else out += `${sanitizeLine(line)}\n`;
          newline = pending.indexOf("\n");
        }
        emit(controller, out);

        if (pending.length > MAX_LINE_CHARS) {
          pending = "";
          discarding = true;
        }
      },
      flush(controller) {
        if (!discarding && pending !== "") emit(controller, sanitizeLine(pending));
      },
    }),
  );
}

/**
 * Returns `response` with its error text replaced. A successful non-stream response is returned by
 * identity; an event stream is rewritten frame by frame as it flows (a complete frame is never
 * held back waiting for the next); an error status gets a generic JSON body and the original is
 * logged.
 */
export async function sanitizeCopilotErrors(response: Response): Promise<Response> {
  const isStream = (response.headers.get("content-type") ?? "").includes("text/event-stream");

  if (isStream) {
    if (!response.body) return response;
    return new Response(sanitizeStream(response.body as ReadableStream<SseChunk>), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  if (response.status < 400) return response;

  let detail: string;
  try {
    detail = (await response.text()).slice(0, MAX_LOGGED_BODY_CHARS);
  } catch {
    // silent-ok: the body could not be read, so there is no detail to log; the client still gets
    // the generic error below
    detail = "[unreadable body]";
  }
  logError(SCOPE, `chat endpoint answered ${response.status}`, detail);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify({ error: GENERIC_CHAT_ERROR }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
