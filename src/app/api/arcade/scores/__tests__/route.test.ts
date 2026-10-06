import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeJsonPostRequest, uniqueIp } from "@/test/api-route-helpers";
import { createFakePool } from "@/test/fake-pg";

// Same shape as the legacy route test: the pool is the only thing replaced. Here it is an
// in-memory emulation of the five arcade statements, so the real store and the real
// getArcadePool run end to end through the real route.
const state = vi.hoisted(() => ({ pool: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => state.pool }));
vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

interface StoredScore {
  game: string;
  board: string;
  playerId: string;
  score: number;
  detail: Record<string, number>;
  achievedAt: Date;
}

/** Emulates the arcade tables, mimicking driver types: BIGINT score as a string, Date, int rank. */
function createEmulator() {
  let players = new Map<string, { tokenHash: string; handle: string }>();
  let scores: StoredScore[] = [];
  let snapshot: { players: typeof players; scores: StoredScore[] } | null = null;
  let failOn: RegExp | null = null;

  function rankOf(mine: StoredScore): number {
    const ahead = scores.filter(
      (o) =>
        o.game === mine.game &&
        o.board === mine.board &&
        (o.score > mine.score ||
          (o.score === mine.score && o.achievedAt.getTime() < mine.achievedAt.getTime())),
    );
    return 1 + ahead.length;
  }

  const fake = createFakePool((sql, params) => {
    if (failOn?.test(sql)) throw new Error("db down");
    if (sql === "BEGIN") {
      snapshot = { players: new Map(players), scores: scores.map((s) => ({ ...s })) };
      return undefined;
    }
    if (sql === "ROLLBACK") {
      if (snapshot) {
        players = snapshot.players;
        scores = snapshot.scores;
      }
      return undefined;
    }
    if (sql.startsWith("INSERT INTO arcade_players")) {
      const [id, tokenHash, handle] = params as [string, string, string];
      if (!players.has(id)) players.set(id, { tokenHash, handle });
      return undefined;
    }
    if (sql.startsWith("SELECT token_hash")) {
      const player = players.get(params[0] as string);
      return { rows: player ? [{ token_hash: player.tokenHash }] : [] };
    }
    if (sql.startsWith("UPDATE arcade_players")) {
      const [id, handle] = params as [string, string];
      const player = players.get(id);
      if (player) player.handle = handle;
      return undefined;
    }
    if (sql.startsWith("INSERT INTO arcade_scores")) {
      const [game, board, playerId, score, detailJson, now] = params as [
        string,
        string,
        string,
        number,
        string,
        Date,
      ];
      const existing = scores.find(
        (s) => s.game === game && s.board === board && s.playerId === playerId,
      );
      const detail = JSON.parse(detailJson) as Record<string, number>;
      if (!existing) {
        scores.push({ game, board, playerId, score, detail, achievedAt: now });
        return { rows: [{ score: String(score) }] };
      }
      if (score > existing.score) {
        existing.score = score;
        existing.detail = detail;
        existing.achievedAt = now;
        return { rows: [{ score: String(score) }] };
      }
      return { rows: [] };
    }
    if (sql.startsWith("DELETE FROM arcade_scores")) {
      const [game, daily, weekly] = params as [string, string, string];
      scores = scores.filter(
        (s) =>
          !(
            s.game === game &&
            ((s.board.startsWith("daily:") && s.board < daily) ||
              (s.board.startsWith("weekly:") && s.board < weekly))
          ),
      );
      return undefined;
    }
    if (sql.startsWith("SELECT s.score")) {
      const [game, board, playerId] = params as [string, string, string];
      const mine = scores.find(
        (s) => s.game === game && s.board === board && s.playerId === playerId,
      );
      return { rows: mine ? [{ score: String(mine.score), rank: rankOf(mine) }] : [] };
    }
    if (sql.includes("p.handle")) {
      const [game, board, playerId, limit] = params as [string, string, string | null, number];
      const rows = scores
        .filter((s) => s.game === game && s.board === board)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.achievedAt.getTime() - b.achievedAt.getTime() ||
            a.playerId.localeCompare(b.playerId),
        )
        .slice(0, limit)
        .map((s) => ({
          rank: rankOf(s),
          handle: players.get(s.playerId)?.handle ?? "?",
          score: String(s.score),
          detail: s.detail,
          achievedAt: s.achievedAt,
          isYou: s.playerId === playerId,
        }));
      return { rows };
    }
    if (sql.includes("WHERE r.player_id")) {
      const [game, board, playerId] = params as [string, string, string];
      const mine = scores.find(
        (s) => s.game === game && s.board === board && s.playerId === playerId,
      );
      return { rows: mine ? [{ rank: rankOf(mine), score: String(mine.score) }] : [] };
    }
    return undefined;
  });

  return {
    fake,
    scores: () => scores,
    players: () => players,
    failOn: (pattern: RegExp | null) => {
      failOn = pattern;
    },
  };
}

