import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

// Same recipe as src/app/api/leaderboard/__tests__/route.test.ts: DATA_DIR is
// resolved lazily per call, so this per-suite temp dir applies immediately.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "pg-lb-route-"));
process.env.DATA_DIR = DATA_DIR;

const { GET, POST } = await import("../route");

const FILE_PATH = path.join(DATA_DIR, "password-game-leaderboard.json");
const ISO = "2026-07-08T00:00:00.000Z";

interface PgEntryDTO {
  name: string;
  seed: number;
  elapsedSeconds: number;
  ruleCount: number;
  createdAt: string;
}

interface PgFile {
  schemaVersion: number;
  entries: PgEntryDTO[];
}

interface PgLeaderboardGetResponse {
  entries: PgEntryDTO[];
}

interface PostResponse {
  ok?: boolean;
  rank?: number;
  error?: string;
}

function entry(
  overrides: Partial<PgEntryDTO> & { name: string; elapsedSeconds: number },
): PgEntryDTO {
  return { seed: 1, ruleCount: 5, createdAt: ISO, ...overrides };
}

async function writeEntries(entries: PgEntryDTO[]): Promise<void> {
  await fs.writeFile(FILE_PATH, JSON.stringify({ schemaVersion: 1, entries }), "utf-8");
}

async function readEntries(): Promise<PgFile> {
  return JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as PgFile;
}

async function resetDir(): Promise<void> {
  const files = await fs.readdir(DATA_DIR);
  await Promise.all(files.map((f) => fs.rm(path.join(DATA_DIR, f), { force: true })));
}

describe("/api/password-game/leaderboard", () => {
  beforeAll(async () => {
    // Wiring sanity: fail loudly here, rather than silently writing to the
    // real .data directory, if DATA_DIR somehow did not take effect.
    if (!DATA_DIR.startsWith(os.tmpdir())) {
      throw new Error(`expected temp data dir under ${os.tmpdir()}, got ${DATA_DIR}`);
    }
    const probe = await POST(
      makeJsonPostRequest({ name: "wiring-probe", seed: 1, elapsedSeconds: 1, ruleCount: 1 }),
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
    it("returns entries sorted by elapsedSeconds ascending", async () => {
      await writeEntries([
        entry({ name: "A", elapsedSeconds: 30 }),
        entry({ name: "B", elapsedSeconds: 10 }),
        entry({ name: "C", elapsedSeconds: 20 }),
      ]);
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("filters to the requested seed via ?seed=", async () => {
      await writeEntries([
        entry({ name: "A", seed: 1, elapsedSeconds: 10 }),
        entry({ name: "B", seed: 2, elapsedSeconds: 5 }),
      ]);
      const res = await GET(
        new Request("https://amindhou.com/api/password-game/leaderboard?seed=1"),
      );
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["A"]);
    });

    it("serves an empty list (lenient read) when the file is a v1 flat array, without mutating it", async () => {
      const v1Bytes = JSON.stringify([
        { name: "legacy", seed: 1, time: 10, rules: 5, createdAt: ISO },
      ]);
      await fs.writeFile(FILE_PATH, v1Bytes, "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries).toEqual([]);
      await expect(fs.readFile(FILE_PATH, "utf-8")).resolves.toBe(v1Bytes);
    });

    it("caps results to the return limit", async () => {
      await writeEntries(
        Array.from({ length: 60 }, (_, i) => entry({ name: `p${i}`, elapsedSeconds: i + 1 })),
      );
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries).toHaveLength(50);
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });
  });

  describe("POST", () => {
    it("persists a valid run and returns ok:true + rank", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 7, elapsedSeconds: 120, ruleCount: 10 }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
      const file = await readEntries();
      expect(file.schemaVersion).toBe(1);
      expect(file.entries).toHaveLength(1);
      const stored = file.entries[0];
      if (!stored) throw new Error("expected an entry to have been persisted");
      expect(stored).toMatchObject({ name: "Ada", seed: 7, elapsedSeconds: 120, ruleCount: 10 });
      expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt);
    });

    it("archives a v1 flat-array file and starts fresh (break+reset path)", async () => {
      const v1Bytes = JSON.stringify([
        { name: "legacy", seed: 1, time: 10, rules: 5, createdAt: ISO },
      ]);
      await fs.writeFile(FILE_PATH, v1Bytes, "utf-8");

      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 7, elapsedSeconds: 120, ruleCount: 10 }),
      );
      expect(res.status).toBe(200);

      const files = await fs.readdir(DATA_DIR);
      const archive = files.find((f) => f.includes(".schema-mismatch-"));
      if (!archive) throw new Error("expected a *.schema-mismatch-* archive");
      await expect(fs.readFile(path.join(DATA_DIR, archive), "utf-8")).resolves.toBe(v1Bytes);
      const file = await readEntries();
      expect(file.entries.map((e) => e.name)).toEqual(["Ada"]);
    });

    it("sanitizes the submitted name", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "  Ada  ", seed: 1, elapsedSeconds: 10, ruleCount: 1 }),
      );
      expect(res.status).toBe(200);
      const file = await readEntries();
      expect(file.entries[0]?.name).toBe("Ada");
    });

    it("returns 400 for an invalid seed", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: -1, elapsedSeconds: 10, ruleCount: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid elapsedSeconds", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 0, ruleCount: 1 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid ruleCount", async () => {
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 0 }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for the v1 field names (time/rules) -- the contract moved", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 10, rules: 5 }));
      expect(res.status).toBe(400);
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
          { name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 1 },
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
          seed: 1,
          elapsedSeconds: 10,
          ruleCount: 1,
          filler: "x".repeat(20_000),
        }),
      );
      expect(res.status).toBe(413);
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
    });

    it("rate limits after 10 requests per minute from one IP with 429 + Retry-After", async () => {
      const ip = "61.61.61.61";
      for (let i = 0; i < 10; i++) {
        const ok = await POST(
          makeJsonPostRequest(
            { name: "Ada", seed: 1, elapsedSeconds: i + 1, ruleCount: 1 },
            { ip },
          ),
        );
        expect(ok.status).toBe(200);
      }
      const limited = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 1, ruleCount: 1 }, { ip }),
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
    });
  });

  describe("POST write-guard", () => {
    it("returns 503, quarantines the corrupt file without overwriting it, then self-heals", async () => {
      const originalBytes = "{ not json";
      await fs.writeFile(FILE_PATH, originalBytes, "utf-8");

      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 1 }),
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
        makeJsonPostRequest({ name: "Bea", seed: 1, elapsedSeconds: 20, ruleCount: 1 }),
      );
      expect(followUp.status).toBe(200);
    });

    it("returns 500 (never ok:true) when the write itself fails", async () => {
      const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
      const res = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, elapsedSeconds: 10, ruleCount: 1 }),
      );
      renameSpy.mockRestore();

      expect(res.status).toBe(500);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("could not save score");
      expect(body.ok).toBeUndefined();
    });
  });
});
