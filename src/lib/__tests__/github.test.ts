import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchRepoStats, fetchContributionGraph } from "../github";

// NOTE: GITHUB_TOKEN is captured at module-load time in github.ts (const GITHUB_TOKEN = ...).
// Mutating process.env.GITHUB_TOKEN in beforeEach has no effect on the guard inside
// fetchContributionGraph — it checks the already-captured const, not process.env.
// Strategy:
//   fetchRepoStats  → vi.stubGlobal('fetch', ...) to test error / success paths
//   fetchContributionGraph → test directly; returns [] if token was absent at load time,
//                            or [] on any fetch error (both paths return [])

describe("fetchRepoStats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns { stars: 0, forks: 0 } on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await fetchRepoStats("owner", "repo");
    expect(result).toEqual({ stars: 0, forks: 0 });
  });

  it("returns { stars: 0, forks: 0 } on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await fetchRepoStats("owner", "repo");
    expect(result).toEqual({ stars: 0, forks: 0 });
  });

  it("returns stars and forks on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ stargazers_count: 42, forks_count: 7 }),
      }),
    );
    const result = await fetchRepoStats("owner", "repo");
    expect(result).toEqual({ stars: 42, forks: 7 });
  });
});

describe("fetchContributionGraph", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an array of contribution days (or [] when no token/error)", async () => {
    // No token → goes straight to the public fallback; with a token the GraphQL
    // call fails first and then falls through to the public fallback. Either way
    // a rejected fetch must resolve to an array, never throw.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
    const result = await fetchContributionGraph("testuser");
    expect(Array.isArray(result)).toBe(true);
  });

  it("maps the token-free public fallback into ContributionDay[]", async () => {
    // The public mirror returns { date, count, level } already. Whether or not a
    // token was present at load, the GraphQL shape parses to [] here and the code
    // falls through to map this payload.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contributions: [
            { date: "2025-06-15", count: 3, level: 1 },
            { date: "2025-06-16", count: 0, level: 0 },
            { date: "2025-06-17", count: 99, level: 4 },
          ],
        }),
      }),
    );
    const result = await fetchContributionGraph("AminDhouib");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: "2025-06-15", count: 3, level: 1 });
    expect(result[2].level).toBe(4);
  });
});
