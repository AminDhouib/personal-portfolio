import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { GAMES_BY_SLUG } from "@/app/games/games-meta";
import { TODAY_SOURCES } from "../today-sources";
import { TodayStrip } from "../today-strip";

function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function arcadeBody(rows: { handle: string; score: number }[]) {
  return {
    entries: rows.map((row, index) => ({
      rank: index + 1,
      ...row,
      detail: {},
      achievedAt: "2026-10-06T12:00:00.000Z",
    })),
  };
}

function pg2Body(rows: { name: string; timeMs: number }[]) {
  return {
    entries: rows.map((row) => ({
      ...row,
      seed: 1,
      daily: true,
      createdAt: "2026-10-06T12:00:00Z",
    })),
  };
}

function stubFetch(handler: (url: string) => Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function settled() {
  await waitFor(() =>
    expect(screen.getByTestId("hub-today")).toHaveAttribute("data-state", "settled"),
  );
}

function tiles() {
  return screen.getAllByTestId("today-tile");
}

describe("TodayStrip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    vi.restoreAllMocks();
  });

  it("server-renders six placeholder tiles and a static reset line", () => {
    const fn = stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    const html = renderToString(<TodayStrip />);
    expect(html.match(/data-state="idle"/g)).toHaveLength(6);
    expect(html).toContain('data-state="loading"');
    expect(html).toContain("Resets at 00:00 UTC");
    expect(html).not.toContain("Resets in");
    expect(html.split("\u2014").length - 1).toBe(18);
    for (const source of TODAY_SOURCES) {
      expect(html).toContain(`href="/games/${source.slug}"`);
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it("fills each tile from its board", async () => {
    stubFetch((url) => {
      if (url.includes("password-game-2")) {
        return Promise.resolve(
          reply(
            200,
            pg2Body([
              { name: "Ada", timeMs: 83456 },
              { name: "Linus", timeMs: 91200 },
            ]),
          ),
        );
      }
      if (url.includes("game=space-shooter")) {
        return Promise.resolve(reply(200, arcadeBody([{ handle: "Nova", score: 48210 }])));
      }
      if (url.includes("game=super-voltorb-flip")) {
        return Promise.resolve(reply(200, arcadeBody([{ handle: "Pika", score: 384 }])));
      }
      return Promise.resolve(reply(200, arcadeBody([{ handle: "Pixel", score: 9100 }])));
    });
    render(<TodayStrip />);
    await settled();
    const [pg2, orbital, hextris, voltorb] = tiles();
    expect(pg2).toHaveAttribute("data-state", "ready");
    expect(pg2).toHaveTextContent("Ada");
    expect(pg2).toHaveTextContent("1:23.4");
    expect(pg2).toHaveTextContent("Linus");
    expect(pg2).toHaveTextContent("Daily run");
    expect(pg2).toHaveTextContent("Fastest daily runs posted today (UTC)");
    expect(orbital).toHaveTextContent("Nova");
    expect(orbital).toHaveTextContent("48,210");
    expect(hextris).toHaveTextContent("Pixel");
    expect(hextris).toHaveTextContent("9,100");
    expect(voltorb).toHaveTextContent("Pika");
    expect(voltorb).toHaveTextContent("384");
  });

  it("asks for the six public daily boards, from six URLs and never sends a player id", async () => {
    const fn = stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    render(<TodayStrip />);
    await settled();
    expect(fn).toHaveBeenCalledTimes(6);
    const urls = fn.mock.calls.map((call) => String(call[0])).sort();
    expect(urls).toEqual([
      "/api/arcade/scores?game=hextris&board=daily",
      "/api/arcade/scores?game=space-shooter&board=daily",
      "/api/arcade/scores?game=super-voltorb-flip&board=daily",
      "/api/arcade/scores?game=tower-stacker&board=daily",
      "/api/arcade/scores?game=typing-speed&board=daily",
      "/api/password-game-2/leaderboard?daily=1",
    ]);
    for (const url of urls) expect(url).not.toContain("player");
  });

  it("says so when nobody has played today", async () => {
    stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    render(<TodayStrip />);
    await settled();
    for (const tile of tiles()) {
      expect(tile).toHaveAttribute("data-state", "empty");
      expect(tile).toHaveTextContent("No runs yet today. Be the first.");
    }
  });

  it("shows an unavailable tile for a 500, a 429 and a rejected read, without reporting", async () => {
    const report = vi.spyOn(globalThis, "reportError");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch((url) => {
      if (url.includes("password-game-2")) return Promise.resolve(reply(500, { error: "x" }));
      if (url.includes("game=space-shooter")) return Promise.resolve(reply(429, { error: "x" }));
      return Promise.reject(new Error("offline"));
    });
    render(<TodayStrip />);
    await settled();
    for (const tile of tiles()) {
      expect(tile).toHaveAttribute("data-state", "error");
      expect(tile).toHaveTextContent("Board unavailable right now");
    }
    expect(report).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders a hostile name as text, not markup", async () => {
    stubFetch(() =>
      Promise.resolve(
        reply(200, arcadeBody([{ handle: "<img src=x onerror=alert(1)>", score: 5 }])),
      ),
    );
    render(<TodayStrip />);
    await settled();
    expect(document.querySelector("img")).toBeNull();
    expect(tiles()[1]).toHaveTextContent("<img src=x onerror=alert(1)>");
  });

  it("is an h2 with an h3 per tile, in source order", async () => {
    stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    render(<TodayStrip />);
    await settled();
    expect(screen.getByRole("heading", { level: 2, name: "Today" })).toBeInTheDocument();
    const tileHeadings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(tileHeadings).toEqual(TODAY_SOURCES.map((source) => GAMES_BY_SLUG[source.slug].title));
  });

  it("links each tile to its game with a 44px target", async () => {
    stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    render(<TodayStrip />);
    await settled();
    tiles().forEach((tile, index) => {
      const source = TODAY_SOURCES[index];
      const link = within(tile).getByRole("link", {
        name: `Play ${GAMES_BY_SLUG[source!.slug].title}`,
      });
      expect(link).toHaveAttribute("href", `/games/${source!.slug}`);
      expect(link.className).toContain("min-h-11");
    });
  });

  it("shows the live countdown once mounted", async () => {
    stubFetch(() => Promise.resolve(reply(200, { entries: [] })));
    render(<TodayStrip />);
    await settled();
    expect(screen.getByTestId("hub-today-reset").textContent).toMatch(
      /^Resets in (\d+h )?\d+m \(00:00 UTC\)$/,
    );
  });

  it("keeps the same three rows of room in every state", async () => {
    stubFetch(() => Promise.resolve(reply(200, arcadeBody([{ handle: "Solo", score: 1 }]))));
    const { container } = render(<TodayStrip />);
    // Every tile body has the fixed-height class in every state (the real measurement is in
    // e2e/games-hub.spec.ts).
    expect(container.querySelectorAll("[data-tile-body]")).toHaveLength(6);
    for (const body of container.querySelectorAll("[data-tile-body]")) {
      expect(body.className).toContain("h-18");
    }
    await settled();
    for (const body of container.querySelectorAll("[data-tile-body]")) {
      expect(body.className).toContain("h-18");
    }
  });

  it("lets a lone last tile span the row at md and sits three across from xl", () => {
    const html = renderToString(<TodayStrip />)
      .replaceAll("&amp;", "&")
      .replaceAll("&gt;", ">");
    expect(html).toContain("md:[&>*:last-child:nth-child(odd)]:col-span-2");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).toContain("xl:[&>*:last-child:nth-child(odd)]:col-span-1");
  });
});
