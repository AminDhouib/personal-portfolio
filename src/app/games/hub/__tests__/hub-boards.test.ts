import { afterEach, describe, expect, it, vi } from "vitest";
import { ARCADE_SCORE_CAP } from "@/lib/arcade/games";
import {
  HUB_FETCH_TIMEOUT_MS,
  HUB_ROW_LIMIT,
  fetchHubBoard,
  formatHubValue,
  formatRunTime,
  hubBoardUrl,
  parseArcadeRows,
  parsePg2Rows,
} from "../hub-boards";
import { isRecord } from "../guards";
import type { TodaySource } from "../today-sources";

const ARCADE: TodaySource = { slug: "hextris", kind: "arcade" };
const PG2: TodaySource = { slug: "password-game", kind: "pg2" };

function entry(handle: unknown, score: unknown) {
  return { rank: 1, handle, score, detail: {}, achievedAt: "2026-10-06T12:00:00.000Z" };
}

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("parseArcadeRows", () => {
  it("keeps the top three, numbered in order", () => {
    const rows = parseArcadeRows({
      entries: [
        entry("Nova", 48210),
        entry("Kite", 31990),
        entry("Moth", 12005),
        entry("Fourth", 100),
        entry("Fifth", 50),
      ],
    });
    expect(HUB_ROW_LIMIT).toBe(3);
    expect(rows).toEqual([
      { rank: 1, name: "Nova", value: 48210 },
      { rank: 2, name: "Kite", value: 31990 },
      { rank: 3, name: "Moth", value: 12005 },
    ]);
  });

  it("skips malformed rows and renumbers the rest", () => {
    const rows = parseArcadeRows({
      entries: [
        null,
        "oops",
        entry("NoScore", undefined),
        entry("StringScore", "9"),
        entry("NanScore", Number.NaN),
        entry("InfScore", Number.POSITIVE_INFINITY),
        entry("Good", 700),
      ],
    });
    expect(rows).toEqual([{ rank: 1, name: "Good", value: 700 }]);
  });

  it("clamps a score to 0..cap and floors a fraction", () => {
    const rows = parseArcadeRows({
      entries: [entry("High", ARCADE_SCORE_CAP + 500), entry("Neg", -40), entry("Frac", 12.9)],
    });
    expect(rows?.map((row) => row.value)).toEqual([ARCADE_SCORE_CAP, 0, 12]);
  });

  it("mirrors the server's score cap", () => {
    const rows = parseArcadeRows({ entries: [entry("Cap", Number.MAX_SAFE_INTEGER)] });
    expect(rows?.[0]?.value).toBe(ARCADE_SCORE_CAP);
  });

  it("trims, caps and cleans names, and falls back to Anonymous", () => {
    const rows = parseArcadeRows({
      entries: [entry("  Nova  ", 5), entry("x".repeat(40), 4), entry("ev\u202eil", 3)],
    });
    expect(rows?.[0]?.name).toBe("Nova");
    expect(rows?.[1]?.name).toBe("x".repeat(32));
    expect(rows?.[2]?.name).toBe("evil");
    const blanks = parseArcadeRows({ entries: [entry(42, 5), entry("   ", 4), entry(null, 3)] });
    expect(blanks?.map((row) => row.name)).toEqual(["Anonymous", "Anonymous", "Anonymous"]);
  });

  it("returns an empty list for an empty board", () => {
    expect(parseArcadeRows({ entries: [] })).toEqual([]);
  });

  it("returns null when the body is not a board", () => {
    for (const body of [null, undefined, {}, [], "x", 7, { entries: "x" }, { entries: {} }]) {
      expect(parseArcadeRows(body)).toBeNull();
    }
  });
});

describe("parsePg2Rows", () => {
  it("reads name and timeMs", () => {
    const rows = parsePg2Rows({
      entries: [
        { name: "Ada", seed: 1, timeMs: 83456, daily: true, createdAt: "x" },
        { name: "Linus", seed: 1, timeMs: 91200, daily: true, createdAt: "x" },
      ],
    });
    expect(rows).toEqual([
      { rank: 1, name: "Ada", value: 83456 },
      { rank: 2, name: "Linus", value: 91200 },
    ]);
  });

  it("skips rows without a numeric time and clamps to the one-hour ceiling", () => {
    const rows = parsePg2Rows({
      entries: [{ name: "A", timeMs: "fast" }, { name: "B", timeMs: 9_999_999 }, { name: "C" }],
    });
    expect(rows).toEqual([{ rank: 1, name: "B", value: 3_600_000 }]);
  });

  it("returns null for a body that is not a board", () => {
    expect(parsePg2Rows({ error: "x" })).toBeNull();
  });
});

