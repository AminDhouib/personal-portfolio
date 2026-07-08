import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

type Row = Record<string, unknown>;
const rows: Record<string, Row[]> = {};

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toUpperCase();
      if (text.includes("COUNT(*)")) {
        const game = params?.[0] as string;
        const score = params?.[1] as number;
        const above = (rows[game] ?? []).filter(
          (r: Record<string, unknown>) => (r.score as number) > score,
        ).length;
        return { rows: [{ rank: above + 1 }] };
      }
      if (text.startsWith("SELECT")) {
        const game = params?.[0] as string;
        const limit = params?.[1] as number | undefined;
        const board = [...(rows[game] ?? [])].sort(
          (a, b) => (b.score as number) - (a.score as number),
        );
        return { rows: limit ? board.slice(0, limit) : board };
      }
      if (text.startsWith("INSERT")) {
        const game = params?.[0] as string;
        const entry = {
          id: Math.random(),
          name: params?.[1],
          score: params?.[2],
          level: params?.[3],
          seconds: params?.[4],
          kills: params?.[5],
          distance: params?.[6],
          region: params?.[7],
          createdAt: new Date().toISOString(),
        };
        if (!rows[game]) rows[game] = [];
        rows[game].push(entry);
        return { rows: [{ id: entry.id }] };
      }
      if (text.startsWith("DELETE")) {
        const game = params?.[0] as string;
        const limit = params?.[1] as number;
        if (rows[game]) {
          rows[game].sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
              (b.score as number) - (a.score as number),
          );
          rows[game] = rows[game].slice(0, limit);
        }
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

interface LeaderboardGetResponse {
  entries: Array<{ name: string; score: number }>;
}

describe("/api/leaderboard", () => {
  beforeEach(() => {
    for (const key of Object.keys(rows)) delete rows[key];
  });

  describe("GET", () => {
    it("returns 400 when ?game= is absent", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard"));
      expect(res.status).toBe(400);
    });

    it("returns an empty list for an unrecognized game slug", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=not-a-game"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toEqual([]);
    });

    it("returns entries sorted by score desc", async () => {
      rows["space-shooter"] = [
        { name: "A", score: 10, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        { name: "B", score: 30, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        { name: "C", score: 20, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
      ];
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });
  });

  describe("POST", () => {
    it("persists a valid score and returns ok:true + rank", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 500, level: 3, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
    });

    it("rejects a missing game with 400", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", score: 10, level: 1 }));
      expect(res.status).toBe(400);
    });

    it("rejects an unrecognized game slug with 400", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game: "not-a-real-game" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid score with 400", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: -1, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects invalid level with 400", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 0, game: "space-shooter" }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects cross-origin with 403", async () => {
      const res = await POST(
        makeJsonPostRequest(
          { name: "Ada", score: 10, level: 1, game: "space-shooter" },
          { origin: "https://evil.example" },
        ),
      );
      expect(res.status).toBe(403);
    });

    it("rejects malformed JSON with 400", async () => {
      const res = await POST(makeJsonPostRequest("{not json"));
      expect(res.status).toBe(400);
    });

    it("returns 413 for oversized body", async () => {
      const res = await POST(
        makeJsonPostRequest({
          name: "Ada",
          score: 10,
          level: 1,
          game: "space-shooter",
          filler: "x".repeat(20_000),
        }),
      );
      expect(res.status).toBe(413);
    });
  });
});
