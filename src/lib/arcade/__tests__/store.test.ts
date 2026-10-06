import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createFakePool } from "@/test/fake-pg";
import { readBoard, submitScore } from "../store";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const PLAYER = "11111111-1111-4111-8111-111111111111";
const TOKEN = "A".repeat(43);
// Pinned independently of createHash: sha256 of 43 "A" characters, hex.
const TOKEN_HASH = "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a";
const DETAIL = { seconds: 60, kills: 40, distance: 1500 };
const INPUT = {
  game: "space-shooter" as const,
  playerId: PLAYER,
  token: TOKEN,
  handle: "Ada",
  score: 4200,
  detail: DETAIL,
};

function label(sql: string): string {
  return sql.split(" ").slice(0, 3).join(" ");
}

interface Script {
  storedHash?: string;
  improved?: boolean[];
  best?: { score: string | number; rank: number }[];
  failOn?: RegExp;
}

/** A fake that answers each statement the store issues, in the order it issues them. */
function scripted(script: Script = {}) {
  let upserts = 0;
  let bests = 0;
  return createFakePool((sql) => {
    if (script.failOn?.test(sql)) throw new Error("db down");
    if (sql.startsWith("SELECT token_hash")) {
      return { rows: [{ token_hash: script.storedHash ?? TOKEN_HASH }] };
    }
    if (sql.startsWith("INSERT INTO arcade_scores")) {
      const improved = script.improved?.[upserts] ?? true;
      upserts += 1;
      return { rows: improved ? [{ score: "4200" }] : [] };
    }
    if (sql.startsWith("SELECT s.score")) {
      const row = script.best?.[bests] ?? { score: "4200", rank: 1 };
      bests += 1;
      return { rows: [row] };
    }
    return undefined;
  });
}

describe("submitScore: statement sequence and parameters", () => {
  it("runs one transaction in a fixed order", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    expect(fake.sqls().map(label)).toEqual([
      "BEGIN",
      "INSERT INTO arcade_players",
      "SELECT token_hash FROM",
      "UPDATE arcade_players SET",
      "INSERT INTO arcade_scores",
      "INSERT INTO arcade_scores",
      "INSERT INTO arcade_scores",
      "DELETE FROM arcade_scores",
      "SELECT s.score, (1",
      "SELECT s.score, (1",
      "SELECT s.score, (1",
      "COMMIT",
    ]);
    expect(fake.stats).toEqual({ connects: 1, released: 1, destroyed: 0 });
  });

  it("stores only the sha256 of the token, never the token", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    expect(fake.queries[1]?.params).toEqual([PLAYER, TOKEN_HASH, "Ada"]);
    for (const query of fake.queries) expect(query.params).not.toContain(TOKEN);
    expect(fake.sqls().join(" ")).not.toContain(TOKEN);
  });

  it("upserts the all-time, weekly and daily boards with the server clock and JSON detail", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    const upserts = fake.queries.filter((q) => q.sql.startsWith("INSERT INTO arcade_scores"));
    expect(upserts.map((q) => q.params)).toEqual([
      ["space-shooter", "all-time", PLAYER, 4200, JSON.stringify(DETAIL), NOW],
      ["space-shooter", "weekly:2026-W41", PLAYER, 4200, JSON.stringify(DETAIL), NOW],
      ["space-shooter", "daily:2026-10-06", PLAYER, 4200, JSON.stringify(DETAIL), NOW],
    ]);
  });

  it("only replaces a row when the new score is strictly higher (ties keep the earlier achiever)", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    const upsert = fake.sqls().find((sql) => sql.startsWith("INSERT INTO arcade_scores")) ?? "";
    expect(upsert).toContain("ON CONFLICT (game, board, player_id) DO UPDATE");
    expect(upsert).toContain("WHERE EXCLUDED.score > arcade_scores.score");
    expect(upsert).toContain("RETURNING score");
  });

  it("refreshes the handle and last_seen_at on every accepted submit", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    const touch = fake.queries.find((q) => q.sql.startsWith("UPDATE arcade_players"));
    expect(touch?.params).toEqual([PLAYER, "Ada", NOW]);
  });

  it("prunes old daily and weekly boards of this game only, with locale-independent comparison", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    const prune = fake.queries.find((q) => q.sql.startsWith("DELETE FROM arcade_scores"));
    expect(prune?.params).toEqual(["space-shooter", "daily:2026-09-06", "weekly:2026-W29"]);
    expect(prune?.sql).toContain("game = $1");
    expect(prune?.sql).toContain(`board COLLATE "C" < $2`);
    expect(prune?.sql).toContain(`board COLLATE "C" < $3`);
    expect(prune?.sql).not.toContain("all-time");
  });

  it("reads back best and rank per board with the tie-break rank formula", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    const reads = fake.queries.filter((q) => q.sql.startsWith("SELECT s.score"));
    expect(reads.map((q) => q.params)).toEqual([
      ["space-shooter", "all-time", PLAYER],
      ["space-shooter", "weekly:2026-W41", PLAYER],
      ["space-shooter", "daily:2026-10-06", PLAYER],
    ]);
    expect(reads[0]?.sql).toContain(
      "o.score > s.score OR (o.score = s.score AND o.achieved_at < s.achieved_at)",
    );
    expect(reads[0]?.sql).toContain("::int AS rank");
  });

  it("interpolates no user value into SQL text", async () => {
    const fake = scripted();
    await submitScore(fake.pool, { ...INPUT, handle: "Bobby'; DROP TABLE arcade_scores;--" }, NOW);
    expect(fake.sqls().join(" ")).not.toContain("Bobby");
    expect(fake.sqls().join(" ")).not.toContain("DROP TABLE");
  });
});

