import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockCaptureException = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/log", () => ({
  captureException: mockCaptureException,
  logWarn: mockLogWarn,
}));

import { resetRunErrorSamplingForTests, tapRunErrors } from "../copilot-run-error-tap";

/** Exactly what @ag-ui/encoder puts on the wire: `data: <json>\n\n`. */
function frame(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Builds an SSE response whose body yields the given chunks in order. */
function sseResponse(chunks: (string | Uint8Array)[]): Response {
  const body = new ReadableStream<string | Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  // Cast: the DOM lib types Response bodies as Uint8Array streams, but the
  // encoder really does enqueue strings (see the tap's SseChunk note).
  return new Response(body as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/**
 * The observer drains its branch independently of the client branch, so
 * finishing `readAll` does not mean it has caught up. Yielding the macrotask
 * queue lets it settle before assertions -- without this the reporting tests
 * race the tap and flake.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function readAll(response: Response): Promise<string> {
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

const RUN_ERROR = {
  type: "RUN_ERROR",
  message: "terminated",
  code: "abort",
};

const CLEAN_RUN = [
  frame({ type: "RUN_STARTED", threadId: "t1", runId: "r1" }),
  frame({ type: "TEXT_MESSAGE_CHUNK", messageId: "m1", delta: "hi" }),
  frame({ type: "RUN_FINISHED" }),
];

describe("tapRunErrors", () => {
  beforeEach(() => {
    resetRunErrorSamplingForTests();
    mockCaptureException.mockReset();
    mockLogWarn.mockReset();
  });

  it("forwards a RUN_ERROR frame to captureException", async () => {
    const tapped = tapRunErrors(sseResponse([frame({ type: "RUN_STARTED" }), frame(RUN_ERROR)]));
    await readAll(tapped);
    await settle();

    expect(mockCaptureException).toHaveBeenCalledOnce();
    const [scope, error] = mockCaptureException.mock.calls[0] as [string, Error];
    expect(scope).toBe("copilotkit:run-error");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CopilotRunError");
    expect(error.message).toContain("terminated");
    expect(error.message).toContain("abort");
  });

  // The whole point of teeing rather than reading: the visitor's stream must be
  // byte-identical and must not be consumed by the observer.
  it("still delivers the complete, unmodified stream to the client", async () => {
    const chunks = [...CLEAN_RUN.slice(0, 1), frame(RUN_ERROR)];
    const tapped = tapRunErrors(sseResponse(chunks));

    expect(await readAll(tapped)).toBe(chunks.join(""));
  });

  it("reports nothing for a successful run", async () => {
    await readAll(tapRunErrors(sseResponse(CLEAN_RUN)));
    await settle();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // The AG-UI encoder emits strings, not bytes -- a Uint8Array-only reader
  // would silently see nothing here.
  it("reads string chunks as well as byte chunks", async () => {
    const bytes = new TextEncoder().encode(frame(RUN_ERROR));
    await readAll(tapRunErrors(sseResponse([bytes])));
    await settle();
    expect(mockCaptureException).toHaveBeenCalledOnce();

    mockCaptureException.mockReset();
    await readAll(tapRunErrors(sseResponse([frame(RUN_ERROR)])));
    await settle();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("detects a RUN_ERROR split across chunk boundaries", async () => {
    const whole = frame(RUN_ERROR);
    const cut = Math.floor(whole.length / 2);
    await readAll(tapRunErrors(sseResponse([whole.slice(0, cut), whole.slice(cut)])));
    await settle();

    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("detects a trailing RUN_ERROR that has no trailing newline", async () => {
    await readAll(tapRunErrors(sseResponse([`data: ${JSON.stringify(RUN_ERROR)}`])));
    await settle();
    expect(mockCaptureException).toHaveBeenCalledOnce();
  });

  it("ignores unparseable frames without reporting them", async () => {
    await readAll(tapRunErrors(sseResponse(["data: {not json\n\n", ": keep-alive\n\n"])));
    await settle();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("returns non-SSE responses untouched, by identity", () => {
    const json = new Response(JSON.stringify({ error: "nope" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
    expect(tapRunErrors(json)).toBe(json);

    const bodyless = new Response(null, { status: 204 });
    expect(tapRunErrors(bodyless)).toBe(bodyless);
  });

  it("preserves status and headers on the tapped response", async () => {
    const tapped = tapRunErrors(sseResponse(CLEAN_RUN));
    expect(tapped.status).toBe(200);
    expect(tapped.headers.get("content-type")).toBe("text/event-stream");
    await readAll(tapped);
  });

  it("reports a mid-stream read failure as a warning, not an exception", async () => {
    const body = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(frame({ type: "RUN_STARTED" }));
        controller.error(new Error("connection reset"));
      },
    });
    const tapped = tapRunErrors(
      new Response(body as unknown as BodyInit, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    // The client branch errors too; that is the upstream's failure, not ours.
    await expect(readAll(tapped)).rejects.toThrow();
    await settle();

    expect(mockLogWarn).toHaveBeenCalledOnce();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  describe("tapRunErrors sampling (T-6263)", () => {
    // Mirrors RUN_ERROR_CAPTURES_PER_WINDOW, RUN_ERROR_WINDOW_MS and MAX_TRACKED_CODES.
    const PER_WINDOW = 5;
    const WINDOW_MS = 10 * 60_000;
    const MAX_CODES = 20;

    beforeEach(() => {
      resetRunErrorSamplingForTests();
      mockCaptureException.mockClear();
      mockLogWarn.mockClear();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function run(event: Record<string, unknown>): Promise<void> {
      const res = tapRunErrors(sseResponse([frame(event)]));
      await readAll(res);
      await settle();
    }

    it("captures at most PER_WINDOW of one error code per window, the first always, and logs the suppression", async () => {
      for (let i = 0; i < PER_WINDOW + 7; i += 1) {
        await run({ ...RUN_ERROR, message: `m${i}` });
      }
      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW);
      const warned = mockLogWarn.mock.calls.filter(([, msg]) => /suppress/i.test(String(msg)));
      expect(warned).toHaveLength(1);
    });

    it("gives every distinct error code its own first capture", async () => {
      for (const code of ["abort", "timeout", "rate_limit", "upstream", "bad_request"]) {
        await run({ ...RUN_ERROR, code });
      }
      expect(mockCaptureException).toHaveBeenCalledTimes(5);
    });

    it("buckets frames without a code together", async () => {
      for (let i = 0; i < PER_WINDOW + 3; i += 1) {
        await run({ type: "RUN_ERROR", message: `no code ${i}` });
      }
      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW);
    });

    it("starts a new window after WINDOW_MS and reports how many captures were suppressed", async () => {
      for (let i = 0; i < PER_WINDOW + 4; i += 1) await run(RUN_ERROR);
      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW);

      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1));
      mockLogWarn.mockClear();
      await run(RUN_ERROR);

      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW + 1);
      expect(mockLogWarn).toHaveBeenCalledWith(
        "copilotkit:run-error",
        expect.stringMatching(/suppressed/i),
        expect.objectContaining({ code: "abort", suppressed: 4 }),
      );
    });

    it("bounds the codes it tracks: codes beyond MAX_CODES share one overflow bucket", async () => {
      for (let i = 0; i < MAX_CODES + 20; i += 1) {
        await run({ ...RUN_ERROR, code: `code-${i}` });
      }
      expect(mockCaptureException).toHaveBeenCalledTimes(MAX_CODES + PER_WINDOW);
    });

    it("evicts buckets whose window has ended, so a new code long after 20 old ones still gets its own first capture", async () => {
      for (let i = 0; i < MAX_CODES; i += 1) await run({ ...RUN_ERROR, code: `old-${i}` });
      expect(mockCaptureException).toHaveBeenCalledTimes(MAX_CODES);

      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1));
      mockCaptureException.mockClear();
      for (let i = 0; i < PER_WINDOW; i += 1) await run({ ...RUN_ERROR, code: "brand-new" });

      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW);
    });

    it("keeps the overflow bucket while all MAX_CODES buckets are still in an active window", async () => {
      for (let i = 0; i < MAX_CODES; i += 1) await run({ ...RUN_ERROR, code: `live-${i}` });
      mockCaptureException.mockClear();
      for (let i = 0; i < PER_WINDOW + 3; i += 1) await run({ ...RUN_ERROR, code: "twenty-first" });
      expect(mockCaptureException).toHaveBeenCalledTimes(PER_WINDOW);
      mockCaptureException.mockClear();
      // The overflow bucket is shared, so another unseen code finds it already spent.
      await run({ ...RUN_ERROR, code: "twenty-second" });
      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it("logs the suppressed count of a bucket it evicts", async () => {
      for (let i = 0; i < PER_WINDOW + 4; i += 1) await run({ ...RUN_ERROR, code: "noisy" });
      for (let i = 0; i < MAX_CODES - 1; i += 1) await run({ ...RUN_ERROR, code: `other-${i}` });

      vi.setSystemTime(new Date(Date.now() + WINDOW_MS + 1));
      mockLogWarn.mockClear();
      await run({ ...RUN_ERROR, code: "fresh" });

      expect(mockLogWarn).toHaveBeenCalledWith(
        "copilotkit:run-error",
        expect.stringMatching(/suppressed/i),
        expect.objectContaining({ code: "noisy", suppressed: 4 }),
      );
    });
  });
});
