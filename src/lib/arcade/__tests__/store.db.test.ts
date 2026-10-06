// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertArcadeItUrl } from "@/test/arcade-it-guard";
import { ensureArcadeSchema } from "../schema";
import { BOARD_ROW_CAP, readBoard, submitScore } from "../store";

// This file is the ONE sanctioned place a test talks to a real database (AGENTS.md hard
// boundary). It runs only when ARCADE_IT_DATABASE_URL is set (the CI db-integration job,
// or a throwaway local container, see RUNBOOK.md). It never reads DATABASE_URL, and the
// guard throws at import time, before any connection, for any host or database but
// localhost/127.0.0.1 and arcade_it.
const url = process.env.ARCADE_IT_DATABASE_URL;
if (url) assertArcadeItUrl(url);

const NOW = new Date("2026-10-06T12:00:00.000Z");
const pid = (d: string) =>
  `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`;
const tok = (c: string) => c.repeat(43);
const sha = (token: string) => createHash("sha256").update(token).digest("hex");
const DETAIL = { seconds: 60, kills: 40, distance: 1500 };

// Always runs, and is deliberately outside the skipIf below: if the CI job loses its
// database URL, the suite would otherwise skip and the job would still go green. GitHub
// Actions sets GITHUB_JOB to the job id, which is `db-integration` in .github/workflows/ci.yml.
describe("arcade real-Postgres suite wiring", () => {
  it("has its database URL whenever it runs in the CI db-integration job", () => {
    if (process.env.GITHUB_JOB === "db-integration") {
      expect(process.env.ARCADE_IT_DATABASE_URL).toBeTruthy();
    }
  });
});

