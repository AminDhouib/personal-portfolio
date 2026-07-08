import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

// The store captures env.LEADERBOARD_DATA_DIR at import time (module top
// level), so the temp dir must exist and the env var must be set BEFORE
// "../route" is first evaluated. A plain vi.hoisted(() => {...}) callback
// cannot do this: Vitest's mock-hoisting transform relocates the callback
// above this file's own (also-transformed) imports, so referencing `os` /
// `path` / `mkdtempSync` inside it throws "Cannot access '__vi_import_0__'
// before initialization" -- verified empirically against this repo's vitest
// 4.1.4. A dynamic import with top-level await sidesteps the transform
// entirely: it runs exactly where it appears in source order, after the
// synchronous setup below.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "lb-route-"));
process.env.LEADERBOARD_DATA_DIR = DATA_DIR;

const { GET, POST } = await import("../route");

const FILE_PATH = path.join(DATA_DIR, "leaderboard.json");

interface LeaderboardEntryDTO {
  name: string;
  score: number;
  level: number;
  createdAt: string;
  game?: string;
}

interface LeaderboardGetResponse {
  entries: LeaderboardEntryDTO[];
}

interface PostResponse {
  ok?: boolean;
  rank?: number;
  error?: string;
}

async function resetDir(): Promise<void> {
  const files = await fs.readdir(DATA_DIR);
  await Promise.all(files.map((f) => fs.rm(path.join(DATA_DIR, f), { force: true })));
}

