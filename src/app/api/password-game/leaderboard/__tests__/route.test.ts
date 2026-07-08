import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

const entries: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toUpperCase();
      if (text.includes("COUNT(*)")) {
        const elapsedSeconds = params?.[0] as number;
        const faster = entries.filter((e) => (e.elapsedSeconds as number) < elapsedSeconds).length;
        return { rows: [{ rank: faster + 1 }] };
      }
      if (text.startsWith("SELECT") && text.includes("WHERE SEED")) {
        const seed = params?.[0] as number;
        const limit = params?.[1] as number;
        const filtered = entries
          .filter((e) => (e.seed as number) === seed)
          .sort((a, b) => (a.elapsedSeconds as number) - (b.elapsedSeconds as number));
        return { rows: filtered.slice(0, limit) };
      }
      if (text.startsWith("SELECT")) {
        const limit = params?.[0] as number;
        const sorted = [...entries].sort(
          (a, b) => (a.elapsedSeconds as number) - (b.elapsedSeconds as number),
        );
        return { rows: sorted.slice(0, limit) };
      }
      if (text.startsWith("INSERT")) {
        entries.push({
          id: Math.random(),
          name: params?.[0],
          seed: params?.[1],
          elapsedSeconds: params?.[2],
          ruleCount: params?.[3],
          createdAt: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (text.startsWith("DELETE")) {
        const limit = params?.[0] as number;
        entries.sort((a, b) => (a.elapsedSeconds as number) - (b.elapsedSeconds as number));
        entries.splice(limit);
        return { rows: [] };
      }
      return { rows: [] };
    }),
  }),
}));

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { GET, POST } = await import("../route");

interface PostResponse {
  ok?: boolean;
  rank?: number;
  error?: string;
}

interface PgLeaderboardGetResponse {
  entries: Array<{ name: string; elapsedSeconds: number }>;
}

describe("/api/password-game/leaderboard", () => {
  beforeEach(() => {
    entries.length = 0;
  });

  describe("GET", () => {
    it("returns entries sorted by elapsedSeconds ascending", async () => {
      entries.push(
        {
          name: "A",
          seed: 1,
          elapsedSeconds: 30,
          ruleCount: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          name: "B",
          seed: 1,
          elapsedSeconds: 10,
          ruleCount: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          name: "C",
          seed: 1,
          elapsedSeconds: 20,
          ruleCount: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      );
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("filters by ?seed=", async () => {
      entries.push(
        {
          name: "A",
          seed: 1,
          elapsedSeconds: 10,
          ruleCount: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          name: "B",
          seed: 2,
          elapsedSeconds: 5,
          ruleCount: 5,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      );
      const res = await GET(
        new Request("https://amindhou.com/api/password-game/leaderboard?seed=1"),
      );
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["A"]);
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });
  });

  describe("POST", () => {
    it("persists a valid run and returns ok:true + rank", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 7, elapsedSeconds: 120, ruleCount: 10 }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
    });

    it("returns 400 for invalid seed", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: -1, elapsedSeconds: 10, ruleCount: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid elapsedSeconds", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 0, ruleCount: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid ruleCount", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 0 }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects v1 field names (time/rules) with 400", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 10, rules: 5 }));
      expect(res.status).toBe(400);
    });

    it("rejects cross-origin with 403", async () => {
      const res = await POST(
        makeJsonPostRequest(
          { name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 1 },
          { origin: "https://evil.example" },
        ),
      );
      expect(res.status).toBe(403);
    });

    it("rejects malformed JSON with 400", async () => {
      const res = await POST(makeJsonPostRequest("{not json"));
      expect(res.status).toBe(400);
    });
  });
});
