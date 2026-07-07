import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

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

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `10.40.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

function makeReq(
  body: unknown,
  opts: { ip?: string; origin?: string | null; host?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  const origin = opts.origin === undefined ? "https://amindhou.com" : opts.origin;
  if (origin) headers["origin"] = origin;
  headers["x-forwarded-host"] = opts.host ?? "amindhou.com";
  headers["x-forwarded-for"] = opts.ip ?? uniqueIp();
  return new NextRequest("https://amindhou.com/api/leaderboard", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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
    const probe = await POST(makeReq({ name: "wiring-probe", score: 1, level: 1 }));
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
    it("returns the default space-shooter bucket sorted by score desc", async () => {
      const seed: LeaderboardEntryDTO[] = [
        { name: "A", score: 10, level: 1, createdAt: "t" },
        { name: "B", score: 30, level: 1, createdAt: "t" },
        { name: "C", score: 20, level: 1, createdAt: "t" },
      ];
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries.map((e) => e.name)).toEqual(["B", "C", "A"]);
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

    it("caps results to the store's returnLimit", async () => {
      const seed: LeaderboardEntryDTO[] = Array.from({ length: 30 }, (_, i) => ({
        name: `p${i}`,
        score: i,
        level: 1,
        createdAt: "t",
      }));
      await fs.writeFile(FILE_PATH, JSON.stringify(seed), "utf-8");
      const res = await GET(new Request("https://amindhou.com/api/leaderboard"));
      const body = (await res.json()) as LeaderboardGetResponse;
      expect(body.entries).toHaveLength(25);
    });

    it("sets a short public cache header", async () => {
      const res = await GET(new Request("https://amindhou.com/api/leaderboard"));
      expect(res.headers.get("Cache-Control")).toBe("s-maxage=10, stale-while-revalidate=30");
    });
  });

  describe("POST", () => {
    it("persists a valid score and returns ok:true + rank", async () => {
      const res = await POST(makeReq({ name: "Ada", score: 500, level: 3 }));
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
      const res = await POST(makeReq({ name: "  Ada  ", score: 10, level: 1 }));
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry.name).toBe("Ada");
    });

    it("defaults a missing game to space-shooter (DD1-001, pinned as current behavior for P2)", async () => {
      const res = await POST(makeReq({ name: "Ada", score: 10, level: 1 }));
      expect(res.status).toBe(200);
      const stored = JSON.parse(await fs.readFile(FILE_PATH, "utf-8")) as LeaderboardEntryDTO[];
      const entry = stored[0];
      if (!entry) throw new Error("expected an entry to have been persisted");
      expect(entry.game).toBe("space-shooter");
    });

    it("returns 400 for an invalid score", async () => {
      const res = await POST(makeReq({ name: "Ada", score: -1, level: 1 }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid level", async () => {
      const res = await POST(makeReq({ name: "Ada", score: 10, level: 0 }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await POST(makeReq("{not json"));
      expect(res.status).toBe(400);
    });

    it("returns 400 for a non-object body", async () => {
      const res = await POST(makeReq("42"));
      expect(res.status).toBe(400);
    });

    it("rejects a cross-origin request with 403 before touching disk", async () => {
      const res = await POST(
        makeReq({ name: "Ada", score: 10, level: 1 }, { origin: "https://evil.example" }),
      );
      expect(res.status).toBe(403);
      await expect(fs.stat(FILE_PATH)).rejects.toThrow();
    });

    it("rate limits after 10 requests per minute from one IP with 429 + Retry-After", async () => {
      const ip = "60.60.60.60";
      for (let i = 0; i < 10; i++) {
        const ok = await POST(makeReq({ name: "Ada", score: i, level: 1 }, { ip }));
        expect(ok.status).toBe(200);
      }
      const limited = await POST(makeReq({ name: "Ada", score: 1, level: 1 }, { ip }));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
    });
  });
});