describe("/api/leaderboard", () => {
  beforeAll(async () => {
    // Wiring sanity (Risk section of audit/plans/P1.md): fail loudly here,
    // rather than silently writing to the real .data directory, if
    // LEADERBOARD_DATA_DIR was somehow captured before the hoisted block ran.
    if (!DATA_DIR.startsWith(os.tmpdir())) {
      throw new Error(`expected temp data dir under ${os.tmpdir()}, got ${DATA_DIR}`);
    }
    const probe = await POST(
      makeJsonPostRequest({ name: "wiring-probe", score: 1, level: 1, game: "space-shooter" }),
    );
    if (probe.status !== 200) {
      throw new Error(`wiring probe POST failed with status ${probe.status}`);
    }
    const stat = await fs.stat(FILE_PATH).catch(() => null);
    if (!stat) {
      throw new Error(`expected ${FILE_PATH} to exist under the temp dir after the wiring probe`);
    }
    await resetDir();
  });

  afterAll(async () => {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetDir();
  });

  describe("GET", () => {
    it("returns the space-shooter bucket sorted by score desc when ?game=space-shooter", async () => {
      const seed: LeaderboardEntryDTO[] = [
        { name: "A", score: 10, level: 1, createdAt: "t" },
        { name: "B", score: 30, level: 1, createdAt: "t" },
        { name: "C", score: 20, level: 1, createdAt: "t" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("returns 400 when ?game= is absent (Decision 1: no silent read-side default)", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard"));
      expect(res.status).toBe(400);
    });

    it("returns an empty list (not a 400) for an unrecognized ?game= slug", async () => {
      const seed: LeaderboardEntryDTO[] = [
        { name: "A", score: 10, level: 1, createdAt: "t", game: "space-shooter" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=not-a-game"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toEqual([]);
    });

    it("filters to the requested game bucket via ?game=", async () => {
      const seed: LeaderboardEntryDTO[] = [
        { name: "A", score: 10, level: 1, createdAt: "t", game: "hextris" },
        { name: "B", score: 30, level: 1, createdAt: "t" }, // no game -> space-shooter bucket
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=hextris"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["A"]);
    });

    it("coalesces an explicit game:'space-shooter' the same as an absent game field", async () => {
      const seed: LeaderboardEntryDTO[] = [
        { name: "A", score: 10, level: 1, createdAt: "t", game: "space-shooter" },
        { name: "B", score: 30, level: 1, createdAt: "t" }, // no game field at all
        { name: "C", score: 20, level: 1, createdAt: "t", game: "hextris" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name).sort()).toEqual(["A", "B"]);
    });

    it("caps results to the store's returnLimit", async () => {
      const seed: LeaderboardEntryDTO[] = Array.from({ length: 30 }, (_, i) => ({
        name: `p${i}`,
        score: i,
        level: 1,
        createdAt: "t",
      }));
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toHaveLength(25);
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
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      expect(stored).toHaveLength(1);
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry).toMatchObject({ name: "Ada", score: 500, level: 3, game: "space-shooter" });
    });

    it("sanitizes the submitted name", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "  Ada  ", score: 10, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry.name).toBe("Ada");
    });

    it("rejects a missing game with 400 (RC-1 / DD1-001: no more silent space-shooter default)", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", score: 10, level: 1 }));
      expect(res.status).toBe(400);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("invalid game");
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
    });

    it("rejects an unrecognized game slug with 400 (closed enum, Decision 2)", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game: "not-a-real-game" }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("invalid game");
    });

    it("accepts each of the three closed-enum game slugs into its own bucket", async () => {
      for (const game of ["space-shooter", "hextris", "tower-stacker"]) {
        const res = await POST(makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game }));
        expect(res.status).toBe(200);
      }
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      expect(stored.map((e) => e.game).sort()).toEqual([
        "hextris",
        "space-shooter",
        "tower-stacker",
      ]);
    });

    it("returns 400 for an invalid score", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: -1, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid level", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 0, game: "space-shooter" }),
      );
      expect(res.status).toBe(400);
    });

    it("accepts in-range seconds/kills/distance/region and drops out-of-range ones", async () => {
      const res = await POST(
        makeJsonPostRequest({
          name: "Ada",
          score: 10,
          level: 1,
          game: "space-shooter",
          seconds: 42,
          kills: 7,
          distance: 1000,
          region: "CA",
        }),
      );
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry).toMatchObject({ seconds: 42, kills: 7, distance: 1000, region: "CA" });
    });

    it("drops seconds/kills/distance/region that are out of bounds instead of storing them", async () => {
      const res = await POST(
        makeJsonPostRequest({
          name: "Ada",
          score: 10,
          level: 1,
          game: "space-shooter",
          seconds: -1,
          kills: -1,
          distance: -1,
          region: "",
        }),
      );
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const entry = stored[0] as unknown as Record<string, unknown>;
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry.seconds).toBeUndefined();
      expect(entry.kills).toBeUndefined();
      expect(entry.distance).toBeUndefined();
      expect(entry.region).toBeUndefined();
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await POST(makeJsonPostRequest("{not json"));
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-object body", async () => {
      const res = await POST(makeJsonPostRequest("42"));
      expect(res.status).toBe(400);
    });

    it("rejects a cross-origin request with 403 before touching disk", async () => {
      const res = await POST(
        makeJsonPostRequest(
          { name: "Ada", score: 10, level: 1, game: "space-shooter" },
          { origin: "https://evil.example" },
        ),
      );
      expect(res.status).toBe(403);
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
    });

    it("returns 413 for a body over the 16 KiB cap", async () => {
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
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
    });

    it("rate limits after 10 requests per minute from one IP with 429 + Retry-After", async () => {
      const ip = "60.60.60.60";
      for (let i = 0; i < 10; i++) {
        const ok = await POST(
          makeJsonPostRequest({ name: "Ada", score: i, level: 1, game: "space-shooter" }, { ip }),
        );
        expect(ok.status).toBe(200);
      }
      const limited = await POST(
        makeJsonPostRequest({ name: "Ada", score: 1, level: 1, game: "space-shooter" }, { ip }),
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
    });

    it("trims each game bucket independently to the store's maxEntries, keeping the highest scores", async () => {
      // Seed 100 space-shooter entries (scores 1..100) plus one untouched
      // hextris entry, then push a 101st space-shooter score that should
      // bump the lowest space-shooter score out while hextris is unaffected.
      const seed: LeaderboardEntryDTO[] = [
        ...Array.from({ length: 100 }, (_, i) => ({
          name: `p${i}`,
          score: i + 1,
          level: 1,
          createdAt: "t",
          game: "space-shooter",
        })),
        { name: "H", score: 5, level: 1, createdAt: "t", game: "hextris" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");

      const res = await POST(
        makeJsonPostRequest({ name: "New", score: 500, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);

      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const spaceShooter = stored.filter((e) => (e.game ?? "space-shooter") === "space-shooter");
      const hextris = stored.filter((e) => e.game === "hextris");
      expect(spaceShooter).toHaveLength(100);
      expect(hextris).toHaveLength(1);
      // The lowest original score (1, name "p0") was trimmed out.
      expect(spaceShooter.some((e) => e.name === "p0")).toBe(false);
      expect(spaceShooter.some((e) => e.name === "New")).toBe(true);
    });
  });

  describe("POST write-guard", () => {
    it("returns 503, quarantines the corrupt file without overwriting it, then self-heals", async () => {
      const originalBytes = "{ not json";
      await fs.writeFile(FILE_PATH, originalBytes, "utf-8");

      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("leaderboard temporarily unavailable");

      // Quarantined: the original path is gone, and a *.corrupt-* sidecar
      // holds the exact original bytes -- the new entry was never written
      // over them.
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
      const files = await fs.readdir(DATA_DIR);
      const sidecar = files.find((f) => f.includes(".corrupt-"));
      if (!sidecar) throw new Error("expected a *.corrupt-* sidecar to exist");
      const sidecarContent = await fs.readFile(path.join(DATA_DIR, sidecar), "utf-8");
      expect(sidecarContent).toBe(originalBytes);

      // Self-heal: the corrupt file is gone, so the next submit sees ENOENT
      // and starts a fresh board.
      const followUp = await POST(
        makeJsonPostRequest({ name: "Bea", score: 20, level: 1, game: "space-shooter" }),
      );
      expect(followUp.status).toBe(200);
    });

    it("returns 500 (never ok:true) when the write itself fails", async () => {
      const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game: "space-shooter" }),
      );
      renameSpy.mockRestore();

      expect(res.status).toBe(500);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("could not save score");
      expect(body.ok).toBeUndefined();
    });
  });
});
