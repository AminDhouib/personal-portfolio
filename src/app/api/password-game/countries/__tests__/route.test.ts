import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn() }));

import { GET } from "../route";
import { logWarn } from "@/lib/log";

const REST_PAYLOAD = [
  { name: { common: "Japan" }, capital: ["Tokyo"] },
  { name: { common: "France" }, capital: ["Paris"] },
  { name: { common: "Antarctica" }, capital: [] },
];

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

describe("GET /api/password-game/countries", () => {
  it("returns sorted capitals with the week-long cache on success", async () => {
    vi.stubGlobal("fetch", fetchResolving({ ok: true, body: REST_PAYLOAD }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("restcountries");
    expect(body.count).toBe(2);
    expect(body.capitals).toEqual([
      { country: "France", capital: "Paris" },
      { country: "Japan", capital: "Tokyo" },
    ]);
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=604800, stale-while-revalidate=86400",
    );
  });

  it("does NOT cache an upstream failure for a week (DD3-003): short TTL when unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream down")));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("unavailable");
    expect(body.count).toBe(0);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300");
  });

  it("treats a non-OK upstream response as unavailable with the short TTL", async () => {
    vi.stubGlobal("fetch", fetchResolving({ ok: false }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("unavailable");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("logs a warning and treats a malformed (non-array) upstream payload as unavailable", async () => {
    vi.stubGlobal("fetch", fetchResolving({ ok: true, body: { not: "an array" } }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("unavailable");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});
