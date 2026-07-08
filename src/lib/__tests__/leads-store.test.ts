import { describe, it, expect, beforeEach, vi } from "vitest";

const tableRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toUpperCase();
      if (text.startsWith("INSERT")) {
        const row = {
          id: crypto.randomUUID(),
          name: params?.[0],
          email: params?.[1],
          note: params?.[2],
          source: params?.[3],
          page: params?.[4],
          createdAt: new Date().toISOString(),
        };
        tableRows.push(row);
        return { rows: [row] };
      }
      if (text.startsWith("SELECT")) {
        return { rows: tableRows.map((r) => ({ ...r })) };
      }
      return { rows: [] };
    }),
  }),
}));

vi.mock("@/lib/log", () => ({
  captureException: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { appendLead, readAllLeads } from "../leads-store";

const INPUT = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  note: "interested in AI consulting",
  source: "chatbot",
  page: "/ai",
};

describe("leads-store (Postgres)", () => {
  beforeEach(() => {
    tableRows.length = 0;
  });

  describe("appendLead", () => {
    it("returns a record with id and createdAt", async () => {
      const record = await appendLead(INPUT);
      expect(record.id).toBeTruthy();
      expect(record.createdAt).toBeTruthy();
      expect(record.name).toBe(INPUT.name);
      expect(record.email).toBe(INPUT.email);
    });

    it("assigns a distinct id per record", async () => {
      const a = await appendLead(INPUT);
      const b = await appendLead(INPUT);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("readAllLeads", () => {
    it("returns [] when the table is empty", async () => {
      await expect(readAllLeads()).resolves.toEqual([]);
    });

    it("round-trips appended records", async () => {
      await appendLead(INPUT);
      await appendLead({ ...INPUT, name: "Grace Hopper" });
      const records = await readAllLeads();
      expect(records).toHaveLength(2);
      expect(records[0]?.name).toBe("Ada Lovelace");
      expect(records[1]?.name).toBe("Grace Hopper");
    });
  });
});
