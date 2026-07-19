import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

interface Entry {
  id: number;
  name: unknown;
  seed: unknown;
  timeMs: unknown;
  daily: unknown;
  createdAt: string;
}

const entries: Entry[] = [];
const captured: Array<{ sql: string; params?: unknown[] }> = [];
let nextId = 1;
// NOT reset between tests: the runtime ensure runs once per process, so the
// CREATE TABLE count must stay 1 across the whole file.
let createTableCalls = 0;

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      captured.push({ sql, params });
      const text = sql.trim().toUpperCase();

      if (text.startsWith("CREATE")) {
        if (text.includes("CREATE TABLE")) createTableCalls += 1;
        return { rows: [] };
      }
      if (text.includes("COUNT(*)")) {
        const seed = params?.[0] as number;
        const timeMs = params?.[1] as number;
        const faster = entries.filter(
          (e) => e.seed === seed && (e.timeMs as number) < timeMs,
        ).length;
        return { rows: [{ rank: faster + 1 }] };
      }
      if (text.startsWith("INSERT")) {
        entries.push({
          id: nextId++,
          name: params?.[0],
          seed: params?.[1],
          timeMs: params?.[2],
          daily: params?.[3],
          createdAt: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (text.startsWith("DELETE")) {
        const seed = params?.[0] as number;
        const limit = params?.[1] as number;
        const keep = new Set(
          entries
            .filter((e) => e.seed === seed)
            .sort((a, b) => (a.timeMs as number) - (b.timeMs as number))
            .slice(0, limit)
            .map((e) => e.id),
        );
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i]!;
          if (e.seed === seed && !keep.has(e.id)) entries.splice(i, 1);
        }
        return { rows: [] };
      }
      if (text.startsWith("SELECT") && text.includes("WHERE SEED")) {
        const seed = params?.[0] as number;
        const limit = params?.[1] as number;
        const filtered = entries
          .filter((e) => e.seed === seed)
          .sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
        return { rows: filtered.slice(0, limit) };
      }
      if (text.startsWith("SELECT") && text.includes("DAILY = TRUE")) {
        const limit = params?.[0] as number;
        const filtered = entries
          .filter((e) => e.daily === true)
          .sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
        return { rows: filtered.slice(0, limit) };
      }
      if (text.startsWith("SELECT")) {
        const limit = params?.[0] as number;
        const sorted = [...entries].sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
        return { rows: sorted.slice(0, limit) };
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

interface Pg2GetResponse {
  entries: Array<{ name: string; seed: number; timeMs: number; daily: boolean }>;
}

const validBody = (over: Record<string, unknown> = {}) => ({
  name: "Ada",
  seed: 7,
  timeMs: 120_000,
  daily: false,
  ...over,
});

describe("/api/password-game-2/leaderboard", () => {
  beforeEach(() => {
    entries.length = 0;
    captured.length = 0;
    nextId = 1;
  });

  describe("GET", () => {
    it("all-time: returns entries sorted by timeMs ascending, no WHERE filter", async () => {
      entries.push(
        { id: 1, name: "A", seed: 1, timeMs: 30_000, daily: false, createdAt: "" },
        { id: 2, name: "B", seed: 2, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: 3, timeMs: 20_000, daily: false, createdAt: "" },
      );
      const res = await GET(new Request("https://amindhou.com/api/password-game-2/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
      const select = captured.find((q) => q.sql.trim().toUpperCase().startsWith("SELECT"));
      expect(select?.sql.toUpperCase()).not.toContain("WHERE");
    });

    it("seed: filters by ?seed= and orders by timeMs", async () => {
      entries.push(
        { id: 1, name: "A", seed: 1, timeMs: 20_000, daily: false, createdAt: "" },
        { id: 2, name: "B", seed: 1, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: 2, timeMs: 5_000, daily: false, createdAt: "" },
      );
      const res = await GET(
        new Request("https://amindhou.com/api/password-game-2/leaderboard?seed=1"),
      );
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "A"]);
      const select = captured.find((q) => q.sql.toUpperCase().includes("WHERE SEED"));
      expect(select?.params).toEqual([1, 50]);
    });

    it("daily: ?daily=1 filters to today's daily runs", async () => {
      entries.push(
        { id: 1, name: "A", seed: 1, timeMs: 30_000, daily: true, createdAt: "" },
        { id: 2, name: "B", seed: 2, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: 3, timeMs: 20_000, daily: true, createdAt: "" },
      );
      const res = await GET(
        new Request("https://amindhou.com/api/password-game-2/leaderboard?daily=1"),
      );
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["C", "A"]);
      const select = captured.find((q) => q.sql.toUpperCase().includes("DAILY = TRUE"));
      expect(select?.sql.toUpperCase()).toContain("CREATED_AT::DATE = NOW()::DATE");
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/password-game-2/leaderboard"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });
  });

  describe("POST", () => {
    it("persists a valid run and returns ok:true + rank 1 for a fresh seed", async () => {
      const res = await POST(makeJsonPostRequest(validBody()));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
    });

    it("computes rank per-seed: a slower run behind a faster one ranks 2", async () => {
      await POST(makeJsonPostRequest(validBody({ seed: 7, timeMs: 50_000 })));
      // Different seed, faster time — must NOT affect seed 7's ranking.
      await POST(makeJsonPostRequest(validBody({ seed: 999, timeMs: 11_000 })));
      const res = await POST(makeJsonPostRequest(validBody({ seed: 7, timeMs: 90_000 })));
      const body = (await res.json()) as PostResponse;
      expect(body.rank).toBe(2);
    });

    it("rejects negative seed with 400", async () => {
      const res = await POST(makeJsonPostRequest(validBody({ seed: -1 })));
      expect(res.status).toBe(400);
    });

    it("rejects seed above 2^32-1 with 400", async () => {
      const res = await POST(makeJsonPostRequest(validBody({ seed: 0x1_0000_0000 })));
      expect(res.status).toBe(400);
    });

    it("rejects non-number seed with 400", async () => {
      const res = await POST(makeJsonPostRequest(validBody({ seed: "7" })));
      expect(res.status).toBe(400);
    });

    it("rejects timeMs below the 10s floor with 400", async () => {
      const res = await POST(makeJsonPostRequest(validBody({ timeMs: 9_999 })));
      expect(res.status).toBe(400);
    });

    it("rejects timeMs above the 1h ceiling with 400", async () => {
      const res = await POST(makeJsonPostRequest(validBody({ timeMs: 3_600_001 })));
      expect(res.status).toBe(400);
    });

    it("sanitizes an oversize/HTML name to <=16 chars, stripped", async () => {
      await POST(
        makeJsonPostRequest(validBody({ name: "<script>aaaaaaaaaaaaaaaaaaaa</script>", seed: 42 })),
      );
      const insert = captured.find((q) => q.sql.trim().toUpperCase().startsWith("INSERT"));
      const storedName = insert?.params?.[0] as string;
      expect(storedName.length).toBeLessThanOrEqual(16);
      expect(storedName).not.toContain(" ");
    });

    it("defaults daily to false when a non-boolean is sent", async () => {
      await POST(makeJsonPostRequest(validBody({ daily: "yes", seed: 55 })));
      const insert = captured.find((q) => q.sql.trim().toUpperCase().startsWith("INSERT"));
      expect(insert?.params?.[3]).toBe(false);
    });

    it("trim query targets the same seed only", async () => {
      await POST(makeJsonPostRequest(validBody({ seed: 123, timeMs: 40_000 })));
      const del = captured.find((q) => q.sql.trim().toUpperCase().startsWith("DELETE"));
      expect(del?.sql.toUpperCase()).toContain("WHERE SEED = $1");
      // The inner keep-set subselect is also scoped to the same seed.
      expect(del?.sql.toUpperCase().match(/WHERE SEED = \$1/g)?.length).toBe(2);
      expect(del?.params?.[0]).toBe(123);
      expect(del?.params?.[1]).toBe(500);
    });

    it("rejects cross-origin with 403", async () => {
      const res = await POST(makeJsonPostRequest(validBody(), { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
    });

    it("rejects malformed JSON with 400", async () => {
      const res = await POST(makeJsonPostRequest("{not json"));
      expect(res.status).toBe(400);
    });
  });

  it("runs the runtime ensure (CREATE TABLE) exactly once per process", async () => {
    await GET(new Request("https://amindhou.com/api/password-game-2/leaderboard"));
    await GET(new Request("https://amindhou.com/api/password-game-2/leaderboard?seed=1"));
    await POST(makeJsonPostRequest(validBody({ seed: 3 })));
    expect(createTableCalls).toBe(1);
  });
});
