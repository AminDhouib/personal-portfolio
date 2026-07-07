import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { vi } from "vitest";

const { GET } = await import("../route");

interface HealthResponse {
  status: string;
  uptime: number;
  checks: { data: string };
}

describe("GET /api/health", () => {
  it("returns 200 status ok with checks.data writable when the access probe resolves", async () => {
    const accessSpy = vi.spyOn(fs, "access").mockResolvedValueOnce(undefined);
    const res = await GET();
    accessSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.checks.data).toBe("writable");
  });

  it("still returns 200 (liveness, not readiness) with checks.data unwritable when the probe rejects", async () => {
    const accessSpy = vi.spyOn(fs, "access").mockRejectedValueOnce(new Error("EACCES"));
    const res = await GET();
    accessSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.checks.data).toBe("unwritable");
  });
});
