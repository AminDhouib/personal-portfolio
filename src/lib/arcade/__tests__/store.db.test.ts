// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertArcadeItUrl } from "@/test/arcade-it-guard";
import { ensureArcadeSchema } from "../schema";
import { readBoard, submitScore } from "../store";

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
    await pool.query("TRUNCATE arcade_scores, arcade_players CASCADE");
  });

  it("the ensure-step is idempotent, including three concurrent runs", async () => {
    await Promise.all([
      ensureArcadeSchema(pool),
      ensureArcadeSchema(pool),
      ensureArcadeSchema(pool),
    ]);
    const { rows } = await pool.query(
      `SELECT to_regclass('arcade_players') IS NOT NULL AS players,
              to_regclass('arcade_scores') IS NOT NULL AS scores,
              to_regclass('idx_arcade_scores_rank') IS NOT NULL AS idx`,
    );
    expect(rows[0]).toEqual({ players: true, scores: true, idx: true });
  });

  it("a new player is claimed with the sha256 of the token and a sanitized handle", async () => {
    await expect(put({ handle: "Ada" })).resolves.toMatchObject({ ok: true });
    const { rows } = await pool.query("SELECT id, token_hash, handle FROM arcade_players");
    expect(rows).toEqual([{ id: pid("1"), token_hash: sha(tok("A")), handle: "Ada" }]);
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

  it("the submit outcome reports the same rank as the board read", async () => {
    await put({ player: pid("1"), token: tok("A"), score: 5000 });
    const second = await put({ player: pid("2"), token: tok("B"), handle: "Bob", score: 3000 });
    expect(second).toMatchObject({ ok: true });
    if (second.ok) expect(second.boards.map((b) => b.rank)).toEqual([2, 2, 2]);
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
       SELECT 'space-shooter', b, $1, 1, '{}'::jsonb, now() FROM unnest($2::text[]) AS b`,
      [pid("1"), oldBoards],
    );
    await pool.query(
      `INSERT INTO arcade_scores (game, board, player_id, score, detail, achieved_at)
       VALUES ('hextris', 'daily:2020-01-01', $1, 1, '{}'::jsonb, now())`,
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
    await pool.query("DELETE FROM arcade_players WHERE id = $1", [pid("1")]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM arcade_scores");
    expect(rows[0]?.n).toBe(0);
  });
});