type RouteModule = typeof import("../route");
let GET: RouteModule["GET"];
let POST: RouteModule["POST"];
let emu: ReturnType<typeof createEmulator>;

// The route and this helper share one module registry (reset in beforeEach), so this is
// the very mock the route calls.
async function reported() {
  const log = await import("@/lib/log");
  return vi.mocked(log.captureException);
}

const URL_SCORES = "https://amindhou.com/api/arcade/scores";
const NOW = new Date("2026-10-06T12:00:00.000Z");
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const T1 = "A".repeat(43);
const T2 = "B".repeat(43);
const SS_DETAIL = { seconds: 60, kills: 40, distance: 1500 };

interface SubmitBody {
  ok?: boolean;
  error?: string;
  reason?: string;
  boards?: { period: string; board: string; rank: number; best: number; improved: boolean }[];
}
interface ReadBody {
  game: string;
  board: string;
  entries: {
    rank: number;
    handle: string;
    score: number;
    detail: Record<string, number>;
    achievedAt: string;
    isYou: boolean;
  }[];
  you: { rank: number; score: number } | null;
}

function body(over: Record<string, unknown> = {}) {
  return {
    game: "space-shooter",
    playerId: P1,
    token: T1,
    handle: "Ada",
    score: 4200,
    detail: SS_DETAIL,
    ...over,
  };
}

function post(payload: unknown, opts: Parameters<typeof makeJsonPostRequest>[1] = {}) {
  return POST(makeJsonPostRequest(payload, { url: URL_SCORES, ...opts }));
}

async function submit(over: Record<string, unknown> = {}) {
  const res = await post(body(over));
  return { res, json: (await res.json()) as SubmitBody };
}