describe.skipIf(!url)("arcade store against a real Postgres", () => {
  let pool: Pool;

  async function put(
    over: {
      player?: string;
      token?: string;
      handle?: string;
      score?: number;
      at?: Date;
      detail?: Record<string, number>;
    } = {},
  ) {
    return submitScore(
      pool,
      {
        game: "space-shooter",
        playerId: over.player ?? pid("1"),
        token: over.token ?? tok("A"),
        handle: over.handle ?? "Ada",
        score: over.score ?? 4200,
        detail: over.detail ?? DETAIL,
      },
      over.at ?? NOW,
    );
  }

  async function allTimeRows() {
    const { rows } = await pool.query(
      `SELECT player_id, score, detail FROM arcade_scores WHERE board = 'all-time' ORDER BY player_id`,
    );
    return rows as { player_id: string; score: string; detail: Record<string, number> }[];
  }

  async function boardCount(game: string, board: string): Promise<number> {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM arcade_scores WHERE game = $1::text AND board = $2::text",
      [game, board],
    );
    return (rows[0] as { n: number }).n;
  }

  /**
   * Fill one board with `count` ready-made players (random uuids from gen_random_uuid, tagged
   * through token_hash so they can be found again), scoring baseScore + 1 .. baseScore + count,
   * all achieved an hour before NOW. Set-based, so a full 1000-row board is two statements.
   */
  async function seedBoard(game: string, board: string, count: number, baseScore: number) {
    const tag = `seed:${game}:${board}`;
    await pool.query(
      `INSERT INTO arcade_players (id, token_hash, handle)
       SELECT gen_random_uuid(), $1::text, 'S' || n::text FROM generate_series(1, $2::int) AS n`,
      [tag, count],
    );
    await pool.query(
      `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
       SELECT $1::text, $2::text, p.id::uuid, $3::bigint + row_number() OVER (ORDER BY p.id),
              '{}'::jsonb, $4::timestamptz
         FROM arcade_players p
        WHERE p.token_hash = $5::text`,
      [game, board, baseScore, new Date(NOW.getTime() - 3_600_000), tag],
    );
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 5 });
    // The whole init.sql executes (this also proves the file is valid SQL), then the
    // ensure-step runs twice against the tables init.sql just created.
    await pool.query(readFileSync(path.resolve(process.cwd(), "db/init.sql"), "utf8"));
    await ensureArcadeSchema(pool);
    await ensureArcadeSchema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // arcade_migrations and the legacy table are cleared too, so each test controls whether
    // the one-time import has run and what it can see. arcade_it is a throwaway database.
    await pool.query(
      "TRUNCATE arcade_scores, arcade_players, arcade_migrations, leaderboard_entries CASCADE",
    );
  });

  it("the ensure-step creates the tables from nothing, even when three run concurrently", async () => {
    // The arcade_it database is this suite's alone (the guard guarantees it), and only the three
    // arcade tables are dropped. The tables are recreated here, so test order does not matter.
    // The legacy table is left in place (empty, from the beforeEach), so the first ensure to win
    // the advisory lock records the marker and imports nothing.
    await pool.query(
      "DROP TABLE IF EXISTS arcade_scores, arcade_players, arcade_migrations CASCADE",
    );
    const gone = await pool.query(
      `SELECT to_regclass('arcade_players') IS NULL AS players,
              to_regclass('arcade_scores') IS NULL AS scores,
              to_regclass('arcade_migrations') IS NULL AS migrations,
              to_regclass('idx_arcade_scores_rank') IS NULL AS idx`,
    );
    expect(gone.rows[0]).toEqual({ players: true, scores: true, migrations: true, idx: true });

    const results = await Promise.allSettled([
      ensureArcadeSchema(pool),
      ensureArcadeSchema(pool),
      ensureArcadeSchema(pool),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const { rows } = await pool.query(
      `SELECT to_regclass('arcade_players') IS NOT NULL AS players,
              to_regclass('arcade_scores') IS NOT NULL AS scores,
              to_regclass('arcade_migrations') IS NOT NULL AS migrations,
              to_regclass('idx_arcade_scores_rank') IS NOT NULL AS idx`,
    );
    expect(rows[0]).toEqual({ players: true, scores: true, migrations: true, idx: true });
  });

  it("a new player is claimed with the sha256 of the token and the handle it was given", async () => {
    // Sanitizing the handle is the route's job; the store keeps what it is handed.
    await expect(put({ handle: "Ada" })).resolves.toMatchObject({ ok: true });
    const { rows } = await pool.query("SELECT id, token_hash, handle FROM arcade_players");
    expect(rows).toEqual([{ id: pid("1"), token_hash: sha(tok("A")), handle: "Ada" }]);
  });

  it("every accepted submit refreshes the handle and last_seen_at, even when no score improves", async () => {
    const later = new Date(NOW.getTime() + 3_600_000);
    await put({ handle: "Ada", score: 4200 });
    const first = await pool.query(
      "SELECT handle, created_at, last_seen_at FROM arcade_players WHERE id = $1::uuid",
      [pid("1")],
    );
    expect(first.rows[0]?.handle).toBe("Ada");
    expect(first.rows[0]?.last_seen_at.getTime()).toBe(NOW.getTime());

    const outcome = await put({ handle: "Ada2", score: 100, at: later });
    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) expect(outcome.boards.map((b) => b.improved)).toEqual([false, false, false]);

    const second = await pool.query(
      "SELECT handle, created_at, last_seen_at FROM arcade_players WHERE id = $1::uuid",
      [pid("1")],
    );
    expect(second.rows[0]?.handle).toBe("Ada2");
    expect(second.rows[0]?.last_seen_at.getTime()).toBe(later.getTime());
    expect(second.rows[0]?.created_at.getTime()).toBe(first.rows[0]?.created_at.getTime());
  });

  it("writes the all-time, weekly and daily boards for the server clock", async () => {
    await put();
    const { rows } = await pool.query("SELECT board FROM arcade_scores ORDER BY board");
    expect(rows.map((r: { board: string }) => r.board)).toEqual([
      "all-time",
      "daily:2026-10-06",
      "weekly:2026-W41",
    ]);
  });

  it("a better score replaces the row and its detail, a worse or equal one does not", async () => {
    await put({ score: 4200 });
    await put({ score: 1000, detail: { ...DETAIL, kills: 1 } });
    await put({ score: 4200, detail: { ...DETAIL, kills: 2 } });
    let rows = await allTimeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe("4200");
    expect(rows[0]?.detail).toEqual(DETAIL);

    const outcome = await put({ score: 5000, detail: { ...DETAIL, kills: 41 } });
    expect(outcome).toMatchObject({ ok: true });
    rows = await allTimeRows();
    expect(rows[0]?.score).toBe("5000");
    expect(rows[0]?.detail).toEqual({ ...DETAIL, kills: 41 });
  });

  it("reports improved per board", async () => {
    await put({ score: 4200 });
    const worse = await put({ score: 100 });
    expect(worse).toMatchObject({ ok: true });
    if (worse.ok) expect(worse.boards.map((b) => b.improved)).toEqual([false, false, false]);
    const better = await put({ score: 4300 });
    expect(better).toMatchObject({ ok: true });
    if (better.ok)
      expect(better.boards.map((b) => [b.best, b.improved])).toEqual([
        [4300, true],
        [4300, true],
        [4300, true],
      ]);
  });

  it("an identity mismatch is rejected and leaves every table exactly as it was", async () => {
    await put({ score: 4200 });
    const before = await pool.query("SELECT * FROM arcade_scores ORDER BY board");
    const players = await pool.query("SELECT * FROM arcade_players");

    await expect(put({ token: tok("B"), score: 9000, handle: "Mallory" })).resolves.toEqual({
      ok: false,
      error: "identity",
    });

    expect((await pool.query("SELECT * FROM arcade_scores ORDER BY board")).rows).toEqual(
      before.rows,
    );
    expect((await pool.query("SELECT * FROM arcade_players")).rows).toEqual(players.rows);
  });

  it("two concurrent first claims of one id with different tokens: exactly one wins", async () => {
    const results = await Promise.all([put({ token: tok("A") }), put({ token: tok("B") })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const { rows } = await pool.query("SELECT token_hash FROM arcade_players");
    expect(rows).toHaveLength(1);
  });

  it("ranks with rank(): ties share a rank, an equal score reached later ranks below", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    await put({ player: pid("1"), token: tok("A"), handle: "P1", score: 4200 });
    await put({ player: pid("5"), token: tok("E"), handle: "P5", score: 4200 });
    await put({ player: pid("2"), token: tok("B"), handle: "P2", score: 4200, at: later });
    const top = await put({ player: pid("3"), token: tok("C"), handle: "P3", score: 5000 });

    expect(top).toMatchObject({ ok: true });
    const { entries, you } = await readBoard(pool, {
      game: "space-shooter",
      board: "all-time",
      playerId: pid("5"),
    });
    expect(entries.map((e) => [e.handle, e.rank, e.isYou])).toEqual([
      ["P3", 1, false],
      ["P1", 2, false],
      ["P5", 2, true],
      ["P2", 4, false],
    ]);
    expect(you).toEqual({ rank: 2, score: 4200 });
  });

  it("the caller's rank is the rank on their own board row, for every player, with ties", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    // Two rows with the same score and the same achieved_at, and one with the same score
    // reached later, plus a clear leader.
    await put({ player: pid("1"), token: tok("A"), handle: "P1", score: 4200 });
    await put({ player: pid("5"), token: tok("E"), handle: "P5", score: 4200 });
    await put({ player: pid("2"), token: tok("B"), handle: "P2", score: 4200, at: later });
    await put({ player: pid("3"), token: tok("C"), handle: "P3", score: 5000 });

    const expected: Record<string, number> = { P3: 1, P1: 2, P5: 2, P2: 4 };
    for (const [digit, handle] of [
      ["1", "P1"],
      ["5", "P5"],
      ["2", "P2"],
      ["3", "P3"],
    ] as const) {
      const { entries, you } = await readBoard(pool, {
        game: "space-shooter",
        board: "all-time",
        playerId: pid(digit),
      });
      const mine = entries.find((e) => e.isYou);
      expect(mine?.handle).toBe(handle);
      expect(you?.rank).toBe(mine?.rank);
      expect(you?.rank).toBe(expected[handle]);
    }
  });

  it("the submit outcome reports the same rank as the board read", async () => {
    await put({ player: pid("1"), token: tok("A"), score: 5000 });
    const second = await put({ player: pid("2"), token: tok("B"), handle: "Bob", score: 3000 });
    expect(second).toMatchObject({ ok: true });
    if (!second.ok) return;
    expect(second.boards.map((b) => b.rank)).toEqual([2, 2, 2]);
    for (const result of second.boards) {
      const { entries, you } = await readBoard(pool, {
        game: "space-shooter",
        board: result.board,
        playerId: pid("2"),
      });
      expect(you?.rank).toBe(result.rank);
      expect(entries.find((e) => e.isYou)?.rank).toBe(result.rank);
    }
  });

  describe("board row cap", () => {
    it("a score below a full board is cut: the count stays at the cap and the submitter's row is gone", async () => {
      await seedBoard("space-shooter", "all-time", BOARD_ROW_CAP, 1000);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP);

      const outcome = await put({ score: 500 });

      expect(outcome).toMatchObject({ ok: true });
      if (!outcome.ok) return;
      // The response keeps the rank computed before the trim.
      expect(outcome.boards.map((b) => [b.board, b.rank, b.improved])).toEqual([
        ["all-time", BOARD_ROW_CAP + 1, true],
        ["weekly:2026-W41", 1, true],
        ["daily:2026-10-06", 1, true],
      ]);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP);
      expect(await allTimeRows()).toHaveLength(BOARD_ROW_CAP);
      const mine = await pool.query(
        "SELECT 1 FROM arcade_scores WHERE board = 'all-time' AND player_id = $1::uuid",
        [pid("1")],
      );
      expect(mine.rows).toHaveLength(0);

      // A trimmed player reads as unranked on that board, and still ranked where they were kept.
      const read = (board: string) =>
        readBoard(pool, { game: "space-shooter", board, playerId: pid("1") });
      expect((await read("all-time")).you).toBeNull();
      expect((await read("weekly:2026-W41")).you).toEqual({ rank: 1, score: 500 });
      expect(await boardCount("space-shooter", "weekly:2026-W41")).toBe(1);
      expect(await boardCount("space-shooter", "daily:2026-10-06")).toBe(1);
    }, 30_000);

    it("a score above a full board stays and the previous lowest row is the one cut", async () => {
      await seedBoard("space-shooter", "all-time", BOARD_ROW_CAP, 1000);

      const outcome = await put({ score: 5000 });

      expect(outcome).toMatchObject({ ok: true });
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP);
      const rows = await allTimeRows();
      expect(rows.map((r) => r.score)).not.toContain("1001");
      expect(rows.map((r) => r.score)).toContain("1002");
      expect(rows.map((r) => r.player_id)).toContain(pid("1"));
      const { you } = await readBoard(pool, {
        game: "space-shooter",
        board: "all-time",
        playerId: pid("1"),
      });
      expect(you).toEqual({ rank: 1, score: 5000 });
    }, 30_000);

    it("leaves other boards and other games untouched, even when they are over the cap", async () => {
      await seedBoard("hextris", "all-time", BOARD_ROW_CAP + 1, 1000);
      await seedBoard("space-shooter", "daily:2026-10-05", BOARD_ROW_CAP + 1, 1000);
      await seedBoard("space-shooter", "weekly:2026-W40", BOARD_ROW_CAP + 1, 1000);
      await seedBoard("space-shooter", "all-time", BOARD_ROW_CAP, 1000);

      await put({ score: 500 });

      expect(await boardCount("hextris", "all-time")).toBe(BOARD_ROW_CAP + 1);
      expect(await boardCount("space-shooter", "daily:2026-10-05")).toBe(BOARD_ROW_CAP + 1);
      expect(await boardCount("space-shooter", "weekly:2026-W40")).toBe(BOARD_ROW_CAP + 1);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP);
    }, 30_000);

    it("does not trim a board the submit did not improve", async () => {
      await put({ score: 4200 });
      await seedBoard("space-shooter", "all-time", BOARD_ROW_CAP, 5000);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP + 1);

      const outcome = await put({ score: 100 });

      expect(outcome).toMatchObject({ ok: true });
      if (outcome.ok) expect(outcome.boards.map((b) => b.improved)).toEqual([false, false, false]);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP + 1);
    }, 30_000);

    it("concurrent submits by different players on a full board all succeed and leave exactly the cap", async () => {
      await seedBoard("space-shooter", "all-time", BOARD_ROW_CAP, 1000);

      const results = await Promise.all([
        put({ player: pid("1"), token: tok("A"), score: 500 }),
        put({ player: pid("2"), token: tok("B"), score: 600 }),
        put({ player: pid("3"), token: tok("C"), score: 700 }),
      ]);

      expect(results.every((r) => r.ok)).toBe(true);
      expect(await boardCount("space-shooter", "all-time")).toBe(BOARD_ROW_CAP);
    }, 30_000);
  });

  it("prunes this game's daily boards older than 30 days and weekly boards older than 12 weeks", async () => {
    await put();
    const oldBoards = [
      "daily:2026-09-05",
      "daily:2026-09-06",
      "weekly:2025-W52",
      "weekly:2026-W28",
      "weekly:2026-W29",
    ];
    await pool.query(
      `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
       SELECT 'space-shooter', b, $1::uuid, 1, '{}'::jsonb, now() FROM unnest($2::text[]) AS b`,
      [pid("1"), oldBoards],
    );
    await pool.query(
      `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
       VALUES ('hextris', 'daily:2020-01-01', $1::uuid, 1, '{}'::jsonb, now())`,
      [pid("1")],
    );

    await put();

    const { rows } = await pool.query("SELECT game, board FROM arcade_scores ORDER BY game, board");
    expect(rows).toEqual([
      { game: "hextris", board: "daily:2020-01-01" },
      { game: "space-shooter", board: "all-time" },
      { game: "space-shooter", board: "daily:2026-09-06" },
      { game: "space-shooter", board: "daily:2026-10-06" },
      { game: "space-shooter", board: "weekly:2026-W29" },
      { game: "space-shooter", board: "weekly:2026-W41" },
    ]);
  });

  it("concurrent submits by one player resolve to the maximum, one row per board", async () => {
    for (let round = 0; round < 5; round += 1) {
      await pool.query("TRUNCATE arcade_scores, arcade_players CASCADE");
      const scores = [1000, 3000, 2000, 5000, 4000];
      const results = await Promise.all(scores.map((score) => put({ score })));
      expect(results.every((r) => r.ok)).toBe(true);
      const { rows } = await pool.query("SELECT board, score FROM arcade_scores ORDER BY board");
      expect(rows).toEqual([
        { board: "all-time", score: "5000" },
        { board: "daily:2026-10-06", score: "5000" },
        { board: "weekly:2026-W41", score: "5000" },
      ]);
    }
  });

  it("returns real-driver types that the pins coerce: BIGINT as a string raw, a number from the store", async () => {
    await put({ score: 4200 });
    const raw = await pool.query(
      "SELECT score, achieved_at FROM arcade_scores WHERE board = 'all-time'",
    );
    expect(typeof raw.rows[0]?.score).toBe("string");
    expect(raw.rows[0]?.achieved_at).toBeInstanceOf(Date);

    const { entries } = await readBoard(pool, {
      game: "space-shooter",
      board: "all-time",
      playerId: null,
    });
    expect(entries[0]?.score).toBe(4200);
    expect(entries[0]?.rank).toBe(1);
    expect(entries[0]?.achievedAt).toBe("2026-10-06T12:00:00.000Z");
    expect(entries[0]?.isYou).toBe(false);
  });

  it("deleting a player cascades to their scores (the RUNBOOK data-surgery recipe)", async () => {
    await put();
    await pool.query("DELETE FROM arcade_players WHERE id = $1::uuid", [pid("1")]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM arcade_scores");
    expect(rows[0]?.n).toBe(0);
  });

  describe("legacy import", () => {
    interface LegacySeed {
      game: string;
      name: string;
      score: number;
      level?: number;
      seconds?: number | null;
      kills?: number | null;
      distance?: number | null;
      at: string;
    }

    const SS = { seconds: 60, kills: 40, distance: 1500 };
    const SEED: LegacySeed[] = [
      { game: "space-shooter", name: "Ada", score: 3000, ...SS, at: "2026-03-01T10:00:00.000Z" },
      { game: "space-shooter", name: "ada", score: 4200, ...SS, at: "2026-03-02T10:00:00.000Z" },
      { game: "space-shooter", name: "Bob", score: 5000, ...SS, at: "2026-03-02T11:00:00.000Z" },
      {
        game: "hextris",
        name: "ADA",
        score: 20000,
        seconds: 120,
        kills: 300,
        level: 17,
        at: "2026-03-05T10:00:00.000Z",
      },
      { game: "tower-stacker", name: "Tower", score: 99999, at: "2026-03-06T10:00:00.000Z" },
      {
        game: "space-shooter",
        name: "Cheat",
        score: 1_000_000,
        seconds: 10,
        kills: 0,
        distance: 0,
        at: "2026-03-07T10:00:00.000Z",
      },
      {
        game: "hextris",
        name: "Dee",
        score: 500,
        seconds: 30,
        kills: null,
        level: 2,
        at: "2026-03-08T10:00:00.000Z",
      },
    ];

    async function seedLegacy(rows: LegacySeed[]) {
      for (const r of rows) {
        await pool.query(
          `INSERT INTO leaderboard_entries (game, name, score, level, seconds, kills, distance, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            r.game,
            r.name,
            r.score,
            r.level ?? 1,
            r.seconds ?? null,
            r.kills ?? null,
            r.distance ?? null,
            r.at,
          ],
        );
      }
    }

    it("imports the plausible rows of the two arcade games as unclaimable players, all-time only", async () => {
      await seedLegacy(SEED);
      await expect(ensureArcadeSchema(pool)).resolves.toEqual({
        status: "imported",
        read: 6,
        superseded: 1,
        skippedUnverifiable: 1,
        skippedImplausible: 1,
        players: 2,
        scores: 3,
      });

      const players = await pool.query(
        "SELECT handle, token_hash, created_at FROM arcade_players ORDER BY created_at",
      );
      expect(players.rows).toEqual([
        { handle: "ADA", token_hash: "legacy", created_at: new Date("2026-03-02T10:00:00.000Z") },
        { handle: "Bob", token_hash: "legacy", created_at: new Date("2026-03-02T11:00:00.000Z") },
      ]);

      const scores = await pool.query(
        `SELECT p.handle, s.game, s.board, s.score, s.detail, s.achieved_at
           FROM arcade_scores s JOIN arcade_players p ON p.id = s.player_id
          ORDER BY s.game, s.score DESC`,
      );
      expect(scores.rows).toEqual([
        {
          handle: "ADA",
          game: "hextris",
          board: "all-time",
          score: "20000",
          detail: { seconds: 120, kills: 300, level: 17, legacy: true },
          achieved_at: new Date("2026-03-05T10:00:00.000Z"),
        },
        {
          handle: "Bob",
          game: "space-shooter",
          board: "all-time",
          score: "5000",
          detail: { ...SS, legacy: true },
          achieved_at: new Date("2026-03-02T11:00:00.000Z"),
        },
        {
          handle: "ADA",
          game: "space-shooter",
          board: "all-time",
          score: "4200",
          detail: { ...SS, legacy: true },
          achieved_at: new Date("2026-03-02T10:00:00.000Z"),
        },
      ]);
    });

    it("the imported rows read back through the store: ranked, flagged legacy, absent from daily", async () => {
      await seedLegacy(SEED);
      await ensureArcadeSchema(pool);
      const allTime = await readBoard(pool, {
        game: "space-shooter",
        board: "all-time",
        playerId: null,
      });
      expect(allTime.entries.map((e) => [e.handle, e.rank, e.score, e.detail.legacy])).toEqual([
        ["Bob", 1, 5000, true],
        ["ADA", 2, 4200, true],
      ]);
      const daily = await readBoard(pool, {
        game: "space-shooter",
        board: "daily:2026-10-06",
        playerId: null,
      });
      expect(daily.entries).toEqual([]);
    });

    it("runs once: a later start neither re-imports nor sees rows added since", async () => {
      await seedLegacy(SEED);
      await ensureArcadeSchema(pool);
      await seedLegacy([
        {
          game: "hextris",
          name: "Late",
          score: 10,
          seconds: 5,
          kills: 5,
          level: 1,
          at: "2026-04-01T10:00:00.000Z",
        },
      ]);
      await expect(ensureArcadeSchema(pool)).resolves.toEqual({ status: "already-applied" });
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM arcade_players");
      expect(rows[0]?.n).toBe(2);
      const late = await pool.query("SELECT 1 FROM arcade_players WHERE handle = 'Late'");
      expect(late.rows).toHaveLength(0);
    });

    it("three concurrent starts import exactly once (advisory lock plus marker)", async () => {
      await seedLegacy(SEED);
      const reports = await Promise.all([
        ensureArcadeSchema(pool),
        ensureArcadeSchema(pool),
        ensureArcadeSchema(pool),
      ]);
      expect(reports.filter((r) => r.status === "imported")).toHaveLength(1);
      expect(reports.filter((r) => r.status === "already-applied")).toHaveLength(2);
      const { rows } = await pool.query("SELECT count(*)::int AS n FROM arcade_players");
      expect(rows[0]?.n).toBe(2);
    });

    it("an imported player cannot be claimed with any token", async () => {
      await seedLegacy(SEED);
      await ensureArcadeSchema(pool);
      const found = await pool.query("SELECT id FROM arcade_players WHERE handle = 'Bob'");
      const id = found.rows[0]?.id as string;
      const before = await pool.query("SELECT * FROM arcade_scores ORDER BY game, score");
      await expect(put({ player: id, token: tok("Z"), score: 9000 })).resolves.toEqual({
        ok: false,
        error: "identity",
      });
      expect((await pool.query("SELECT * FROM arcade_scores ORDER BY game, score")).rows).toEqual(
        before.rows,
      );
    });

    it("records the marker and imports nothing when the legacy table does not exist", async () => {
      await pool.query("DROP TABLE IF EXISTS leaderboard_entries");
      try {
        await expect(ensureArcadeSchema(pool)).resolves.toEqual({ status: "no-legacy-table" });
        const { rows } = await pool.query("SELECT key FROM arcade_migrations");
        expect(rows).toEqual([{ key: "legacy-leaderboard-import-v1" }]);
      } finally {
        // Recreate the legacy table (init.sql is idempotent) so later tests and reruns have it.
        await pool.query(readFileSync(path.resolve(process.cwd(), "db/init.sql"), "utf8"));
      }
    });
  });
});