describe("submitScore: outcome", () => {
  it("reports period, board key, rank, best and improved for each board, coercing BIGINT strings", async () => {
    const fake = scripted({
      improved: [true, false, false],
      best: [
        { score: "4200", rank: 1 },
        { score: "5000", rank: 3 },
        { score: "4300", rank: 7 },
      ],
    });
    await expect(submitScore(fake.pool, INPUT, NOW)).resolves.toEqual({
      ok: true,
      boards: [
        { period: "all-time", board: "all-time", rank: 1, best: 4200, improved: true },
        { period: "weekly", board: "weekly:2026-W41", rank: 3, best: 5000, improved: false },
        { period: "daily", board: "daily:2026-10-06", rank: 7, best: 4300, improved: false },
      ],
    });
  });

  it("throws, and rolls back, if the score row is missing after the upsert", async () => {
    const fake = createFakePool((sql) => {
      if (sql.startsWith("SELECT token_hash")) return { rows: [{ token_hash: TOKEN_HASH }] };
      if (sql.startsWith("INSERT INTO arcade_scores")) return { rows: [{ score: "1" }] };
      return undefined;
    });
    await expect(submitScore(fake.pool, INPUT, NOW)).rejects.toThrow(/score row missing/);
    expect(fake.sqls().at(-1)).toBe("ROLLBACK");
  });
});

describe("submitScore: identity (trust on first use)", () => {
  it("a different token for a claimed id is an identity failure, rolled back, with no score written", async () => {
    const fake = scripted({ storedHash: "f".repeat(64) });
    await expect(submitScore(fake.pool, INPUT, NOW)).resolves.toEqual({
      ok: false,
      error: "identity",
    });
    expect(fake.sqls().at(-1)).toBe("ROLLBACK");
    expect(fake.sqls().some((sql) => sql.startsWith("INSERT INTO arcade_scores"))).toBe(false);
    expect(fake.sqls().some((sql) => sql.startsWith("UPDATE arcade_players"))).toBe(false);
    expect(fake.stats.released).toBe(1);
  });

  it("a legacy-imported player (hash 'legacy', shorter than any real hash) can never be claimed", async () => {
    const fake = scripted({ storedHash: "legacy" });
    await expect(submitScore(fake.pool, INPUT, NOW)).resolves.toEqual({
      ok: false,
      error: "identity",
    });
  });

  it("the matching token is accepted", async () => {
    const fake = scripted({ storedHash: createHash("sha256").update(TOKEN).digest("hex") });
    await expect(submitScore(fake.pool, INPUT, NOW)).resolves.toMatchObject({ ok: true });
  });

  it("locks the player row (FOR UPDATE) before the identity check so one player's submits serialize", async () => {
    const fake = scripted();
    await submitScore(fake.pool, INPUT, NOW);
    expect(fake.sqls()[2]).toBe("SELECT token_hash FROM arcade_players WHERE id = $1 FOR UPDATE");
  });
});

