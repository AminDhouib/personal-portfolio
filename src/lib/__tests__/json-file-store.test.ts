import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { createJsonFileStore, JsonFileCorruptError } from "../json-file-store";

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { captureException } from "@/lib/log";

// Minimal versioned document: the store is generic over the file shape, so
// the tests pin the durability contract, not any route's row shape.
const testFileSchema = z.object({
  schemaVersion: z.literal(1),
  rows: z.array(z.string()),
});
type TestFile = z.infer<typeof testFileSchema>;
const emptyFile = (): TestFile => ({ schemaVersion: 1, rows: [] });

describe("json-file-store", () => {
  let dataDir: string;
  let filePath: string;

  beforeEach(async () => {
    // resolveDataDir() reads env.DATA_DIR lazily on every call (no
    // import-order trap), so a plain per-test env assignment is enough.
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "jfs-"));
    process.env.DATA_DIR = dataDir;
    filePath = path.join(dataDir, "doc.json");
    vi.mocked(captureException).mockClear();
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function makeStore() {
    return createJsonFileStore({
      fileName: "doc.json",
      schemaVersion: 1,
      fileSchema: testFileSchema,
      emptyFile,
      scope: "test-doc",
    });
  }

  describe("readFile (lenient, GET path)", () => {
    it("returns the file when valid", async () => {
      const file: TestFile = { schemaVersion: 1, rows: ["a", "b"] };
      await fs.writeFile(filePath, JSON.stringify(file), "utf-8");
      await expect(makeStore().readFile()).resolves.toEqual(file);
    });

    it("returns the empty file on ENOENT", async () => {
      await expect(makeStore().readFile()).resolves.toEqual(emptyFile());
    });

    it("returns empty and reports on corrupt content, without quarantining", async () => {
      await fs.writeFile(filePath, "{ not json", "utf-8");
      await expect(makeStore().readFile()).resolves.toEqual(emptyFile());
      expect(captureException).toHaveBeenCalled();
      // GET is non-mutating: the lenient read must never rename the file away.
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".corrupt-"))).toBe(false);
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });

    it("returns empty on a version mismatch without mutating the file", async () => {
      await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 999, rows: [] }), "utf-8");
      await expect(makeStore().readFile()).resolves.toEqual(emptyFile());
      await expect(fs.stat(filePath)).resolves.toBeTruthy();
    });
  });

  describe("readFileForUpdate (strict, write path)", () => {
    it("returns the file when valid", async () => {
      const file: TestFile = { schemaVersion: 1, rows: ["a"] };
      await fs.writeFile(filePath, JSON.stringify(file), "utf-8");
      await expect(makeStore().readFileForUpdate()).resolves.toEqual(file);
    });

    it("returns the empty file on ENOENT (first-ever write)", async () => {
      await expect(makeStore().readFileForUpdate()).resolves.toEqual(emptyFile());
    });

    it("throws JsonFileCorruptError and quarantines exact bytes on corrupt content", async () => {
      const rawBytes = "{ not json";
      await fs.writeFile(filePath, rawBytes, "utf-8");
      const store = makeStore();

      await expect(store.readFileForUpdate()).rejects.toThrow(JsonFileCorruptError);

      await expect(fs.stat(filePath)).rejects.toThrow();
      const files = await fs.readdir(dataDir);
      const sidecar = files.find((f) => f.includes(".corrupt-"));
      if (!sidecar) throw new Error("expected a *.corrupt-* sidecar to exist");
      const sidecarContent = await fs.readFile(path.join(dataDir, sidecar), "utf-8");
      expect(sidecarContent).toBe(rawBytes);
    });

    it("treats right-version-but-invalid-shape as corrupt (tampering guard)", async () => {
      await fs.writeFile(filePath, JSON.stringify({ schemaVersion: 1, rows: [42] }), "utf-8");
      await expect(makeStore().readFileForUpdate()).rejects.toThrow(JsonFileCorruptError);
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".corrupt-"))).toBe(true);
    });

    it("archives and resets on a version mismatch (break+reset), reporting loudly", async () => {
      // A v1-era unversioned document (plain array) is the canonical mismatch.
      const v1Bytes = JSON.stringify([{ name: "legacy" }]);
      await fs.writeFile(filePath, v1Bytes, "utf-8");
      const store = makeStore();

      await expect(store.readFileForUpdate()).resolves.toEqual(emptyFile());
      expect(captureException).toHaveBeenCalledWith("test-doc.schema-reset", expect.any(Error));

      // Old bytes archived, not destroyed.
      const files = await fs.readdir(dataDir);
      const archive = files.find((f) => f.includes(".schema-mismatch-"));
      if (!archive) throw new Error("expected a *.schema-mismatch-* archive to exist");
      const archived = await fs.readFile(path.join(dataDir, archive), "utf-8");
      expect(archived).toBe(v1Bytes);
    });

    it("self-heals to empty on the next call after a quarantine", async () => {
      await fs.writeFile(filePath, "{ not json", "utf-8");
      const store = makeStore();
      await expect(store.readFileForUpdate()).rejects.toThrow(JsonFileCorruptError);
      await expect(store.readFileForUpdate()).resolves.toEqual(emptyFile());
    });
  });

  describe("writeFile", () => {
    it("round-trips through readFile", async () => {
      const store = makeStore();
      const file: TestFile = { schemaVersion: 1, rows: ["x", "y", "z"] };
      await store.writeFile(file);
      await expect(store.readFile()).resolves.toEqual(file);
    });

    it("leaves no *.tmp-* file behind after a successful write", async () => {
      await makeStore().writeFile({ schemaVersion: 1, rows: ["a"] });
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".tmp-"))).toBe(false);
    });

    it("rejects, reports, and leaves no *.tmp-* file when fs.rename fails", async () => {
      const store = makeStore();
      vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("disk full"));

      await expect(store.writeFile({ schemaVersion: 1, rows: ["a"] })).rejects.toThrow("disk full");
      expect(captureException).toHaveBeenCalledWith("test-doc.write", expect.any(Error));

      vi.restoreAllMocks();
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes(".tmp-"))).toBe(false);
    });
  });

  describe("withWriteLock serialization", () => {
    it("loses no updates across 20 concurrent read-modify-write cycles", async () => {
      const store = makeStore();
      const ops = Array.from({ length: 20 }, (_, i) =>
        store.withWriteLock(async () => {
          const file = await store.readFileForUpdate();
          file.rows.push(`row-${i}`);
          await store.writeFile(file);
        }),
      );
      await Promise.all(ops);
      const file = await store.readFile();
      expect(file.rows).toHaveLength(20);
      expect(new Set(file.rows).size).toBe(20);
    });
  });
});
