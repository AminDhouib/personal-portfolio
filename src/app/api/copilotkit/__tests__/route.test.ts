import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mockHandleRequest = vi.hoisted(() => vi.fn());
const mockCreateOpenAI = vi.hoisted(() => vi.fn((_options: unknown) => ({ chat: vi.fn() })));
// Constructor mock must be a function expression, not an arrow -- arrows have
// no [[Construct]] and `new` on one throws (vitest 4 quirk, see RUNBOOK).
const mockCopilotRuntime = vi.hoisted(() => vi.fn(function MockCopilotRuntime() {}));
const mockEndpoint = vi.hoisted(() =>
  vi.fn((_options: unknown) => ({ handleRequest: mockHandleRequest })),
);

vi.mock("@copilotkit/runtime", () => ({
  CopilotRuntime: mockCopilotRuntime,
  OpenAIAdapter: class MockOpenAIAdapter {},
  copilotRuntimeNextJSAppRouterEndpoint: mockEndpoint,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

import { POST } from "../route";

// Requests must clear the same-origin + rate-limit guards before reaching the
// runtime, so every request carries a matching Origin/host and its own IP.
function makeReq(body: unknown, opts: { ip?: string; origin?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = { "x-forwarded-host": "amindhou.com" };
  const origin = opts.origin === undefined ? "https://amindhou.com" : opts.origin;
  if (origin) headers["origin"] = origin;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return new NextRequest("https://amindhou.com/api/copilotkit", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/copilotkit", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.OPENROUTER_KEY;
    delete process.env.OPENROUTER_KEY;
    mockHandleRequest.mockReset();
    mockCreateOpenAI.mockClear();
    mockCopilotRuntime.mockClear();
    mockEndpoint.mockClear();
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.OPENROUTER_KEY = savedKey;
    } else {
      delete process.env.OPENROUTER_KEY;
    }
  });

  it("returns 503 when OPENROUTER_KEY is not set", async () => {
    const req = makeReq({}, { ip: "10.30.0.1" });
    const response = await POST(req);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "OPENROUTER_KEY not configured" });
  });

  it("returns Content-Type application/json on 503 response", async () => {
    const req = makeReq({}, { ip: "10.30.0.2" });
    const response = await POST(req);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("delegates to handleRequest when OPENROUTER_KEY is set", async () => {
    process.env.OPENROUTER_KEY = "test-key-abc";
    const mockResponse = new Response("ok", { status: 200 });
    mockHandleRequest.mockResolvedValueOnce(mockResponse);

    const req = makeReq({ message: "hello" }, { ip: "10.30.0.3" });
    const response = await POST(req);

    expect(mockHandleRequest).toHaveBeenCalledOnce();
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
    expect(response).toBe(mockResponse);
  });

  it("does not call handleRequest when OPENROUTER_KEY is missing", async () => {
    const req = makeReq({}, { ip: "10.30.0.4" });
    await POST(req);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it("wires a deadline fetch into createOpenAI on the key-set path (RC-10)", async () => {
    process.env.OPENROUTER_KEY = "test-key-abc";
    mockHandleRequest.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await POST(makeReq({ message: "hello" }, { ip: "10.30.0.6" }));

    expect(mockCreateOpenAI).toHaveBeenCalledOnce();
    const call = mockCreateOpenAI.mock.calls[0];
    if (!call) throw new Error("expected createOpenAI to have been called");
    const options = call[0] as { fetch?: unknown };
    expect(typeof options.fetch).toBe("function");
  });

  // Regression pin for the dead-chat bug: a module-scope `new CopilotRuntime()`
  // let CopilotKit bind its lazily-created default agent to the FIRST request's
  // serviceAdapter, whose grounded fetch closes over that request's one-shot
  // 60s deadline signal. Every run after that signal fired was born aborted
  // (instant TimeoutError -> SSE RUN_ERROR), so chat only worked for ~60s after
  // each deploy. The runtime must be constructed per request.
  it("constructs a fresh CopilotRuntime per request", async () => {
    process.env.OPENROUTER_KEY = "test-key-abc";
    mockHandleRequest.mockResolvedValue(new Response("ok", { status: 200 }));

    await POST(makeReq({ message: "first" }, { ip: "10.30.0.7" }));
    await POST(makeReq({ message: "second" }, { ip: "10.30.0.8" }));

    expect(mockCopilotRuntime).toHaveBeenCalledTimes(2);
  });

  it("passes a distinct runtime instance to the endpoint factory on each request", async () => {
    process.env.OPENROUTER_KEY = "test-key-abc";
    mockHandleRequest.mockResolvedValue(new Response("ok", { status: 200 }));

    await POST(makeReq({ message: "first" }, { ip: "10.30.0.9" }));
    await POST(makeReq({ message: "second" }, { ip: "10.30.0.10" }));

    expect(mockEndpoint).toHaveBeenCalledTimes(2);
    const [first, second] = mockEndpoint.mock.calls as unknown as [
      [{ runtime: unknown; serviceAdapter: unknown }],
      [{ runtime: unknown; serviceAdapter: unknown }],
    ];
    expect(first[0].runtime).toBeDefined();
    expect(second[0].runtime).toBeDefined();
    // The actual invariant: not the same object across requests. A hoisted
    // module-scope runtime would make these identical and fail here.
    expect(first[0].runtime).not.toBe(second[0].runtime);
    // The adapter is already per-request; assert it stays that way, since the
    // runtime binds to whichever adapter it first sees.
    expect(first[0].serviceAdapter).not.toBe(second[0].serviceAdapter);
  });

  it("returns 403 for a cross-origin request and never reaches the runtime", async () => {
    process.env.OPENROUTER_KEY = "test-key-abc";
    const req = makeReq({}, { origin: "https://evil.example", ip: "10.30.0.5" });
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once the per-IP limit is exceeded", async () => {
    const ip = "77.77.77.77";
    for (let i = 0; i < 20; i++) {
      await POST(makeReq({}, { ip }));
    }
    const limited = await POST(makeReq({}, { ip }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });
});
