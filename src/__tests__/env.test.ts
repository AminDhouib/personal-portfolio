import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// env.ts validates process.env at import time, so every case re-imports a
// fresh module copy against a controlled process.env.
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

async function freshImport() {
  vi.resetModules();
  return import("@/env");
}

describe("env gateway", () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("imports cleanly when optional vars are absent", async () => {
    delete process.env.SENTRY_DSN;
    await expect(freshImport()).resolves.toBeDefined();
  });

  it("treats an empty string as unset (verbatim .env.example copy must not crash)", async () => {
    process.env.SENTRY_DSN = "";
    await expect(freshImport()).resolves.toBeDefined();
  });

  it("fails the eager parse when a URL-shaped var is malformed", async () => {
    process.env.SENTRY_DSN = "not-a-url";
    await expect(freshImport()).rejects.toThrow();
  });

  it("accepts a well-formed DSN", async () => {
    process.env.SENTRY_DSN = "https://key@sentry.devino.ca/35";
    await expect(freshImport()).resolves.toBeDefined();
  });

  it("reflects process.env mutations made after import (Proxy contract)", async () => {
    const { env } = await freshImport();
    process.env.GITHUB_TOKEN = "mutated-after-import";
    expect(env.GITHUB_TOKEN).toBe("mutated-after-import");
    delete process.env.GITHUB_TOKEN;
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
