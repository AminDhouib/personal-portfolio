import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn() }));

import { GET } from "../route";
import { logWarn } from "@/lib/log";
import { mockFetchJsonResponse } from "@/test/api-route-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(logWarn).mockClear();
});

describe("GET /api/password-game/wordle", () => {
  it("falls back to the static pool and logs a warning on a non-OK upstream response", async () => {
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: false }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(typeof body.word).toBe("string");
    expect(body.word).toHaveLength(5);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=3600");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("falls back and logs a warning when the upstream solution fails the 5-letter regex", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJsonResponse({ ok: true, body: { solution: "nope-not-5-letters" } }),
    );
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("fallback");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("uses the upstream word on success without logging a warning", async () => {
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: true, body: { solution: "crane" } }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("nyt");
    expect(body.word).toBe("CRANE");
    expect(logWarn).not.toHaveBeenCalled();
  });
});