describe("formatters", () => {
  it("formats a run time as m:ss.s, flooring to tenths", () => {
    expect(formatRunTime(83456)).toBe("1:23.4");
    expect(formatRunTime(10000)).toBe("0:10.0");
    expect(formatRunTime(3_599_999)).toBe("59:59.9");
    expect(formatRunTime(600_000)).toBe("10:00.0");
  });

  it("formats values per kind", () => {
    expect(formatHubValue("pg2", 83456)).toBe("1:23.4");
    expect(formatHubValue("arcade", 48210)).toBe("48,210");
    expect(formatHubValue("arcade", 0)).toBe("0");
  });
});

describe("hubBoardUrl", () => {
  it("asks the arcade API for the daily board of one game", () => {
    expect(hubBoardUrl(ARCADE)).toBe("/api/arcade/scores?game=hextris&board=daily");
  });

  it("asks the PG2 API for today's daily runs", () => {
    expect(hubBoardUrl(PG2)).toBe("/api/password-game-2/leaderboard?daily=1");
  });

  it("never carries a player id", () => {
    expect(hubBoardUrl(ARCADE)).not.toContain("player");
    expect(hubBoardUrl(PG2)).not.toContain("player");
  });
});

describe("fetchHubBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function respond(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }

  function stubFetch(impl: (url: string, init: RequestInit | undefined) => Promise<Response>) {
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => impl(String(input), init));
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("returns the parsed top rows and sends a bounded request", async () => {
    const fn = stubFetch(() => Promise.resolve(respond(200, { entries: [entry("Nova", 48210)] })));
    const result = await fetchHubBoard(ARCADE);
    expect(result).toEqual({ status: "ok", rows: [{ rank: 1, name: "Nova", value: 48210 }] });
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] ?? [];
    expect(url).toBe("/api/arcade/scores?game=hextris&board=daily");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns an empty board as ok with no rows", async () => {
    stubFetch(() => Promise.resolve(respond(200, { entries: [] })));
    expect(await fetchHubBoard(PG2)).toEqual({ status: "ok", rows: [] });
  });

  it("maps 429 and 500 to an error", async () => {
    stubFetch(() => Promise.resolve(respond(429, { error: "too many requests" })));
    expect(await fetchHubBoard(ARCADE)).toEqual({ status: "error" });
    stubFetch(() => Promise.resolve(respond(500, { error: "x" })));
    expect(await fetchHubBoard(ARCADE)).toEqual({ status: "error" });
  });

  it("maps a rejected fetch to an error", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await fetchHubBoard(ARCADE)).toEqual({ status: "error" });
  });

  it("maps an unreadable or wrong-shaped body to an error", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("bad json")),
      } as Response),
    );
    expect(await fetchHubBoard(ARCADE)).toEqual({ status: "error" });
    stubFetch(() => Promise.resolve(respond(200, { nope: true })));
    expect(await fetchHubBoard(ARCADE)).toEqual({ status: "error" });
  });

  it("does not raise an error report for a failed read", async () => {
    const report = vi.spyOn(globalThis, "reportError");
    stubFetch(() => Promise.reject(new Error("offline")));
    await fetchHubBoard(ARCADE);
    expect(report).not.toHaveBeenCalled();
    report.mockRestore();
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const pending = fetchHubBoard(ARCADE);
    await vi.advanceTimersByTimeAsync(HUB_FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ status: "error" });
  });

  it("aborts the request when the caller's signal aborts", async () => {
    let seen: AbortSignal | undefined;
    stubFetch((_url, init) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const parent = new AbortController();
    const pending = fetchHubBoard(ARCADE, parent.signal);
    parent.abort();
    await expect(pending).resolves.toEqual({ status: "error" });
    expect(seen?.aborted).toBe(true);
  });

  it("does not start a request for a signal that is already aborted", async () => {
    const fn = stubFetch(() => Promise.resolve(respond(200, { entries: [] })));
    const parent = new AbortController();
    parent.abort();
    expect(await fetchHubBoard(ARCADE, parent.signal)).toEqual({ status: "error" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("clears its timeout once the read settles", async () => {
    vi.useFakeTimers();
    stubFetch(() => Promise.resolve(respond(200, { entries: [] })));
    await fetchHubBoard(ARCADE);
    expect(vi.getTimerCount()).toBe(0);
  });
});
