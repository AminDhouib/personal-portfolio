import { describe, it, expect, vi } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

const { GET } = await import("../route");

interface HealthResponse {
  status: string;
  uptime: number;
  checks: { db: string };
}

describe("GET /api/health", () => {
  it("returns status ok with checks.db connected when the query succeeds", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.checks.db).toBe("connected");
  });

  it("returns status degraded with checks.db unreachable when the query fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe("degraded");
    expect(body.checks.db).toBe("unreachable");
  });
});
