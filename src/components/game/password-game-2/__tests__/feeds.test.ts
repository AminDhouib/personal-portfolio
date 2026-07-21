import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLiveFeeds } from "../feeds";
import { getInjectedWordleWord, setTodayWord } from "@/data/password-game/wordle";
import { getInjectedCapitals, setExtendedCapitals } from "@/data/password-game/capitals";
import {
  getDailyChessPuzzle,
  setDailyChessPuzzle,
  type ChessPuzzle,
} from "@/data/password-game/chess";

/**
 * Unit tests for the live-feed loader. Global fetch is mocked per-URL so we can drive
 * each of the three feeds independently, asserting the parsed payload reaches the
 * matching setter on success, that the empty-list / null-puzzle degradations are NOT
 * injected, that a rejecting fetch leaves the feeds untouched without throwing, and
 * that all three fetches fire in parallel (before any resolves).
 */

const PUZZLE: ChessPuzzle = {
  id: "lichess-daily",
  board: [
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
  ],
  toMove: "white",
  bestMove: "Ra8",
  accept: ["Ra8", "Ra8#"],
  hint: "Theme: back rank.",
  fen: "k7/1ppp4/8/8/8/8/R7/K7 w - - 0 1",
};

type Payloads = {
  wordle?: unknown;
  countries?: unknown;
  chess?: unknown;
};

/** Install a fetch mock that answers each feed URL with a 200 + JSON body. */
function mockFetch(p: Payloads): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.includes("/wordle")
        ? p.wordle
        : url.includes("/countries")
          ? p.countries
          : p.chess;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }),
  );
}

beforeEach(() => {
  setTodayWord(null);
  setExtendedCapitals(null);
  setDailyChessPuzzle(null);
});

afterEach(() => {
  setTodayWord(null);
  setExtendedCapitals(null);
  setDailyChessPuzzle(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadLiveFeeds", () => {
  it("injects each parsed payload into its setter on success", async () => {
    mockFetch({
      wordle: { word: "FLAME", source: "nyt" },
      countries: { capitals: [{ country: "France", capital: "Paris" }], count: 1 },
      chess: { puzzle: PUZZLE, source: "lichess" },
    });

    await loadLiveFeeds();

    expect(getInjectedWordleWord()).toBe("FLAME");
    expect(getInjectedCapitals()).toEqual([{ country: "France", capital: "Paris" }]);
    expect(getDailyChessPuzzle()).toEqual(PUZZLE);
  });

  it("uppercases a lowercased wordle answer before injecting", async () => {
    mockFetch({ wordle: { word: "flame" }, countries: { capitals: [] }, chess: { puzzle: null } });
    await loadLiveFeeds();
    expect(getInjectedWordleWord()).toBe("FLAME");
  });

  it("does not inject an empty capitals list", async () => {
    mockFetch({
      wordle: { word: "FLAME" },
      countries: { capitals: [], count: 0, source: "unavailable" },
      chess: { puzzle: null },
    });

    await loadLiveFeeds();

    expect(getInjectedCapitals()).toBeNull();
  });

  it("does not inject a null puzzle", async () => {
    mockFetch({
      wordle: { word: "FLAME" },
      countries: { capitals: [] },
      chess: { puzzle: null, source: "unavailable" },
    });

    await loadLiveFeeds();

    expect(getDailyChessPuzzle()).toBeNull();
  });

  it("does not inject a puzzle missing the fields the rule reads", async () => {
    mockFetch({
      wordle: { word: "FLAME" },
      countries: { capitals: [] },
      chess: { puzzle: { id: "x", board: PUZZLE.board } }, // no toMove/bestMove/hint
    });

    await loadLiveFeeds();

    expect(getDailyChessPuzzle()).toBeNull();
  });

  it("does not inject a puzzle missing fen (the playable widget needs it)", async () => {
    // A payload cached before fen was served: every other field is present, but
    // the widget cannot load an absent position — degrade the rule to a freebie.
    const { fen: _fen, ...noFen } = PUZZLE;
    mockFetch({
      wordle: { word: "FLAME" },
      countries: { capitals: [] },
      chess: { puzzle: noFen },
    });

    await loadLiveFeeds();

    expect(getDailyChessPuzzle()).toBeNull();
  });

  it("leaves every feed untouched and does not throw when the fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("timed out", "TimeoutError"))),
    );

    await expect(loadLiveFeeds()).resolves.toBeUndefined();

    expect(getInjectedWordleWord()).toBeNull();
    expect(getInjectedCapitals()).toBeNull();
    expect(getDailyChessPuzzle()).toBeNull();
  });

  it("fires all three feed fetches in parallel, before any resolves", () => {
    const fetchMock = vi.fn((_url: string) => new Promise(() => {})); // never resolves
    vi.stubGlobal("fetch", fetchMock);

    void loadLiveFeeds(); // do not await — the three fetches must already be in flight

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/wordle"))).toBe(true);
    expect(urls.some((u) => u.includes("/countries"))).toBe(true);
    expect(urls.some((u) => u.includes("/chess-puzzle"))).toBe(true);
  });
});
