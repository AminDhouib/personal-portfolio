import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeJsonPostRequest } from "@/test/api-route-helpers";

// Same recipe as src/app/api/leaderboard/__tests__/route.test.ts: the store
// captures env.PG_LEADERBOARD_DIR at import time, so the temp dir must exist
// and the env var must be set before "../route" is evaluated. A dynamic
// import with top-level await runs exactly where it appears in source order
// (unlike a vi.hoisted callback, which Vitest relocates above this file's
// own transformed imports and which cannot safely reference them).
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "pg-lb-route-"));
process.env.PG_LEADERBOARD_DIR = DATA_DIR;

const { GET, POST } = await import("../route");

const FILE_PATH = path.join(DATA_DIR, "password-game-leaderboard.json");

interface PgLeaderboardEntryDTO {
  name: string;
  seed: number;
  time: number;
  rules: number;
  createdAt: string;
}

interface PgLeaderboardGetResponse {
  entries: PgLeaderboardEntryDTO[];
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

describe("/api/password-game/leaderboard", () => {
  beforeAll(async () => {
    // Wiring sanity (Risk section of audit/plans/P1.md): fail loudly here,
    // rather than silently writing to the real .data directory, if
    // PG_LEADERBOARD_DIR was somehow captured before the setup above ran.
    if (!DATA_DIR.startsWith(os.tmpdir())) {
      throw new Error(`expected temp data dir under ${os.tmpdir()}, got ${DATA_DIR}`);
    }
    const probe = await POST(
      makeJsonPostRequest({ name: "wiring-probe", seed: 1, time: 1, rules: 1 }),
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
    it("returns entries sorted by time ascending", async () => {
      const seed: PgLeaderboardEntryDTO[] = [
        { name: "A", seed: 1, time: 30, rules: 5, createdAt: "t" },
        { name: "B", seed: 1, time: 10, rules: 5, createdAt: "t" },
        { name: "C", seed: 1, time: 20, rules: 5, createdAt: "t" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/password-game/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
    });

    it("filters to the requested seed via ?seed=", async () => {
      const seed: PgLeaderboardEntryDTO[] = [
        { name: "A", seed: 1, time: 10, rules: 5, createdAt: "t" },
        { name: "B", seed: 2, time: 5, rules: 5, createdAt: "t" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(
        new Request("https://amindhou.com/api/password-game/leaderboard?seed=1"),
      );
      const body = (await res.json()) as PgLeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["A"]);
    });

    it("caps results to the store's returnLimit", async () => {
      const seed: PgLeaderboardEntryDTO[] = Array.from({ length: 60 }, (_, i) => ({
        name: `p${i}`,
        seed: 1,
        time: i,
        rules: 5,
        createdAt: "t",
      }));
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
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
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 7, time: 120, rules: 10 }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as PostResponse;
      expect(body).toMatchObject({ ok: true, rank: 1 });
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as PgLeaderboardEntryDTO[];
      expect(stored).toHaveLength(1);
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry).toMatchObject({ name: "Ada", seed: 7, time: 120, rules: 10 });
    });

    it("sanitizes the submitted name", async () => {
      const res = await POST(makeJsonPostRequest({ name: "  Ada  ", seed: 1, time: 10, rules: 1 }));
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as PgLeaderboardEntryDTO[];
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry.name).toBe("Ada");
    });

    it("returns 400 for an invalid seed", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: -1, time: 10, rules: 1 }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid time", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 0, rules: 1 }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid rules", async () => {
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 10, rules: 0 }));
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
          { name: "Ada", seed: 1, time: 10, rules: 1 },
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
          time: 10,
          rules: 1,
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
          makeJsonPostRequest({ name: "Ada", seed: 1, time: i + 1, rules: 1 }, { ip }),
        );
        expect(ok.status).toBe(200);
      }
      const limited = await POST(
        makeJsonPostRequest({ name: "Ada", seed: 1, time: 1, rules: 1 }, { ip }),
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
    });
  });

  describe("POST write-guard", () => {
    it("returns 503, quarantines the corrupt file without overwriting it, then self-heals", async () => {
      const originalBytes = "{ not json";
      await fs.writeFile(FILE_PATH, originalBytes, "utf-8");

      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 10, rules: 1 }));
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
        makeJsonPostRequest({ name: "Bea", seed: 1, time: 20, rules: 1 }),
      );
      expect(followUp.status).toBe(200);
    });

    it("returns 500 (never ok:true) when the write itself fails", async () => {
      const renameSpy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));
      const res = await POST(makeJsonPostRequest({ name: "Ada", seed: 1, time: 10, rules: 1 }));
      renameSpy.mockRestore();

      expect(res.status).toBe(500);
      const body = (await res.json()) as PostResponse;
      expect(body.error).toBe("could not save score");
      expect(body.ok).toBeUndefined();
    });
  });
});
