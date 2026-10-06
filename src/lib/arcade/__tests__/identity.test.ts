import { webcrypto } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const KEY = "arcade:player:v1";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// The module keeps an in-memory fallback, so every test loads a fresh copy.
async function load() {
  vi.resetModules();
  return import("../identity");
}

describe("arcade identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // One crypto source for every test, whatever the jsdom build provides.
    vi.stubGlobal("crypto", webcrypto);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("peekIdentity creates nothing and writes nothing", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { peekIdentity } = await load();
    expect(peekIdentity()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("getIdentity creates a v4 UUID and a 43-character base64url token, and persists them", async () => {
    const { getIdentity, peekIdentity } = await load();
    const identity = getIdentity();
    expect(identity.playerId).toMatch(UUID_V4);
    expect(identity.token).toMatch(TOKEN);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual(identity);
    expect(peekIdentity()).toEqual(identity);
  });

  it("getIdentity returns the same identity on every call", async () => {
    const { getIdentity } = await load();
    expect(getIdentity()).toEqual(getIdentity());
  });

  it("two fresh browsers get different identities", async () => {
    const first = (await load()).getIdentity();
    window.localStorage.clear();
    const second = (await load()).getIdentity();
    expect(second.playerId).not.toBe(first.playerId);
    expect(second.token).not.toBe(first.token);
  });

  it("reuses a stored identity after a reload (a new module instance)", async () => {
    const stored = {
      playerId: "11111111-1111-4111-8111-111111111111",
      token: "A".repeat(43),
    };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
    const { getIdentity, peekIdentity } = await load();
    expect(peekIdentity()).toEqual(stored);
    expect(getIdentity()).toEqual(stored);
  });

  it("replaces corrupt JSON with a fresh identity", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.setItem(KEY, "{not json");
    const { getIdentity, peekIdentity } = await load();
    expect(peekIdentity()).toBeNull();
    const identity = getIdentity();
    expect(identity.playerId).toMatch(UUID_V4);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual(identity);
  });

  it.each([
    ["a short token", { playerId: "11111111-1111-4111-8111-111111111111", token: "short" }],
    ["a non-v4 id", { playerId: "11111111-1111-1111-8111-111111111111", token: "A".repeat(43) }],
    ["a non-string id", { playerId: 7, token: "A".repeat(43) }],
    ["null", null],
  ])("treats %s as no identity", async (_label, value) => {
    window.localStorage.setItem(KEY, JSON.stringify(value));
    const { peekIdentity, getIdentity } = await load();
    expect(peekIdentity()).toBeNull();
    expect(getIdentity().playerId).toMatch(UUID_V4);
  });

  it("resetIdentity replaces the identity and persists the new one", async () => {
    const { getIdentity, resetIdentity, peekIdentity } = await load();
    const before = getIdentity();
    const after = resetIdentity();
    expect(after.playerId).not.toBe(before.playerId);
    expect(peekIdentity()).toEqual(after);
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "null")).toEqual(after);
  });

  it("keeps one identity for the session when storage writes fail (private mode)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { getIdentity, peekIdentity } = await load();
    const identity = getIdentity();
    expect(identity.playerId).toMatch(UUID_V4);
    expect(getIdentity()).toEqual(identity);
    expect(peekIdentity()).toEqual(identity);
  });

  it("still works when storage reads throw (blocked storage)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { getIdentity, peekIdentity } = await load();
    expect(peekIdentity()).toBeNull();
    const identity = getIdentity();
    expect(identity.token).toMatch(TOKEN);
    expect(peekIdentity()).toEqual(identity);
  });

  it("builds the UUID and token from the random bytes exactly (all 0xff)", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0xff) });
    const { getIdentity } = await load();
    const identity = getIdentity();
    // Version nibble forced to 4, variant bits forced to 10xx; token is unpadded base64url.
    expect(identity.playerId).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(identity.token).toBe(`${"_".repeat(42)}8`);
  });

  it("builds the UUID and token from the random bytes exactly (all zero)", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(0) });
    const { getIdentity } = await load();
    const identity = getIdentity();
    expect(identity.playerId).toBe("00000000-0000-4000-8000-000000000000");
    expect(identity.token).toBe("A".repeat(43));
  });
});
