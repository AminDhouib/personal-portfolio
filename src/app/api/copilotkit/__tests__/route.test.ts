import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mockHandleRequest = vi.hoisted(() => vi.fn());

vi.mock("@copilotkit/runtime", () => ({
  CopilotRuntime: class MockCopilotRuntime {},
  OpenAIAdapter: class MockOpenAIAdapter {},
  copilotRuntimeNextJSAppRouterEndpoint: vi.fn(() => ({
    handleRequest: mockHandleRequest,
  })),
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
