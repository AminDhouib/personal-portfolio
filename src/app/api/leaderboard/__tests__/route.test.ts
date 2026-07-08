import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

// The store resolves DATA_DIR lazily on every call (src/lib/data-dir.ts), so
// unlike the v1 store there is no import-order trap; the suite still pins its
// own temp dir explicitly (setup.ts provides a shared fallback, but an
// isolated dir keeps these on-disk assertions independent of other suites).
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "lb-route-"));
process.env.DATA_DIR = DATA_DIR;

const { GET, POST } = await import("../route");

const FILE_PATH = path.join(DATA_DIR, "leaderboard.json");
const ISO = "2026-07-08T00:00:00.000Z";

interface RowDTO {
  name: string;
  score: number;
  level: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
  createdAt: string;
}

interface BoardsFile {
  schemaVersion: number;
  boards: Record<string, RowDTO[]>;
}

interface LeaderboardGetResponse {
  entries: RowDTO[];
}

interface PostResponse {
  ok?: boolean;
  rank?: number;
  error?: string;
}

function row(overrides: Partial<RowDTO> & { name: string; score: number }): RowDTO {
  return { level: 1, createdAt: ISO, ...overrides };
}

async function writeBoards(boards: Record<string, RowDTO[]>): Promise<void> {
  await fs.writeFile(FILE_PATH, JSON.stringify({ schemaVersion: 1, boards }), "utf-8");
}

async function readBoards(): Promise<BoardsFile> {
  return JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as BoardsFile;
}

async function resetDir(): Promise<void> {
  const files = await fs.readdir(DATA_DIR);
  await Promise.all(files.map((f) => fs.rm(path.join(DATA_DIR, f), { force: true })));
}

describe("/api/leaderboard", () => {
  beforeAll(async () => {
    // Wiring sanity: fail loudly here, rather than silently writing to the
    // real .data directory, if DATA_DIR somehow did not take effect.
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
    it("returns the requested board sorted by score desc", async () => {
      await writeBoards({
        "space-shooter": [
          row({ name: "A", score: 10 }),
          row({ name: "B", score: 30 }),
          row({ name: "C", score: 20 }),
        ],
      });
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
      await writeBoards({ "space-shooter": [row({ name: "A", score: 10 })] });
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=not-a-game"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toEqual([]);
    });

    it("reads only the requested board -- other boards are invisible", async () => {
      await writeBoards({
        hextris: [row({ name: "A", score: 10 })],
        "space-shooter": [row({ name: "B", score: 30 })],
      });
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=hextris"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["A"]);
    });

    it("serves an empty board (lenient read) when the file is a v1 flat array, without mutating it", async () => {
      const v1Bytes = JSON.stringify([{ name: "legacy", score: 1, level: 1, createdAt: ISO }]);
      await fs.writeFile(FILE_PATH, v1Bytes, "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard?game=space-shooter"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toEqual([]);
      // GET never archives/renames -- that is the write path's job.
      await expect(fs.readFile(FILE_PATH, "utf-8")).resolves.toBe(v1Bytes);
    });

    it("caps results to the return limit", async () => {
      await writeBoards({
        "space-shooter": Array.from({ length: 30 }, (_, i) => row({ name: `p${i}`, score: i })),
      });
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
    it("persists a valid score into its game board and returns ok:true + rank", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 500, level: 3, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
      const file = await readBoards();
      expect(file.schemaVersion).toBe(1);
      expect(file.boards["space-shooter"]).toHaveLength(1);
      const entry = file.boards["space-shooter"]?.[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry).toMatchObject({ name: "Ada", score: 500, level: 3 });
      // v2: the slug is the bucket key, never a row field.
      expect("game" in entry).toBe(false);
      expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
    });

    it("archives a v1 flat-array file and starts a fresh v2 board (break+reset path)", async () => {
      const v1Bytes = JSON.stringify([{ name: "legacy", score: 1, level: 1, createdAt: ISO }]);
      await fs.writeFile(FILE_PATH, v1Bytes, "utf-8");

      const res = await POST(
        makeJsonPostRequest({ name: "Ada", score: 500, level: 3, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);

      // Old bytes preserved in a *.schema-mismatch-* archive, new v2 file live.
      const files = await fs.readdir(DATA_DIR);
      const archive = files.find((f) => f.includes(".schema-mismatch-"));
      if (!archive) throw new Error("expected a *.schema-mismatch-* archive");
      await expect(fs.readFile(path.join(DATA_DIR, archive), "utf-8")).resolves.toBe(v1Bytes);
      const file = await readBoards();
      expect(file.boards["space-shooter"]?.map((e) => e.name)).toEqual(["Ada"]);
    });

    it("sanitizes the submitted name", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "  Ada  ", score: 10, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);
      const file = await readBoards();
      expect(file.boards["space-shooter"]?.[0]?.name).toBe("Ada");
    });

    it("rejects a missing game with 400 (RC-1 / DD1-001: no silent default)", async () => {
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

    it("accepts each of the three closed-enum game slugs into its own board", async () => {
      for (const game of ["space-shooter", "hextris", "tower-stacker"]) {
        const res = await POST(makeJsonPostRequest({ name: "Ada", score: 10, level: 1, game }));
        expect(res.status).toBe(200);
      }
      const file = await readBoards();
      expect(Object.keys(file.boards).sort()).toEqual([
        "hextris",
        "space-shooter",
        "tower-stacker",
      ]);
      for (const rows of Object.values(file.boards)) expect(rows).toHaveLength(1);
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
      const file = await readBoards();
      expect(file.boards["space-shooter"]?.[0]).toMatchObject({
        seconds: 42,
        kills: 7,
        distance: 1000,
        region: "CA",
      });
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
      const file = await readBoards();
      const entry = file.boards["space-shooter"]?.[0] as unknown as Record<string, unknown>;
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

    it("trims each board independently to its max size, keeping the highest scores", async () => {
      await writeBoards({
        "space-shooter": Array.from({ length: 100 }, (_, i) =>
          row({ name: `p${i}`, score: i + 1 }),
        ),
        hextris: [row({ name: "H", score: 5 })],
      });

      const res = await POST(
        makeJsonPostRequest({ name: "New", score: 500, level: 1, game: "space-shooter" }),
      );
      expect(res.status).toBe(200);

      const file = await readBoards();
      const spaceShooter = file.boards["space-shooter"] ?? [];
      expect(spaceShooter).toHaveLength(100);
      expect(file.boards["hextris"]).toHaveLength(1);
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

      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
      const files = await fs.readdir(DATA_DIR);
      const sidecar = files.find((f) => f.includes(".corrupt-"));
      if (!sidecar) throw new Error("expected a *.corrupt-* sidecar to exist");
      const sidecarContent = await fs.readFile(path.join(DATA_DIR, sidecar), "utf-8");
      expect(sidecarContent).toBe(originalBytes);

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