async function read(query: string) {
  const res = await GET(new Request(`${URL_SCORES}?${query}`));
  return { res, json: (await res.json()) as ReadBody };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  emu = createEmulator();
  state.pool = emu.fake.pool;
  // A fresh module graph per test: getArcadePool memoizes the ensure-step per process.
  vi.resetModules();
  ({ GET, POST } = await import("../route"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/arcade/scores", () => {
  it("persists a valid score on all three boards and reports rank, best and improved", async () => {
    const { res, json } = await submit();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      boards: [
        { period: "all-time", board: "all-time", rank: 1, best: 4200, improved: true },
        { period: "weekly", board: "weekly:2026-W41", rank: 1, best: 4200, improved: true },
        { period: "daily", board: "daily:2026-10-06", rank: 1, best: 4200, improved: true },
      ],
    });
    expect(emu.scores().map((s) => s.board)).toEqual([
      "all-time",
      "weekly:2026-W41",
      "daily:2026-10-06",
    ]);
  });

  it("claims the player id on first use, storing only the token hash", async () => {
    await submit();
    expect(emu.players().get(P1)).toEqual({
      tokenHash: createHash("sha256").update(T1).digest("hex"),
      handle: "Ada",
    });
  });

  it("never echoes the token or player id", async () => {
    const { json } = await submit();
    const text = JSON.stringify(json);
    expect(text).not.toContain(T1);
    expect(text).not.toContain(P1);
  });

  it("a lower score does not replace the best (improved false, best unchanged)", async () => {
    await submit({ score: 4200 });
    const { json } = await submit({ score: 1000 });
    expect(json.boards?.map((b) => [b.best, b.improved])).toEqual([
      [4200, false],
      [4200, false],
      [4200, false],
    ]);
    expect(emu.scores().every((s) => s.score === 4200)).toBe(true);
  });

  it("a higher score replaces it, and the detail follows the new best", async () => {
    await submit({ score: 4200 });
    const { json } = await submit({ score: 5000, detail: { ...SS_DETAIL, kills: 41 } });
    expect(json.boards?.map((b) => [b.best, b.improved])).toEqual([
      [5000, true],
      [5000, true],
      [5000, true],
    ]);
    expect(emu.scores().every((s) => s.score === 5000 && s.detail.kills === 41)).toBe(true);
  });

  it("a second player ranks below a better first player", async () => {
    await submit();
    const { json } = await submit({ playerId: P2, token: T2, handle: "Bob", score: 3000 });
    expect(json.boards?.map((b) => b.rank)).toEqual([2, 2, 2]);
  });

  it("an equal score reached later ranks below the earlier achiever", async () => {
    await submit();
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const { json } = await submit({ playerId: P2, token: T2, handle: "Bob" });
    expect(json.boards?.[0]?.rank).toBe(2);
  });

  it("rejects a different token for a claimed player id with 403 and changes nothing", async () => {
    await submit();
    const before = JSON.stringify(emu.scores());
    const { res, json } = await submit({ token: T2, score: 9000 });
    expect(res.status).toBe(403);
    expect(json).toEqual({ error: "identity" });
    expect(JSON.stringify(emu.scores())).toBe(before);
  });

  it("truncates the handle to 12 characters and strips bidi controls", async () => {
    await submit({ handle: "  Averyveryverylongname  " });
    expect(emu.players().get(P1)?.handle).toBe("Averyveryver");
  });

  it.each([["   "], ["‮"]])("falls back to Pilot for the handle %j", async (handle) => {
    await submit({ handle });
    expect(emu.players().get(P1)?.handle).toBe("Pilot");
  });

  it("creates the arcade tables before the first query, once per process", async () => {
    await submit();
    await submit({ score: 4300 });
    const sqls = emu.fake.sqls();
    const locks = sqls.filter((sql) => sql.startsWith("SELECT pg_advisory_xact_lock"));
    expect(locks).toHaveLength(1);
    const lockAt = sqls.indexOf("SELECT pg_advisory_xact_lock($1)");
    const firstPlayerInsert = sqls.findIndex((sql) => sql.startsWith("INSERT INTO arcade_players"));
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(firstPlayerInsert);
  });

  describe("body validation (400)", () => {
    it.each([
      ["short token", { token: "A".repeat(42) }],
      ["token with a bad character", { token: `${"A".repeat(42)}+` }],
      ["non-uuid player id", { playerId: "not-a-uuid" }],
      ["negative score", { score: -1 }],
      ["fractional score", { score: 1.5 }],
      ["score over the 10,000,000 cap", { score: 10_000_001 }],
      ["string score", { score: "100" }],
      ["unknown game", { game: "not-a-game" }],
      ["a real game that is not in the arcade", { game: "tower-stacker" }],
      ["missing detail field", { detail: { seconds: 60, kills: 40 } }],
      ["extra detail key (region is not accepted)", { detail: { ...SS_DETAIL, region: 1 } }],
      ["non-integer detail value", { detail: { ...SS_DETAIL, seconds: 1.5 } }],
      ["numeric handle", { handle: 12 }],
      ["unknown top-level key", { region: "Canada" }],
    ])("rejects %s", async (_name, over) => {
      const { res } = await submit(over);
      expect(res.status).toBe(400);
      expect(emu.scores()).toHaveLength(0);
    });

    it("rejects a missing game and a missing detail", async () => {
      const noGame: Record<string, unknown> = body();
      delete noGame.game;
      const noDetail: Record<string, unknown> = body();
      delete noDetail.detail;
      expect((await post(noGame)).status).toBe(400);
      expect((await post(noDetail)).status).toBe(400);
    });

    it("rejects a detail whose shape does not fit the game with a detail error", async () => {
      const res = await post(body({ game: "hextris", detail: SS_DETAIL }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid detail" });
    });
  });

  it("answers an implausible score with 422 and a stable reason, writing nothing", async () => {
    const { res, json } = await submit({
      score: 1_000_000,
      detail: { seconds: 10, kills: 0, distance: 0 },
    });
    expect(res.status).toBe(422);
    expect(json).toEqual({ error: "implausible", reason: "score too high for the run" });
    expect(emu.scores()).toHaveLength(0);
    expect(emu.players().size).toBe(0);
  });

  it("validates Hextris submissions with the Hextris checks", async () => {
    const ok = await post(
      body({ game: "hextris", score: 20_000, detail: { seconds: 120, kills: 300, level: 17 } }),
    );
    expect(ok.status).toBe(200);
    const bad = await post(
      body({ game: "hextris", score: 20_000, detail: { seconds: 120, kills: 2, level: 1 } }),
    );
    expect(bad.status).toBe(422);
  });

  describe("guard chain", () => {
    it("rejects a cross-origin request with 403 before touching the database", async () => {
      const res = await post(body(), { origin: "https://evil.example" });
      expect(res.status).toBe(403);
      expect(emu.fake.queries).toHaveLength(0);
    });

    it("rejects malformed JSON with 400", async () => {
      const res = await post("{not json");
      expect(res.status).toBe(400);
    });

    it("rejects an oversized body with 413", async () => {
      const res = await post(body({ handle: "x".repeat(20_000) }));
      expect(res.status).toBe(413);
    });

    it("rate limits at 10 submits per minute per client with 429", async () => {
      const ip = uniqueIp();
      for (let i = 0; i < 10; i += 1) {
        expect((await post(body(), { ip })).status).toBe(200);
      }
      expect((await post(body(), { ip })).status).toBe(429);
    });
  });

  it("answers a database failure with 500, reports it, and rolls back", async () => {
    emu.failOn(/^INSERT INTO arcade_scores/);
    const { res, json } = await submit();
    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "could not save score" });
    expect(await reported()).toHaveBeenCalledWith("api:arcade-scores.write", expect.any(Error));
    expect(emu.scores()).toHaveLength(0);
  });
});

