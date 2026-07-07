import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn() }));

import { GET } from "../route";
import { logWarn } from "@/lib/log";

function fetchResolving(value: { ok: boolean; body?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: value.ok,
    json: () => Promise.resolve(value.body),
  } as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(logWarn).mockClear();
});

describe("GET /api/password-game/chess-puzzle", () => {
  it("returns the unavailable fallback and logs a warning on a non-OK upstream response", async () => {
    vi.stubGlobal("fetch", fetchResolving({ ok: false }));
    const res = await GET();
    const body = await res.json();
    expect(body.puzzle).toBeNull();
    expect(body.source).toBe("unavailable");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("returns the unavailable fallback and logs a warning when the upstream payload is missing puzzle fields", async () => {
    vi.stubGlobal("fetch", fetchResolving({ ok: true, body: {} }));
    const res = await GET();
    const body = await res.json();
    expect(body.puzzle).toBeNull();
    expect(body.source).toBe("unavailable");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});
