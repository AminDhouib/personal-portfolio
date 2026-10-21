import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dailySeed, dailySeedForDay } from "@/components/game/password-game-2/engine/rng";
import { makeJsonPostRequest, uniqueIp } from "@/test/api-route-helpers";

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
const txLog: string[] = [];
let nextId = 1;
// When set, the next query whose text contains this fragment throws (once).
let failOn: string | null = null;
// NOT reset between tests: the runtime ensure runs once per process, so the
// CREATE TABLE count must stay 1 across the whole file.
let createTableCalls = 0;
const createStatements: string[] = [];

function run(sql: string, params?: unknown[]): { rows: unknown[] } {
  captured.push({ sql, params });
  const text = sql.trim().toUpperCase();
  if (failOn !== null && text.includes(failOn.toUpperCase())) {
    failOn = null;
    throw new Error("simulated failure");
  }

  if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
    txLog.push(text);
    return { rows: [] };
  }
  if (text.startsWith("CREATE")) {
    createStatements.push(sql);
    if (text.includes("CREATE TABLE")) createTableCalls += 1;
    return { rows: [] };
  }
  if (text.startsWith("SELECT PG_ADVISORY_XACT_LOCK")) {
    txLog.push("LOCK");
    return { rows: [] };
  }
  if (text.includes("COUNT(*)")) {
    const seed = params?.[0] as number;
    const timeMs = params?.[1] as number;
    const faster = entries.filter((e) => e.seed === seed && (e.timeMs as number) < timeMs).length;
    return { rows: [{ rank: faster + 1 }] };
  }
  if (text.startsWith("INSERT")) {
    txLog.push("INSERT");
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
  if (text.startsWith("DELETE") && text.includes("OFFSET")) {
    // Global cap: everything after the first `offset` rows by (time_ms, id).
    txLog.push("CAP");
    const offset = params?.[0] as number;
    const doomed = new Set(
      [...entries]
        .sort((a, b) => (a.timeMs as number) - (b.timeMs as number) || a.id - b.id)
        .slice(offset)
        .map((e) => e.id),
    );
    for (let i = entries.length - 1; i >= 0; i--) {
      if (doomed.has(entries[i]!.id)) entries.splice(i, 1);
    }
    return { rows: [] };
  }
  if (text.startsWith("DELETE")) {
    txLog.push("SEED_TRIM");
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
  if (text.startsWith("SELECT") && text.includes("DAILY = TRUE")) {
    const seed = params?.[0] as number;
    const limit = params?.[1] as number;
    const filtered = entries
      .filter((e) => e.daily === true && e.seed === seed)
      .sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
    return { rows: filtered.slice(0, limit) };
  }
  if (text.startsWith("SELECT") && text.includes("WHERE SEED")) {
    const seed = params?.[0] as number;
    const limit = params?.[1] as number;
    const filtered = entries
      .filter((e) => e.seed === seed)
      .sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
    return { rows: filtered.slice(0, limit) };
  }
  if (text.startsWith("SELECT")) {
    const limit = params?.[0] as number;
    const sorted = [...entries].sort((a, b) => (a.timeMs as number) - (b.timeMs as number));
    return { rows: sorted.slice(0, limit) };
  }
  return { rows: [] };
}

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => run(sql, params)),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string, params?: unknown[]) => run(sql, params)),
      release: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    })),
  }),
}));

