import { vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Shared fixtures for API route tests. Consolidates the byte-identical
 * copies that previously lived in the leaderboard, leads, and password-game
 * leaderboard suites (audit P2-TEST-006). Route-specific request builders
 * (copilotkit's origin-only variant, monitoring's raw-string variant,
 * route-guard's plain-Request variant) intentionally stay local to their
 * suites: their shapes differ because the routes differ, and inlining keeps
 * those tests readable.
 */

let ipCounter = 0;

/**
 * A fresh RFC-1918 address per call so rate-limit buckets never collide
 * across tests (or suites -- the counter is shared module state on purpose).
 */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.40.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

/**
 * JSON POST with the origin/host/ip headers the guard chain inspects.
 * Defaults mirror a same-origin browser request from the production domain.
 */
export function makeJsonPostRequest(
  body: unknown,
  opts: { ip?: string; origin?: string | null; host?: string; url?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  const origin = opts.origin === undefined ? "https://amindhou.com" : opts.origin;
  if (origin) headers["origin"] = origin;
  headers["x-forwarded-host"] = opts.host ?? "amindhou.com";
  headers["x-forwarded-for"] = opts.ip ?? uniqueIp();
  return new NextRequest(opts.url ?? "https://amindhou.com/api/leaderboard", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Stub for global fetch resolving to a minimal JSON Response. */
export function mockFetchJsonResponse(value: { ok: boolean; body?: unknown }) {
  const response: Pick<Response, "ok"> & { json: () => Promise<unknown> } = {
    ok: value.ok,
    json: () => Promise.resolve(value.body),
  };
  return vi.fn().mockResolvedValue(response);
}
