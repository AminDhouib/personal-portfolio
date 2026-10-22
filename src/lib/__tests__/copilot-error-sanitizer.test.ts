// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  logError: mockLogError,
  logWarn: vi.fn(),
  captureException: vi.fn(),
}));

import { GENERIC_CHAT_ERROR, sanitizeCopilotErrors } from "../copilot-error-sanitizer";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SECRET = "OpenRouter 401: invalid key sk-or-v1-abcdef at /srv/app/node_modules/x.js:12";

function sse(frames: string[]): string {
  return frames.map((f) => `data: ${f}\n\n`).join("");
}

function sseResponse(chunks: Array<string | Uint8Array>, status = 200): Response {
  const body = new ReadableStream<string | Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(body as ReadableStream<Uint8Array>, {
    status,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

/** Reads a response body to the end, whether its chunks are strings or bytes. */
async function readAll(response: Response): Promise<{ text: string; binary: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", binary: false };
  let text = "";
  let binary = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (typeof value === "string") text += value;
    else {
      binary = true;
      text += decoder.decode(value as Uint8Array, { stream: true });
    }
  }
  return { text, binary };
}

function frames(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice("data:".length).trim()) as Record<string, unknown>);
}

afterEach(() => {
  mockLogError.mockClear();
});

describe("sanitizeCopilotErrors: non-stream responses", () => {
  it("returns a successful JSON response by identity", async () => {
    const response = new Response(JSON.stringify({ agents: {} }), { status: 200 });
    expect(await sanitizeCopilotErrors(response)).toBe(response);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("replaces an error body with a generic one, keeps the status, and logs the detail", async () => {
    const response = new Response(JSON.stringify({ error: "boom", stack: SECRET }), {
      status: 502,
      headers: { "content-type": "application/json", "content-length": "99" },
    });
    const clean = await sanitizeCopilotErrors(response);

    expect(clean.status).toBe(502);
    expect(clean.headers.get("content-type")).toContain("application/json");
    expect(clean.headers.get("content-length")).toBeNull();
    const text = await clean.text();
    expect(text).not.toContain("sk-or-v1");
    expect(text).not.toContain("node_modules");
    expect(JSON.parse(text)).toEqual({ error: GENERIC_CHAT_ERROR });

    expect(mockLogError).toHaveBeenCalledOnce();
    const [scope, , detail] = mockLogError.mock.calls[0] as [string, string, string];
    expect(scope).toBe("copilotkit:error-response");
    expect(detail).toContain("sk-or-v1");
  });

  it("truncates the logged detail so a huge upstream body cannot flood the log", async () => {
    const response = new Response("x".repeat(100_000), { status: 500 });
    await sanitizeCopilotErrors(response);
    const detail = (mockLogError.mock.calls[0] as [string, string, string])[2];
    expect(detail.length).toBeLessThan(5000);
  });

  it("sanitises a 4xx runtime answer too (the runtime's own validation messages)", async () => {
    const response = new Response(
      JSON.stringify({
        error: "invalid_request",
        message: "Missing or invalid parameter 'agentId'",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
    const clean = await sanitizeCopilotErrors(response);
    expect(clean.status).toBe(400);
    expect(await clean.json()).toEqual({ error: GENERIC_CHAT_ERROR });
  });
});

describe("sanitizeCopilotErrors: RUN_ERROR frames in a stream", () => {
  const runError = JSON.stringify({
    type: "RUN_ERROR",
    message: SECRET,
    code: "UPSTREAM_401",
    rawEvent: { cause: SECRET },
    timestamp: 1700000000000,
  });
  const started = JSON.stringify({ type: "RUN_STARTED", threadId: "t", runId: "r" });
  const delta = JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Hi" });

  it("rewrites the error frame and leaves every other frame byte for byte", async () => {
    const input = sse([started, delta, runError]);
    const clean = await sanitizeCopilotErrors(sseResponse([input]));
    const { text } = await readAll(clean);

    expect(text).not.toContain("sk-or-v1");
    expect(text).not.toContain("UPSTREAM_401");
    expect(text).not.toContain("rawEvent");
    expect(text.startsWith(sse([started, delta]))).toBe(true);
    const out = frames(text);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({
      type: "RUN_ERROR",
      message: GENERIC_CHAT_ERROR,
      code: "chat_error",
      timestamp: 1700000000000,
    });
  });

  it("keeps the response status and headers", async () => {
    const clean = await sanitizeCopilotErrors(sseResponse([sse([runError])]));
    expect(clean.status).toBe(200);
    expect(clean.headers.get("content-type")).toContain("text/event-stream");
    expect(clean.headers.get("cache-control")).toBe("no-cache");
  });

  it("finds a frame split across chunk boundaries", async () => {
    const input = sse([started, runError]);
    const cut = input.indexOf("invalid key") + 4;
    const clean = await sanitizeCopilotErrors(sseResponse([input.slice(0, cut), input.slice(cut)]));
    const { text } = await readAll(clean);
    expect(text).not.toContain("sk-or-v1");
    expect(frames(text).at(-1)).toMatchObject({ type: "RUN_ERROR", message: GENERIC_CHAT_ERROR });
  });

  it("keeps byte chunks as bytes and string chunks as strings", async () => {
    const asBytes = await readAll(
      await sanitizeCopilotErrors(sseResponse([encoder.encode(sse([delta, runError]))])),
    );
    expect(asBytes.binary).toBe(true);
    expect(asBytes.text).not.toContain("sk-or-v1");

    const asStrings = await readAll(
      await sanitizeCopilotErrors(sseResponse([sse([delta, runError])])),
    );
    expect(asStrings.binary).toBe(false);
  });

  it("does not delay frames: a complete frame is emitted before the stream ends", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const body = new ReadableStream<string>({
      async start(controller) {
        controller.enqueue(sse([delta]));
        await gate;
        controller.close();
      },
    });
    const clean = await sanitizeCopilotErrors(
      new Response(body as unknown as ReadableStream<Uint8Array>, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const reader = clean.body?.getReader();
    const first = await reader?.read();
    expect(first?.value).toBe(sse([delta]));
    release();
  });

  it("leaves a model reply that merely mentions RUN_ERROR alone", async () => {
    const chatter = JSON.stringify({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "m",
      delta: 'a "type":"RUN_ERROR" frame',
    });
    const { text } = await readAll(await sanitizeCopilotErrors(sseResponse([sse([chatter])])));
    expect(text).toBe(sse([chatter]));
  });

  it("fails closed on an error frame it cannot parse", async () => {
    const broken = `data: {"type":"RUN_ERROR","message":"${SECRET}\n\n`;
    const { text } = await readAll(await sanitizeCopilotErrors(sseResponse([broken])));
    expect(text).not.toContain("sk-or-v1");
    expect(frames(text)[0]).toMatchObject({ type: "RUN_ERROR", message: GENERIC_CHAT_ERROR });
  });

  it("handles CRLF line endings", async () => {
    const input = `data: ${runError}\r\n\r\n`;
    const { text } = await readAll(await sanitizeCopilotErrors(sseResponse([input])));
    expect(text).not.toContain("sk-or-v1");
    expect(text.endsWith("\r\n\r\n")).toBe(true);
  });

  it("rewrites a final error frame that has no trailing newline", async () => {
    const { text } = await readAll(await sanitizeCopilotErrors(sseResponse([`data: ${runError}`])));
    expect(text).not.toContain("sk-or-v1");
    expect(frames(text)[0]).toMatchObject({ type: "RUN_ERROR" });
  });

  it("drops a line that never ends rather than passing unscanned text through", async () => {
    const huge = `data: {"type":"RUN_ERROR","message":"${"x".repeat(2 * 1024 * 1024)}`;
    const { text } = await readAll(
      await sanitizeCopilotErrors(sseResponse([huge, `\n\n${sse([delta])}`])),
    );
    expect(text).not.toContain("xxxxxxxx");
    expect(text).toContain(sse([delta]));
  });

  it("does not silently drop a truncated multi-byte sequence at the end of the stream", async () => {
    // The last chunk ends mid-character and no newline follows; the decoder must be flushed.
    const bytes = encoder.encode(`data: caf${String.fromCharCode(0xe9)}`);
    const { text } = await readAll(
      await sanitizeCopilotErrors(sseResponse([bytes.slice(0, bytes.length - 1)])),
    );
    expect(text).toBe(`data: caf${String.fromCharCode(0xfffd)}`);
  });

  it("passes a body-less stream response through", async () => {
    const response = new Response(null, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    expect(await sanitizeCopilotErrors(response)).toBe(response);
  });
});
