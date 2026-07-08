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

describe("validateRequiredEnv (strict boot gate)", () => {
  // Sets every required var to a format-valid value; individual tests then
  // knock specific ones back out.
  async function armAllRequired() {
    const mod = await freshImport();
    for (const name of mod.REQUIRED_ENV_VARS) {
      process.env[name] = name.endsWith("_HOST") || name.endsWith("_DSN") ? "https://x.test" : "x";
    }
    delete process.env[mod.ENV_BYPASS_VAR];
    return mod;
  }

  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it("passes silently when every required var is set", async () => {
    const { validateRequiredEnv } = await armAllRequired();
    expect(() => validateRequiredEnv()).not.toThrow();
  });

  it("throws naming the exact missing variable", async () => {
    const mod = await armAllRequired();
    delete process.env.OPENROUTER_KEY;
    expect(() => mod.validateRequiredEnv()).toThrow(/OPENROUTER_KEY/);
  });

  it("lists ALL missing variables, not just the first", async () => {
    const mod = await armAllRequired();
    delete process.env.SENTRY_DSN;
    delete process.env.RESEND_API_KEY;
    delete process.env.GA4_PROPERTY_UPUP;
    expect(() => mod.validateRequiredEnv()).toThrow(
      /SENTRY_DSN, RESEND_API_KEY[\s\S]*GA4_PROPERTY_UPUP/,
    );
  });

  it("treats an empty string as missing", async () => {
    const mod = await armAllRequired();
    process.env.GITHUB_TOKEN = "";
    expect(() => mod.validateRequiredEnv()).toThrow(/GITHUB_TOKEN/);
  });

  it("the exact sentinel pair bypasses with a loud warning", async () => {
    const mod = await armAllRequired();
    delete process.env.OPENROUTER_KEY;
    process.env[mod.ENV_BYPASS_VAR] = mod.ENV_BYPASS_VALUE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => mod.validateRequiredEnv()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("OPENROUTER_KEY"));
    warn.mockRestore();
  });

  it.each([["true"], ["1"], ["yes"], ["skip"], ["disabled"]])(
    "rejects boolean-style bypass value %j",
    async (value) => {
      const mod = await armAllRequired();
      delete process.env.OPENROUTER_KEY;
      process.env[mod.ENV_BYPASS_VAR] = value;
      expect(() => mod.validateRequiredEnv()).toThrow(/not the exact required sentinel/);
    },
  );

  it("rejects the sentinel with a trailing space (no trimming, exact match only)", async () => {
    const mod = await armAllRequired();
    delete process.env.OPENROUTER_KEY;
    process.env[mod.ENV_BYPASS_VAR] = mod.ENV_BYPASS_VALUE + " ";
    expect(() => mod.validateRequiredEnv()).toThrow(/not the exact required sentinel/);
  });

  it("ignores the bypass entirely when nothing is missing", async () => {
    const mod = await armAllRequired();
    process.env[mod.ENV_BYPASS_VAR] = "garbage";
    expect(() => mod.validateRequiredEnv()).not.toThrow();
  });
});