describe("submitScore: failures", () => {
  it("rethrows a database failure (it is not an identity failure) after rolling back", async () => {
    const fake = scripted({ failOn: /^INSERT INTO arcade_scores/ });
    await expect(submitScore(fake.pool, INPUT, NOW)).rejects.toThrow("db down");
    expect(fake.sqls().at(-1)).toBe("ROLLBACK");
    expect(fake.stats.released).toBe(1);
  });
});

describe("readBoard", () => {
  function boardRow(over: Record<string, unknown> = {}) {
    return {
      rank: 1,
      handle: "Ada",
      score: "4200",
      detail: { seconds: 60 },
      achievedAt: new Date("2026-10-06T10:00:00.000Z"),
      isYou: false,
      ...over,
    };
  }

  function boardFake(rows: Record<string, unknown>[], you?: Record<string, unknown>) {
    return createFakePool((sql) => {
      if (sql.includes("p.handle")) return { rows };
      if (sql.includes("WHERE r.player_id")) return { rows: you ? [you] : [] };
      return undefined;
    });
  }

  it("anonymous read: one query, limit 25, no player, you is null", async () => {
    const fake = boardFake([boardRow()]);
    const result = await readBoard(fake.pool, {
      game: "hextris",
      board: "all-time",
      playerId: null,
    });
    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.params).toEqual(["hextris", "all-time", null, 25]);
    expect(result.you).toBeNull();
  });

  it("coerces driver types: BIGINT string score to number, Date to ISO string", async () => {
    const fake = boardFake([boardRow({ rank: "1" })]);
    const { entries } = await readBoard(fake.pool, {
      game: "hextris",
      board: "all-time",
      playerId: null,
    });
    expect(entries).toEqual([
      {
        rank: 1,
        handle: "Ada",
        score: 4200,
        detail: { seconds: 60 },
        achievedAt: "2026-10-06T10:00:00.000Z",
        isYou: false,
      },
    ]);
  });

  it("with a player: a second query for their own rank, parsed", async () => {
    const fake = boardFake([boardRow({ isYou: true })], { rank: 4, score: "900" });
    const result = await readBoard(fake.pool, {
      game: "hextris",
      board: "daily:2026-10-06",
      playerId: PLAYER,
    });
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0]?.params).toEqual(["hextris", "daily:2026-10-06", PLAYER, 25]);
    expect(fake.queries[1]?.params).toEqual(["hextris", "daily:2026-10-06", PLAYER]);
    expect(result.entries[0]?.isYou).toBe(true);
    expect(result.you).toEqual({ rank: 4, score: 900 });
  });

  it("you is null when the player has no row on that board", async () => {
    const fake = boardFake([], undefined);
    const result = await readBoard(fake.pool, {
      game: "hextris",
      board: "all-time",
      playerId: PLAYER,
    });
    expect(result).toEqual({ entries: [], you: null });
  });

  it("ranks with rank() so exact ties share a rank, ordered earliest achiever first, and never selects a player id", async () => {
    const fake = boardFake([]);
    await readBoard(fake.pool, { game: "hextris", board: "all-time", playerId: null });
    const sql = fake.queries[0]?.sql ?? "";
    expect(sql).toContain("rank() OVER (ORDER BY score DESC, achieved_at ASC)");
    expect(sql).toContain("ORDER BY r.rank ASC, p.id ASC");
    expect(sql).not.toMatch(/AS (id|"playerId"|player_id)\b/);
  });

  it("rejects a row with an unexpected column instead of passing it to the client", async () => {
    const fake = boardFake([boardRow({ id: PLAYER })]);
    await expect(
      readBoard(fake.pool, { game: "hextris", board: "all-time", playerId: null }),
    ).rejects.toThrow();
  });
});
