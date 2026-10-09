import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_KEY,
  CODE_MAX_CHARS,
  emptyCodeStore,
  loadCode,
  parseCode,
  saveCode,
  dailyCodeFor,
  setDailyCode,
  setTowerCode,
  TOO_LONG_MESSAGE,
} from "../code-store";

const safeStorage = vi.hoisted(() => ({ calls: [] as [string, string][] }));
vi.mock("@/lib/safe-storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/safe-storage")>();
  return {
    ...real,
    safeLocalSet: (key: string, value: string) => {
      safeStorage.calls.push([key, value]);
      return real.safeLocalSet(key, value);
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
  safeStorage.calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("knight:code storage", () => {
  it("has its own key, the 20,000 character cap and the pinned empty shape", () => {
    expect(CODE_KEY).toBe("knight:code");
    expect(CODE_MAX_CHARS).toBe(20_000);
    expect(emptyCodeStore()).toEqual({
      v: 1,
      towers: { "narrow-path": null, "powder-keep": null },
      daily: null,
    });
  });

  it("writes exactly this JSON (the pinned stored shape), through safeLocalSet", () => {
    saveCode(emptyCodeStore());
    const json = '{"v":1,"towers":{"narrow-path":null,"powder-keep":null},"daily":null}';
    expect(window.localStorage.getItem("knight:code")).toBe(json);
    expect(safeStorage.calls).toEqual([[CODE_KEY, json]]);
  });

  it("round-trips one evolving Player per tower and the daily code", () => {
    const set = setTowerCode(emptyCodeStore(), "narrow-path", "class Player {}");
    expect(set.ok).toBe(true);
    const store = {
      ...(set.ok ? set.store : emptyCodeStore()),
      daily: { day: "2026-10-15", code: "class Player { playTurn() {} }" },
    };
    saveCode(store);
    expect(loadCode()).toEqual(store);
  });

  it("keeps an emptied tower as an empty string, apart from a tower never saved", () => {
    const emptied = setTowerCode(emptyCodeStore(), "narrow-path", "");
    expect(emptied.ok).toBe(true);
    saveCode(emptied.ok ? emptied.store : emptyCodeStore());
    expect(loadCode().towers).toEqual({ "narrow-path": "", "powder-keep": null });
  });

  it("loads the empty store from empty, corrupt or blocked storage", () => {
    expect(loadCode()).toEqual(emptyCodeStore());
    window.localStorage.setItem(CODE_KEY, "[1,");
    expect(loadCode()).toEqual(emptyCodeStore());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadCode()).toEqual(emptyCodeStore());
  });

  it("leaves a record from a newer build alone", () => {
    window.localStorage.setItem(CODE_KEY, '{"v":2,"future":true}');
    saveCode(emptyCodeStore());
    expect(window.localStorage.getItem(CODE_KEY)).toBe('{"v":2,"future":true}');
    expect(safeStorage.calls).toEqual([]);
  });

  it("survives a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveCode(emptyCodeStore())).not.toThrow();
  });
});

describe("parseCode", () => {
  it("returns the empty store for null, non-objects and a wrong version", () => {
    for (const bad of [null, undefined, 7, "x", [], { v: 2, towers: {} }, { towers: {} }]) {
      expect(parseCode(bad)).toEqual(emptyCodeStore());
    }
  });

  it("falls back per field", () => {
    const parsed = parseCode({
      v: 1,
      towers: { "narrow-path": 12, "powder-keep": "class Player {}" },
      daily: { day: "yesterday", code: "x" },
    });
    expect(parsed.towers).toEqual({ "narrow-path": null, "powder-keep": "class Player {}" });
    expect(parsed.daily).toBeNull();
  });

  it("drops a stored string over the cap rather than loading it", () => {
    const parsed = parseCode({
      v: 1,
      towers: { "narrow-path": "x".repeat(CODE_MAX_CHARS + 1), "powder-keep": "ok" },
      daily: null,
    });
    expect(parsed.towers["narrow-path"]).toBeNull();
    expect(parsed.towers["powder-keep"]).toBe("ok");
  });

  it("keeps a good daily record", () => {
    const parsed = parseCode({ v: 1, daily: { day: "2026-10-15", code: "class Player {}" } });
    expect(parsed.daily).toEqual({ day: "2026-10-15", code: "class Player {}" });
  });
});

describe("setTowerCode", () => {
  it("accepts code up to exactly the cap", () => {
    const result = setTowerCode(emptyCodeStore(), "powder-keep", "x".repeat(CODE_MAX_CHARS));
    expect(result.ok).toBe(true);
  });

  it("refuses code over the cap and leaves the store as it was", () => {
    const before = emptyCodeStore();
    const result = setTowerCode(before, "powder-keep", "x".repeat(CODE_MAX_CHARS + 1));
    expect(result).toEqual({ ok: false, reason: "too-long" });
    expect(before).toEqual(emptyCodeStore());
  });

  it("words the refusal for the editor", () => {
    expect(TOO_LONG_MESSAGE).toBe("That is longer than 20,000 characters; it was not saved.");
  });
});

describe("the source", () => {
  it("never calls setItem itself", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const text = readFileSync(join(__dirname, "..", "code-store.ts"), "utf8");
    expect(text).not.toMatch(/\.setItem\(/);
  });
});

describe("the daily code slot", () => {
  it("starts from the tower code, then keeps the day's own edits", () => {
    const tower = setTowerCode(emptyCodeStore(), "narrow-path", "class Player { /* tower */ }");
    const store = tower.ok ? tower.store : emptyCodeStore();
    expect(dailyCodeFor(store, "2026-10-15", "narrow-path", "STARTER")).toBe(
      "class Player { /* tower */ }",
    );
    const edited = setDailyCode(store, "2026-10-15", "class Player { /* today */ }");
    expect(edited.ok && edited.store.daily).toEqual({
      day: "2026-10-15",
      code: "class Player { /* today */ }",
    });
    const kept = edited.ok ? edited.store : store;
    expect(dailyCodeFor(kept, "2026-10-15", "narrow-path", "STARTER")).toBe(
      "class Player { /* today */ }",
    );
  });

  it("resets with the day: yesterday's code is not today's", () => {
    const edited = setDailyCode(emptyCodeStore(), "2026-10-14", "class Player { /* old */ }");
    const store = edited.ok ? edited.store : emptyCodeStore();
    expect(dailyCodeFor(store, "2026-10-15", "narrow-path", "STARTER")).toBe("STARTER");
  });

  it("refuses code over the cap and says why", () => {
    expect(setDailyCode(emptyCodeStore(), "2026-10-15", "x".repeat(CODE_MAX_CHARS + 1))).toEqual({
      ok: false,
      reason: "too-long",
    });
    expect(setDailyCode(emptyCodeStore(), "2026-10-15", "x".repeat(CODE_MAX_CHARS)).ok).toBe(true);
  });

  it("does not touch the tower code", () => {
    const edited = setDailyCode(emptyCodeStore(), "2026-10-15", "class Player {}");
    expect(edited.ok && edited.store.towers).toEqual(emptyCodeStore().towers);
  });
});