describe("GET /api/arcade/scores", () => {
  it.each([
    ["no parameters", ""],
    ["missing board", "game=space-shooter"],
    ["missing game", "board=all-time"],
    ["unknown game", "game=nope&board=all-time"],
    ["a real game that is not in the arcade", "game=tower-stacker&board=all-time"],
    ["unknown board", "game=space-shooter&board=monthly"],
    ["malformed player", `game=space-shooter&board=all-time&player=xyz`],
  ])("returns 400 for %s", async (_name, query) => {
    const { res } = await read(query);
    expect(res.status).toBe(400);
  });

  it("returns an empty board with the server-computed key", async () => {
    const { res, json } = await read("game=space-shooter&board=daily");
    expect(res.status).toBe(200);
    expect(json).toEqual({
      game: "space-shooter",
      board: "daily:2026-10-06",
      entries: [],
      you: null,
    });
  });

  it.each([
    ["all-time", "all-time"],
    ["weekly", "weekly:2026-W41"],
    ["daily", "daily:2026-10-06"],
  ])("maps board=%s to key %s", async (period, key) => {
    const { json } = await read(`game=hextris&board=${period}`);
    expect(json.board).toBe(key);
  });

  it("uses a short public cache without a player and no cache with one", async () => {
    const anon = await read("game=space-shooter&board=all-time");
    expect(anon.res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    const mine = await read(`game=space-shooter&board=all-time&player=${P1}`);
    expect(mine.res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("lists ranked entries with number scores and ISO dates, and marks the caller", async () => {
    await submit();
    await submit({ playerId: P2, token: T2, handle: "Bob", score: 3000 });
    const { json } = await read(`game=space-shooter&board=all-time&player=${P2}`);
    expect(json.entries).toEqual([
      {
        rank: 1,
        handle: "Ada",
        score: 4200,
        detail: SS_DETAIL,
        achievedAt: "2026-10-06T12:00:00.000Z",
        isYou: false,
      },
      {
        rank: 2,
        handle: "Bob",
        score: 3000,
        detail: SS_DETAIL,
        achievedAt: "2026-10-06T12:00:00.000Z",
        isYou: true,
      },
    ]);
    expect(json.you).toEqual({ rank: 2, score: 3000 });
  });

  it("without a player nobody is marked and you is null; the JSON carries no ids", async () => {
    await submit();
    const { res, json } = await read("game=space-shooter&board=all-time");
    expect(json.entries.every((entry) => entry.isYou === false)).toBe(true);
    expect(json.you).toBeNull();
    const text = JSON.stringify(json);
    expect(text).not.toContain(P1);
    expect(text).not.toContain("token");
    expect(res.status).toBe(200);
  });

  it("you is null for a player with no row on that board", async () => {
    await submit();
    const { json } = await read(`game=space-shooter&board=all-time&player=${P2}`);
    expect(json.you).toBeNull();
  });

  it("the daily board rolls over at 00:00Z while all-time keeps the row", async () => {
    await submit();
    vi.setSystemTime(new Date("2026-10-07T00:00:00.000Z"));
    const daily = await read("game=space-shooter&board=daily");
    expect(daily.json.board).toBe("daily:2026-10-07");
    expect(daily.json.entries).toEqual([]);
    const allTime = await read("game=space-shooter&board=all-time");
    expect(allTime.json.entries).toHaveLength(1);
  });

  it("answers a database failure with 500 and reports it", async () => {
    emu.failOn(/^SELECT r\.rank/);
    const { res } = await read("game=space-shooter&board=all-time");
    expect(res.status).toBe(500);
    expect(await reported()).toHaveBeenCalledWith("api:arcade-scores.read", expect.any(Error));
  });
});
