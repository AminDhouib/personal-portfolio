// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { lockDown, REMOVED_GLOBALS } from "../lockdown";

const originalLimit = Error.stackTraceLimit;

afterEach(() => {
  Error.stackTraceLimit = originalLimit;
});

describe("REMOVED_GLOBALS", () => {
  it("is pinned", () => {
    expect([...REMOVED_GLOBALS]).toEqual([
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "WebTransport",
      "importScripts",
      "indexedDB",
      "caches",
      "BroadcastChannel",
      "Worker",
      "SharedWorker",
      "postMessage",
      "onmessage",
      "addEventListener",
      "removeEventListener",
      "close",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "clearInterval",
      "queueMicrotask",
      "requestAnimationFrame",
      "navigator",
      "location",
      "performance",
      "crypto",
      "reportError",
      "dispatchEvent",
    ]);
  });

  it("keeps Date, which the engine never reads a clock through", () => {
    expect((REMOVED_GLOBALS as readonly string[]).includes("Date")).toBe(false);
  });
});

describe("lockDown", () => {
  it("deletes every listed name from a plain object and leaves the rest", () => {
    const scope: Record<string, unknown> = { keep: 1, Date };
    for (const name of REMOVED_GLOBALS) scope[name] = () => name;
    const { removed, stuck } = lockDown(scope);
    for (const name of REMOVED_GLOBALS) {
      expect(name in scope).toBe(false);
      expect(typeof scope[name]).toBe("undefined");
    }
    expect([...removed].sort()).toEqual([...REMOVED_GLOBALS].sort());
    expect(stuck).toEqual([]);
    expect(scope.keep).toBe(1);
    expect(scope.Date).toBe(Date);
  });

  it("removes a name that lives on the prototype chain, from every level", () => {
    const grand = { fetch: () => "grand", postMessage: () => "grand" };
    const parent = Object.create(grand, {
      fetch: { value: () => "parent", configurable: true },
    });
    const scope = Object.create(parent, {
      fetch: { value: () => "own", configurable: true, writable: true },
    });
    const { removed } = lockDown(scope);
    expect(scope.fetch).toBeUndefined();
    expect("fetch" in scope).toBe(false);
    expect(Object.hasOwn(parent, "fetch")).toBe(false);
    expect(Object.hasOwn(grand, "fetch")).toBe(false);
    expect("postMessage" in scope).toBe(false);
    expect(removed).toContain("fetch");
    expect(removed).toContain("postMessage");
  });

  it("sets a non-configurable but writable property to undefined", () => {
    const scope = {};
    Object.defineProperty(scope, "location", {
      value: "https://example.test/",
      writable: true,
      configurable: false,
    });
    const { removed, stuck } = lockDown(scope);
    expect((scope as Record<string, unknown>).location).toBeUndefined();
    expect(removed).toContain("location");
    expect(stuck).toEqual([]);
  });

  it("reports a non-configurable, non-writable property as stuck", () => {
    const scope = {};
    Object.defineProperty(scope, "navigator", {
      value: {},
      writable: false,
      configurable: false,
    });
    Object.defineProperty(scope, "crypto", { get: () => ({}), configurable: false });
    const { stuck } = lockDown(scope);
    expect(stuck).toEqual(expect.arrayContaining(["navigator", "crypto"]));
    expect((scope as Record<string, unknown>).navigator).toEqual({});
  });

  it("does not touch Object.prototype", () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    lockDown(Object.create({ fetch: 1 }));
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  });

  it("reports nothing for names the scope never had", () => {
    expect(lockDown({})).toEqual({ removed: [], stuck: [] });
  });

  it("raises the stack trace limit so line numbers survive", () => {
    Error.stackTraceLimit = 10;
    lockDown({});
    expect(Error.stackTraceLimit).toBe(50);
  });
});
