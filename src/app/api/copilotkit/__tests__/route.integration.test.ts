// @vitest-environment node
/**
 * Integration pin for POST /api/copilotkit against the REAL @copilotkit/runtime.
 *
 * route.test.ts mocks the runtime, so it can only prove the route's own wiring.
 * It cannot notice the runtime changing under it: the wire shape the client
 * sends, how the default agent reaches the language model, how a failed run is
 * reported. This file runs the shipped runtime end to end and stubs only the
 * network -- `fetch` answers OpenRouter's chat-completions URL with a canned
 * stream and throws for any other URL, so a dependency bump that starts calling
 * somewhere new fails loudly here instead of reaching the internet.
 *
 * The request envelopes below are the single-route shapes the installed client
 * (ProxiedCopilotRuntimeAgent in @copilotkitnext/core, now @copilotkit/core) really sends: a JSON POST of
 * `{ method, params?, body? }` where `body` is an AG-UI RunAgentInput.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// The runtime reads its telemetry switches once, at import, so they are set in
// a hoisted block that runs before the route (and the runtime) is imported.
vi.hoisted(() => {
  process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
});

const mockCaptureException = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  captureException: mockCaptureException,
  logWarn: mockLogWarn,
}));

import { POST } from "../route";
import { GAMES } from "@/app/games/games-meta";
import { buildAminAiSystemPrompt } from "@/lib/amin-ai-prompt";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

type UpstreamCall = { url: string; init: RequestInit | undefined; body: unknown };
type Upstream = (call: UpstreamCall) => Response | Promise<Response>;

const encoder = new TextEncoder();

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1,
    model: "anthropic/claude-haiku-4.5",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

/** An OpenAI-compatible chat-completions SSE stream that says `text`. */
function completionStream(text: string): Response {
  const frames = [
    chunk({ role: "assistant", content: "" }),
    ...text.split(" ").map((word, i) => chunk({ content: i === 0 ? word : ` ${word}` })),
    chunk({}, "stop"),
    "data: [DONE]\n\n",
  ];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** A stream that starts fine and then dies mid-flight. */
function brokenStream(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(chunk({ role: "assistant", content: "Par" })));
    },
    pull(controller) {
      controller.error(new Error("upstream socket reset"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

let upstreamCalls: UpstreamCall[] = [];
let blockedUrls: string[] = [];
let upstream: Upstream = () => completionStream("Hello from the fake model");

function installFetch(): void {
  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== CHAT_URL) {
      blockedUrls.push(url);
      throw new Error(`integration test: unexpected network call to ${url}`);
    }
    // Honour abort the way real fetch does, so a signal that was already dead
    // when the upstream call was made fails here too.
    if (init?.signal?.aborted) throw init.signal.reason ?? new Error("aborted");
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const call = { url, init, body };
    upstreamCalls.push(call);
    return upstream(call);
  };
  vi.stubGlobal("fetch", fake);
}

let ipCounter = 0;

function makeReq(envelope: unknown, signal?: AbortSignal): NextRequest {
  ipCounter += 1;
  return new NextRequest("https://amindhou.com/api/copilotkit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      origin: "https://amindhou.com",
      "x-forwarded-host": "amindhou.com",
      "x-forwarded-for": `10.77.0.${ipCounter}`,
    },
    body: JSON.stringify(envelope),
    ...(signal ? { signal } : {}),
  });
}

// The runtime keeps run state per thread id in a process-wide store, so every
// run gets its own thread, as a real chat does.
let runCounter = 0;

/** The agent/run envelope the client sends for one chat turn. */
function runEnvelope(text: string, runId = `run-${(runCounter += 1)}`) {
  return {
    method: "agent/run",
    params: { agentId: "default" },
    body: {
      threadId: `thread-${runId}`,
      runId,
      state: {},
      messages: [{ id: `msg-${runId}`, role: "user", content: text }],
      tools: [],
      context: [],
      forwardedProps: {},
    },
  };
}

type AgUiEvent = { type: string; [key: string]: unknown };

/**
 * Reads a response body to the end. The AG-UI encoder enqueues strings, not
 * bytes (see the note in copilot-run-error-tap.ts), and Response.text() throws
 * on a non-Uint8Array chunk, so the reader is driven by hand.
 */
async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out +=
      typeof value === "string" ? value : decoder.decode(value as Uint8Array, { stream: true });
  }
  return out;
}

function parseSse(text: string): AgUiEvent[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length).trim()) as AgUiEvent);
}