const { captureExceptionMock } = vi.hoisted(() => ({ captureExceptionMock: vi.fn() }));
vi.mock("@/lib/log", () => ({
  captureException: captureExceptionMock,
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

const BASE = "https://amindhou.com/api/password-game-2/leaderboard";

function get(query = "", ip = uniqueIp()): Promise<Response> {
  return GET(new Request(`${BASE}${query}`, { headers: { "x-forwarded-for": ip } }));
}

const dataSelects = () => captured.filter((q) => q.sql.trim().toUpperCase().startsWith("SELECT"));

describe("/api/password-game-2/leaderboard", () => {
  beforeEach(() => {
    entries.length = 0;
    captured.length = 0;
    txLog.length = 0;
    nextId = 1;
    failOn = null;
    captureExceptionMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET", () => {
    it("all-time: returns entries sorted by timeMs ascending, no WHERE filter", async () => {
      entries.push(
        { id: 1, name: "A", seed: 1, timeMs: 30_000, daily: false, createdAt: "" },
        { id: 2, name: "B", seed: 2, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: 3, timeMs: 20_000, daily: false, createdAt: "" },
      );
      const res = await get();
      expect(res.status).toBe(200);
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
      const select = dataSelects().at(-1);
      expect(select?.sql.toUpperCase()).not.toContain("WHERE");
      // Matches the (time_ms, id) index: ordered by the leading column, limited.
      expect(select?.sql.toUpperCase()).toContain("ORDER BY TIME_MS ASC");
    });

    it("seed: filters by ?seed= and orders by timeMs", async () => {
      entries.push(
        { id: 1, name: "A", seed: 1, timeMs: 20_000, daily: false, createdAt: "" },
        { id: 2, name: "B", seed: 1, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: 2, timeMs: 5_000, daily: false, createdAt: "" },
      );
      const res = await get("?seed=1");
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "A"]);
      const select = captured.find((q) => q.sql.toUpperCase().includes("WHERE SEED"));
      expect(select?.params).toEqual([1, 50]);
    });

    it("daily: ?daily=1 shows only today's daily-seed runs, not other daily=TRUE rows", async () => {
      const today = dailySeed();
      entries.push(
        { id: 1, name: "A", seed: today, timeMs: 30_000, daily: true, createdAt: "" },
        { id: 2, name: "B", seed: 2, timeMs: 10_000, daily: false, createdAt: "" },
        { id: 3, name: "C", seed: today, timeMs: 20_000, daily: true, createdAt: "" },
        // A forged daily=TRUE row on an unrelated seed (the old route listed it).
        { id: 4, name: "Forged", seed: 999, timeMs: 10_500, daily: true, createdAt: "" },
      );
      const res = await get("?daily=1");
      const body = (await res.json()) as Pg2GetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["C", "A"]);
      const select = captured.find((q) => q.sql.toUpperCase().includes("DAILY = TRUE"));
      expect(select?.params).toEqual([today, 50]);
      // The seed equality is what lets the (seed, time_ms) index serve this read.
      expect(select?.sql.toUpperCase()).toContain("SEED = $1");
    });

    it("filters the daily board by the UTC calendar day, not the session timezone", async () => {
      await get("?daily=1");
      const sql = captured.map((c) => c.sql).join("\n");
      expect(sql).toContain(
        "(created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date",
      );
      expect(sql).not.toContain("created_at::date = now()::date");
    });

    it("sets a short public cache header", async () => {
      const res = await get();
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });

    it.each(["1.5", "abc", "1e30", "1e3", "-1", "4294967296", "", "NaN", "0x10"])(
      "answers a malformed ?seed=%j with 400, never a 500, and reports nothing",
      async (raw) => {
        const res = await get(`?seed=${encodeURIComponent(raw)}`);
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toBe("invalid seed");
        expect(dataSelects()).toHaveLength(0);
        expect(captureExceptionMock).not.toHaveBeenCalled();
        expect(res.headers.get("Cache-Control") ?? "").not.toContain("s-maxage");
      },
    );

    it("accepts the seed boundaries 0 and 2^32-1", async () => {
      expect((await get("?seed=0")).status).toBe(200);
      expect((await get("?seed=4294967295")).status).toBe(200);
    });

    it("is rate limited per client IP: 60 reads a minute, then 429 with Retry-After", async () => {
      const ip = uniqueIp();
      for (let i = 0; i < 60; i++) {
        expect((await get("", ip)).status).toBe(200);
      }
      const blocked = await get("", ip);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
      // Another client is unaffected.
      expect((await get("", uniqueIp())).status).toBe(200);
    });

    it("does not touch the database for a rate-limited read", async () => {
      const ip = uniqueIp();
      for (let i = 0; i < 60; i++) await get("", ip);
      captured.length = 0;
      expect((await get("", ip)).status).toBe(429);
      expect(captured).toHaveLength(0);
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

      // The rank query is scoped to the same seed (mirrors the trim-scope assertion):
      // rank counts only strictly-faster runs OF THIS SEED, never a global position.
      const rankQuery = captured.find((q) => q.sql.toUpperCase().includes("COUNT(*)"));
      expect(rankQuery?.sql.toUpperCase()).toContain("WHERE SEED = $1");
      expect(rankQuery?.params?.[0]).toBe(7);
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

    it.each([1.5, 0.1, 4294967294.5])("rejects the fractional seed %s with 400", async (seed) => {
      const res = await POST(makeJsonPostRequest(validBody({ seed })));
      expect(res.status).toBe(400);
      expect(((await res.json()) as PostResponse).error).toBe("invalid seed");
      expect(entries).toHaveLength(0);
      expect(captureExceptionMock).not.toHaveBeenCalled();
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
      expect(storedName).not.toContain(" ");
    });

    it("defaults daily to false when a non-boolean is sent", async () => {
      await POST(makeJsonPostRequest(validBody({ daily: "yes", seed: 55 })));
      const insert = captured.find((q) => q.sql.trim().toUpperCase().startsWith("INSERT"));
      expect(insert?.params?.[3]).toBe(false);
    });

    it("stores the sanitized name, seed, time and a strict daily:true in insert order", async () => {
      await POST(
        makeJsonPostRequest(
          validBody({ name: "Ada", seed: dailySeed(), timeMs: 61_000, daily: true }),
        ),
      );
      const insert = captured.find((q) => q.sql.trim().toUpperCase().startsWith("INSERT"));
      expect(insert?.params).toEqual(["Ada", dailySeed(), 61_000, true]);
    });

    it("trim query targets the same seed only", async () => {
      await POST(makeJsonPostRequest(validBody({ seed: 123, timeMs: 40_000 })));
      const del = captured.find(
        (q) => q.sql.trim().toUpperCase().startsWith("DELETE") && !/OFFSET/i.test(q.sql),
      );
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

    describe("daily submissions", () => {
      it("accepts today's daily seed", async () => {
        const res = await POST(makeJsonPostRequest(validBody({ seed: dailySeed(), daily: true })));
        expect(res.status).toBe(200);
        expect(entries).toHaveLength(1);
      });

      it("rejects daily:true on any other seed with 400 and stores nothing", async () => {
        const res = await POST(makeJsonPostRequest(validBody({ seed: 12345, daily: true })));
        expect(res.status).toBe(400);
        expect(((await res.json()) as PostResponse).error).toBe("not the daily seed");
        expect(entries).toHaveLength(0);
        expect(captured.filter((q) => /INSERT/i.test(q.sql))).toHaveLength(0);
        expect(captureExceptionMock).not.toHaveBeenCalled();
      });

      it("still accepts a practice run (daily:false) on any seed", async () => {
        const res = await POST(makeJsonPostRequest(validBody({ seed: 12345, daily: false })));
        expect(res.status).toBe(200);
      });

      it("accepts yesterday's daily seed for a run that crossed midnight UTC, then stops", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const yesterday = dailySeedForDay("2026-10-20");

        vi.setSystemTime(new Date("2026-10-21T00:10:00.000Z"));
        const early = await POST(makeJsonPostRequest(validBody({ seed: yesterday, daily: true })));
        expect(early.status).toBe(200);

        vi.setSystemTime(new Date("2026-10-21T03:00:00.000Z"));
        const late = await POST(makeJsonPostRequest(validBody({ seed: yesterday, daily: true })));
        expect(late.status).toBe(400);
      });
    });

    describe("bounded growth", () => {
      it("runs lock, insert, per-seed trim and global cap in ONE transaction, in order", async () => {
        await POST(makeJsonPostRequest(validBody({ seed: 5, timeMs: 40_000 })));
        expect(txLog).toEqual(["BEGIN", "LOCK", "INSERT", "SEED_TRIM", "CAP", "COMMIT"]);
      });

      it("rolls the whole write back and reports a real server failure with a 500", async () => {
        failOn = "OFFSET";
        const res = await POST(makeJsonPostRequest(validBody({ seed: 5 })));
        expect(res.status).toBe(500);
        expect(txLog.at(-1)).toBe("ROLLBACK");
        expect(txLog).not.toContain("COMMIT");
        expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      });

      it("caps the table at 20,000 rows by evicting the slowest, oldest-last", async () => {
        for (let i = 0; i < 20_000; i++) {
          entries.push({
            id: nextId++,
            name: "x",
            seed: i,
            timeMs: 20_000 + i,
            daily: false,
            createdAt: "",
          });
        }
        // A fast run displaces the slowest row, so the all-time top of the table is preserved.
        await POST(makeJsonPostRequest(validBody({ seed: 90_000, timeMs: 10_000 })));
        expect(entries).toHaveLength(20_000);
        expect(entries.some((e) => e.timeMs === 10_000)).toBe(true);
        expect(entries.some((e) => e.timeMs === 20_000 + 19_999)).toBe(false);

        // A run slower than everything stored is itself the one evicted.
        await POST(makeJsonPostRequest(validBody({ seed: 90_001, timeMs: 3_000_000 })));
        expect(entries).toHaveLength(20_000);
        expect(entries.some((e) => e.timeMs === 3_000_000)).toBe(false);
      });

      it("passes the cap as the OFFSET parameter, so under the cap nothing is deleted", async () => {
        await POST(makeJsonPostRequest(validBody({ seed: 8 })));
        const cap = captured.find((q) => /OFFSET/i.test(q.sql));
        expect(cap?.params).toEqual([20_000]);
        expect(entries).toHaveLength(1);
      });
    });
  });

  describe("schema ensure", () => {
    it("ensures both indexes alongside the table, from the shared statements", async () => {
      await get();
      const sql = createStatements.join(" ");
      expect(sql).toContain("idx_pg2_leaderboard_seed_time");
      expect(sql).toContain("(seed, time_ms ASC)");
      expect(sql).toContain("idx_pg2_leaderboard_time_id");
      expect(sql).toContain("(time_ms ASC, id ASC)");
    });

    it("runs the runtime ensure (CREATE TABLE) exactly once per process", async () => {
      await get();
      await get("?seed=1");
      await POST(makeJsonPostRequest(validBody({ seed: 3 })));
      expect(createTableCalls).toBe(1);
    });
  });
});
