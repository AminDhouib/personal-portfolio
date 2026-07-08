import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendLead, readAllLeads } from "../leads-store";
import { PERSISTENCE_SCHEMA_VERSION } from "../persistence-schemas";

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { captureException } from "@/lib/log";

const INPUT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  note: "interested in AI consulting",
  source: "chatbot",
  page: "/ai",
};

describe("leads-store", () => {
  let dataDir: string;
  let filePath: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "leads-"));
    process.env.DATA_DIR = dataDir;
    filePath = path.join(dataDir, "leads.jsonl");
    vi.mocked(captureException).mockClear();
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  describe("appendLead", () => {
    it("stamps schemaVersion, a uuid id, and an ISO createdAt", async () => {
      const record = await appendLead(INPUT);
      expect(record.schemaVersion).toBe(PERSISTENCE_SCHEMA_VERSION);
      expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(new Date(record.createdAt).toISOString()).toBe(record.createdAt);
      expect(record).toMatchObject(INPUT);
    });

    it("appends one JSON line per call, creating the directory on demand", async () => {
      await appendLead(INPUT);
      await appendLead({ ...INPUT, name: "Grace Hopper" });
      const raw = await fs.readFile(filePath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    });

    it("assigns a distinct id per record", async () => {
      const a = await appendLead(INPUT);
      const b = await appendLead(INPUT);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("readAllLeads", () => {
    it("returns [] when the file does not exist", async () => {
      await expect(readAllLeads()).resolves.toEqual([]);
    });

    it("round-trips appended records in order", async () => {
      const a = await appendLead(INPUT);
      const b = await appendLead({ ...INPUT, name: "Grace Hopper" });
      await expect(readAllLeads()).resolves.toEqual([a, b]);
    });

    it("skips invalid lines, keeps valid ones, and reports both failure channels", async () => {
      const a = await appendLead(INPUT);
      await fs.appendFile(filePath, "{ not json\n", "utf-8");
      await fs.appendFile(filePath, JSON.stringify({ schemaVersion: 999 }) + "\n", "utf-8");
      const records = await readAllLeads();
      expect(records).toEqual([a]);
      // Two reports by design: safeJsonParseServer reports the unparseable
      // line itself (scope "leads"), then the batch counter reports the total
      // dropped count (scope "leads.read") -- covering the schema-invalid line.
      expect(captureException).toHaveBeenCalledTimes(2);
      expect(vi.mocked(captureException).mock.calls.map((c) => c[0])).toEqual([
        "leads",
        "leads.read",
      ]);
    });
  });
});
