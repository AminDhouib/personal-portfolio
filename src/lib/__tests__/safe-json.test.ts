import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { safeJsonParse } from "@/lib/safe-json";
import { safeJsonParseServer } from "@/lib/safe-json-server";
import { captureException } from "@/lib/log";

vi.mock("@/lib/log", () => ({ captureException: vi.fn() }));

describe("safeJsonParse (client-safe default path)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let reportErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportErrorSpy = vi.fn();
    vi.stubGlobal("reportError", reportErrorSpy);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("returns the parsed value for valid JSON", () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}', "test")).toEqual({ a: 1 });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("returns null for invalid JSON and reports via console.error + reportError", () => {
    expect(safeJsonParse("{not json", "test-scope")).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain("test-scope");
    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    expect(reportErrorSpy.mock.calls[0]?.[0]).toBeInstanceOf(SyntaxError);
  });

  it("returns the provided fallback for invalid JSON", () => {
    expect(safeJsonParse<number[]>("oops", "test", [])).toEqual([]);
  });

  it("survives a missing reportError global (older Node)", () => {
    vi.stubGlobal("reportError", undefined);
    expect(safeJsonParse("nope", "test")).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("routes failures to an injected reporter INSTEAD of the client default path", () => {
    const report = vi.fn();
    expect(safeJsonParse("{bad", "inject-scope", null, report)).toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toBe("inject-scope");
    expect(report.mock.calls[0]?.[1]).toBeInstanceOf(SyntaxError);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(reportErrorSpy).not.toHaveBeenCalled();
  });

  it("does not invoke the injected reporter on success", () => {
    const report = vi.fn();
    expect(safeJsonParse('{"ok":true}', "inject-scope", null, report)).toEqual({ ok: true });
    expect(report).not.toHaveBeenCalled();
  });
});

describe("safeJsonParseServer (NF-1: server failures must reach captureException)", () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  it("parses valid JSON without reporting", () => {
    expect(safeJsonParseServer<{ a: number }>('{"a":2}', "srv")).toEqual({ a: 2 });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports parse failures through captureException and returns the fallback", () => {
    expect(safeJsonParseServer<string[]>("corrupt{", "leaderboard", [])).toEqual([]);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureException).mock.calls[0]?.[0]).toBe("leaderboard");
    expect(vi.mocked(captureException).mock.calls[0]?.[1]).toBeInstanceOf(SyntaxError);
  });
});
