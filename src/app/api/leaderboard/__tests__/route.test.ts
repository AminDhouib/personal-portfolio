import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;
const rows: Record<string, Row[]> = {};
const statements: string[] = [];

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      statements.push(sql.trim().toUpperCase());
      const game = params?.[0] as string;
      const limit = params?.[1] as number | undefined;
      const board = [...(rows[game] ?? [])].sort(
        (a, b) => (b.score as number) - (a.score as number),
      );
      return { rows: limit ? board.slice(0, limit) : board };
    }),
  }),
}));

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const mod = await import("../route");
const { GET } = mod;

interface LeaderboardGetResponse {
  entries: Array<{ name: string; score: number }>;
}

describe("/api/leaderboard", () => {
  beforeEach(() => {
    for (const key of Object.keys(rows)) delete rows[key];
    statements.length = 0;
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
      rows["tower-stacker"] = [
        { name: "A", score: 10, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        { name: "B", score: 30, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        { name: "C", score: 20, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
      ];
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=tower-stacker"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=tower-stacker"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });

    it("only ever reads: the one statement it runs is a SELECT", async () => {
      await GET(new Request("https://amindhou.com/api/leaderboard?game=tower-stacker"));
      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/^SELECT\b/);
    });

    // Every game that ever wrote here stays readable: the rows are frozen history.
    it.each(["tower-stacker", "space-shooter", "hextris"])(
      "still serves the stored rows of %s",
      async (game) => {
        rows[game] = [
          { name: "Old", score: 10, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
          { name: "Best", score: 30, level: 1, createdAt: "2026-01-01T00:00:00.000Z" },
        ];
        const res = await GET(new Request(`https://amindhou.com/api/leaderboard?game=${game}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as LeaderboardGetResponse;
        expect(body.entries.map((e) => e.name)).toEqual(["Best", "Old"]);
      },
    );
  });

  describe("frozen history", () => {
    it("is read-only: the route exports GET and no POST (T6 retired the last writer)", () => {
      expect(typeof mod.GET).toBe("function");
      expect("POST" in mod).toBe(false);
    });
  });
});