/**
 * The tap's observer drains its own tee branch, so give it a macrotask to
 * catch up before asserting on what it reported.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("POST /api/copilotkit (real @copilotkit/runtime, stubbed network)", () => {
  const saved: Record<string, string | undefined> = {};
  const envKeys = ["OPENROUTER_KEY", "COPILOTKIT_TELEMETRY_DISABLED", "DO_NOT_TRACK"];

  beforeEach(() => {
    for (const key of envKeys) saved[key] = process.env[key];
    process.env.OPENROUTER_KEY = "test-key-integration";
    // Keeps the runtime's own telemetry off the (stubbed) network, so the
    // "no unexpected URL" assertions below are about the chat path only.
    process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
    upstreamCalls = [];
    blockedUrls = [];
    upstream = () => completionStream("Hello from the fake model");
    mockCaptureException.mockClear();
    mockLogWarn.mockClear();
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("answers the info discovery request with the default agent", async () => {
    const response = await POST(makeReq({ method: "info" }));

    expect(response.status).toBe(200);
    const info = (await response.json()) as { agents: Record<string, unknown>; mode?: string };
    expect(Object.keys(info.agents)).toContain("default");
    // Discovery never talks to the model.
    expect(upstreamCalls).toHaveLength(0);
    expect(blockedUrls).toEqual([]);
  });

  it("calls OpenRouter chat completions with the Haiku model and the grounded system prompt first", async () => {
    const response = await POST(makeReq(runEnvelope("Who is Amin?")));
    await readBody(response);

    expect(upstreamCalls).toHaveLength(1);
    const call = upstreamCalls[0];
    if (!call) throw new Error("expected one upstream call");
    expect(call.url).toBe(CHAT_URL);

    const body = call.body as {
      model: string;
      stream?: boolean;
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe("anthropic/claude-haiku-4.5");
    expect(body.stream).toBe(true);

    const first = body.messages[0];
    expect(first?.role).toBe("system");
    expect(first?.content).toContain(buildAminAiSystemPrompt(GAMES));
    // The visitor's turn is still there, after the system prompt.
    expect(JSON.stringify(body.messages.slice(1))).toContain("Who is Amin?");

    const headers = new Headers(call.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key-integration");
    expect(blockedUrls).toEqual([]);
  });

  it("streams the assistant text back as AG-UI events and finishes the run", async () => {
    const response = await POST(makeReq(runEnvelope("Say hello")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSse(await readBody(response));
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("RUN_STARTED");
    expect(types).toContain("TEXT_MESSAGE_START");
    expect(types).toContain("TEXT_MESSAGE_END");
    expect(types.at(-1)).toBe("RUN_FINISHED");
    expect(types).not.toContain("RUN_ERROR");

    const text = events
      .filter((e) => e.type === "TEXT_MESSAGE_CONTENT" || e.type === "TEXT_MESSAGE_CHUNK")
      .map((e) => String(e.delta ?? ""))
      .join("");
    expect(text).toBe("Hello from the fake model");

    await settle();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("reports an upstream HTTP error as a RUN_ERROR frame in a 200 response and forwards it to Sentry", async () => {
    // 400, not 500: the AI SDK retries 5xx and 429 with backoff (several seconds
    // of wall clock), which would only slow this test down without changing
    // what it pins -- a non-OK upstream answer ends the run in a RUN_ERROR frame.
    upstream = () =>
      new Response(JSON.stringify({ error: { message: "upstream rejected the request" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

    const response = await POST(makeReq(runEnvelope("This will fail")));
    expect(response.status).toBe(200);

    const events = parseSse(await readBody(response));
    const errors = events.filter((e) => e.type === "RUN_ERROR");
    expect(errors).toHaveLength(1);
    expect(typeof errors[0]?.message).toBe("string");

    await settle();
    expect(mockCaptureException).toHaveBeenCalledOnce();
    const [scope, error] = mockCaptureException.mock.calls[0] as [string, Error];
    expect(scope).toBe("copilotkit:run-error");
    expect(error.name).toBe("CopilotRunError");
  });

  it("reports a stream that dies mid-flight as a RUN_ERROR frame and forwards it to Sentry", async () => {
    upstream = () => brokenStream();

    const response = await POST(makeReq(runEnvelope("This will break")));
    expect(response.status).toBe(200);

    const events = parseSse(await readBody(response));
    expect(events.some((e) => e.type === "RUN_ERROR")).toBe(true);
    expect(events.some((e) => e.type === "RUN_FINISHED")).toBe(false);

    await settle();
    expect(mockCaptureException).toHaveBeenCalledOnce();
    expect(mockCaptureException.mock.calls[0]?.[0]).toBe("copilotkit:run-error");
  });

  // Regression pin for route.ts's per-request CopilotRuntime. A runtime hoisted
  // to module scope binds its default agent to the FIRST request's adapter, whose
  // fetch closes over that request's own signal. Once that signal is aborted
  // (the visitor closed the tab, or the 60s deadline fired) every later run
  // would be born aborted. Here the first request's signal is aborted after it
  // completes, and the second request must still reach the upstream with its
  // own, live fetch.
  it("lets a second request reach the upstream after the first request's signal is aborted", async () => {
    // A freshly loaded route module, so a runtime hoisted to module scope would
    // start unbound here instead of inheriting an earlier test's adapter.
    vi.resetModules();
    const { POST: freshPost } = await import("../route");
    const firstAbort = new AbortController();
    const first = await freshPost(makeReq(runEnvelope("first", "run-a"), firstAbort.signal));
    expect(parseSse(await readBody(first)).at(-1)?.type).toBe("RUN_FINISHED");
    firstAbort.abort();

    const second = await freshPost(makeReq(runEnvelope("second", "run-b")));
    const events = parseSse(await readBody(second));

    expect(upstreamCalls).toHaveLength(2);
    // The fake refuses to record a call whose signal is already aborted, so a
    // second call being recorded at all means it was made with a live signal.
    // (Its signal may well be aborted again by now: the runtime tears the run
    // down when it finishes.)
    expect(events.at(-1)?.type).toBe("RUN_FINISHED");
    expect(events.some((e) => e.type === "RUN_ERROR")).toBe(false);
    expect(JSON.stringify(upstreamCalls[1]?.body)).toContain("second");
    expect(blockedUrls).toEqual([]);
  });
});
