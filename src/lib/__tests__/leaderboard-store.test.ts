import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLeaderboardStore, LeaderboardCorruptError } from "../leaderboard-store";

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { captureException } from "@/lib/log";

// Local Entry shape mirrors api/leaderboard/route.ts's Entry/isEntry exactly
// (required name/score/level/createdAt) -- the store itself is generic over T,
// so this is a representative shape, not a re-export of the route's type.
interface Entry {
  name: string;
  score: number;
  level: number;
  createdAt: string;
}

function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.score === "number" &&
    typeof o.level === "number" &&
    typeof o.createdAt === "string"
  );
}

function mk(i: number): Entry {
  return { name: `p${i}`, score: i, level: 1, createdAt: new Date(0).toISOString() };
}

describe("leaderboard-store", () => {
  let dataDir: string;
  let filePath: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lb-store-"));
    filePath = path.join(dataDir, "leaderboard.json");
    vi.mocked(captureException).mockClear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function makeStore() {
    return createLeaderboardStore<Entry>({
      dataDir,
      fileName: "leaderboard.json",
      maxEntries: 100,
      returnLimit: 25,
      nameMax: 12,
      defaultName: "Pilot",
      isEntry,
    });
  }

  describe("readAll", () => {
    it("returns filtered entries from a valid file", async () => {
      const entries = [mk(1), mk(2)];
      await fs.writeFile(filePath, JSON.stringify(entries), "utf-8");
      const store = makeStore();
      await expect(store.readAll()).resolves.toEqual(entries);
    });

    it("returns [] when the file does not exist (ENOENT)", async () => {
      const store = makeStore();
      await expect(store.readAll()).resolves.toEqual([]);
    });

    it("returns [] and reports via captureException when the file is corrupt, without quarantining it", async () => {
      await fs.writeFile(filePath, "{ not json", "utf-8");
      const store = makeStore();
      await expect(store.readAll()).resolves.toEqual([]);
      expect(captureException).toHaveBeenCalled();
      // GET is non-mutating: the lenient read must never rename the file away,
      // even when it can't parse it.
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".corrupt-"))).toBe(false);
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });

    it("drops a row that fails isEntry from an otherwise-valid array and reports it loudly", async () => {
      const good = mk(1);
      const bad = { name: "nope" }; // missing score/level/createdAt
      await fs.writeFile(filePath, JSON.stringify([good, bad]), "utf-8");
      const store = makeStore();
      await expect(store.readAll()).resolves.toEqual([good]);
      expect(captureException).toHaveBeenCalled();
    });
  });

  describe("readForUpdate", () => {
    it("returns entries on a valid file (same as readAll)", async () => {
      const entries = [mk(1), mk(2)];
      await fs.writeFile(filePath, JSON.stringify(entries), "utf-8");
      const store = makeStore();
      await expect(store.readForUpdate()).resolves.toEqual(entries);
    });

    it("returns [] on ENOENT (no file yet -- an empty base is correct)", async () => {
      const store = makeStore();
      await expect(store.readForUpdate()).resolves.toEqual([]);
    });

    it("drops an invalid row from an otherwise-valid array and reports it loudly", async () => {
      const good = mk(1);
      const bad = { name: "nope" };
      await fs.writeFile(filePath, JSON.stringify([good, bad]), "utf-8");
      const store = makeStore();
      await expect(store.readForUpdate()).resolves.toEqual([good]);
      expect(captureException).toHaveBeenCalled();
    });

    it("throws LeaderboardCorruptError and quarantines the file on corrupt content, preserving its bytes", async () => {
      const rawBytes = "{ not json";
      await fs.writeFile(filePath, rawBytes, "utf-8");
      const store = makeStore();

      await expect(store.readForUpdate()).rejects.toThrow(LeaderboardCorruptError);
      expect(captureException).toHaveBeenCalled();

      // The original path is gone (no overwrite target left behind)...
      await expect(fs.stat(filePath)).rejects.toThrow();
      // ...and a *.corrupt-* sidecar holds the exact original bytes.
      const files = await fs.readdir(dataDir);
      const sidecar = files.find((f) => f.includes(".corrupt-"));
      if (!sidecar) throw new Error("expected a *.corrupt-* sidecar to exist");
      const sidecarContent = await fs.readFile(path.join(dataDir, sidecar), "utf-8");
      expect(sidecarContent).toBe(rawBytes);
    });

    it("self-heals to [] on the next call after a quarantine", async () => {
      await fs.writeFile(filePath, "{ not json", "utf-8");
      const store = makeStore();
      await expect(store.readForUpdate()).rejects.toThrow(LeaderboardCorruptError);
      // The corrupt file was renamed away, so this now looks like ENOENT.
      await expect(store.readForUpdate()).resolves.toEqual([]);
    });
  });

  describe("writeAll", () => {
    it("round-trips through readAll", async () => {
      const store = makeStore();
      const entries = [mk(1), mk(2), mk(3)];
      await store.writeAll(entries);
      await expect(store.readAll()).resolves.toEqual(entries);
    });

    it("leaves no *.tmp-* file behind after a successful write", async () => {
      const store = makeStore();
      await store.writeAll([mk(1)]);
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".tmp-"))).toBe(false);
    });

    it("rejects, reports via captureException, and leaves no *.tmp-* file when fs.rename fails", async () => {
      const store = makeStore();
      vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));

      await expect(store.writeAll([mk(1)])).rejects.toThrow("disk full");
      expect(captureException).toHaveBeenCalledWith("leaderboard.write", expect.any(Error));

      vi.restoreAllMocks();
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".tmp-"))).toBe(false);
    });
  });

  describe("sanitizeName", () => {
    it("returns the default name for a non-string input", () => {
      const store = makeStore();
      expect(store.sanitizeName(42)).toBe("Pilot");
      expect(store.sanitizeName(undefined)).toBe("Pilot");
      expect(store.sanitizeName(null)).toBe("Pilot");
    });

    it("strips control characters", () => {
      const store = makeStore();
      expect(store.sanitizeName("Ada\u0000\u001f")).toBe("Ada");
    });

    it("trims surrounding whitespace", () => {
      const store = makeStore();
      expect(store.sanitizeName("  Ada  ")).toBe("Ada");
    });

    it("slices to nameMax", () => {
      const store = makeStore();
      expect(store.sanitizeName("A".repeat(20))).toBe("A".repeat(12));
    });

    it("returns the default name when the cleaned result is empty", () => {
      const store = makeStore();
      expect(store.sanitizeName("   ")).toBe("Pilot");
      expect(store.sanitizeName("\u0000\u0001")).toBe("Pilot");
    });
  });

  describe("withWriteLock serialization", () => {
    it("loses no updates across 20 concurrent read-modify-write cycles", async () => {
      const store = makeStore();
      const ops = Array.from({ length: 20 }, (_, i) =>
        store.withWriteLock(async () => {
          const all = await store.readAll();
          all.push(mk(i));
          await store.writeAll(all);
        }),
      );
      await Promise.all(ops);
      const all = await store.readAll();
      expect(all).toHaveLength(20);
      expect(new Set(all.map((e) => e.name)).size).toBe(20);
    });
  });
});
