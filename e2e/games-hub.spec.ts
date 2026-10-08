import { expect, test, type Browser, type Page } from "@playwright/test";
import { blockThirdParties } from "./helpers";
import { GAMES, GAMES_BY_SLUG } from "../src/app/games/games-meta";
import { TODAY_SOURCES } from "../src/app/games/hub/today-sources";

// The /games hub against a real production build. Both board reads are answered by
// page.route (never the database, never prod), so the content is deterministic. Local
// storage is seeded through Playwright's storageState (applied before any page script runs,
// with no setItem call in our code) and only ever read back; the hub must never write.
// Third-party hosts (analytics, the Sentry tunnel, the chat proxy) are blocked per test.

const PUBLIC_GAMES = GAMES.filter((game) => !game.hidden);
const FEATURED = PUBLIC_GAMES.find((game) => game.featured);
if (!FEATURED) throw new Error("games-meta.ts must flag one public game as featured");
const REST = PUBLIC_GAMES.filter((game) => game !== FEATURED);

// The five keys the hub may read. Hard-coded on purpose: importing hub-stats would pull the
// app's "@/" aliases into the spec, and the unit test already pins that list.
const HUB_KEYS = [
  "space-shooter-hs",
  "orbital-dodge-profile",
  "hextris_highscores",
  "svf:progress",
  "typing-high-score",
];

const SEEDED: Record<string, string> = {
  "space-shooter-hs": "48210",
  "orbital-dodge-profile": JSON.stringify({
    totalRunsPlayed: 12,
    unlockedAchievements: ["first-death"],
  }),
  hextris_highscores: JSON.stringify([9100, 400]),
  "svf:progress": JSON.stringify({ currentLevel: 4, totalScore: 1200 }),
  "typing-high-score": "87",
};

const CORRUPT: Record<string, string> = {
  "space-shooter-hs": "NaN",
  "orbital-dodge-profile": "{oops",
  hextris_highscores: "{oops",
  "svf:progress": "null",
  "typing-high-score": "-4",
};

const EMPTY_COPY = "Play any game and your bests on this device show up here.";
const PRIVACY_COPY = "Read from this browser only. Nothing here is sent anywhere.";
const LONG_NAME = "W".repeat(32);

type Variant = "populated" | "empty" | "error";

interface MockOptions {
  /** Held reads wait for this promise before they are answered. */
  hold?: Promise<void> | undefined;
  /** Every row name is 32 wide characters, the longest the server allows. */
  longNames?: boolean | undefined;
}

type SeededState = {
  cookies: [];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/**
 * Local storage for the app's origin, applied by Playwright's storageState before any page
 * script runs. No setItem call is involved, so the storage-write gate stays intact.
 */
function seededState(baseURL: string | undefined, data: Record<string, string>): SeededState {
  if (!baseURL) throw new Error("baseURL is required to seed storage");
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: Object.entries(data).map(([name, value]) => ({ name, value })),
      },
    ],
  };
}

/**
 * A `storageState` fixture that seeds `data` for the app's origin. Used as
 * `test.use({ storageState: seeded(DATA) })`, so a describe block's page starts with that storage.
 */
function seeded(data: Record<string, string>) {
  return async (
    { baseURL }: { baseURL: string | undefined },
    apply: (state: SeededState) => Promise<void>,
  ) => apply(seededState(baseURL, data));
}

function arcadeBody(slug: string, variant: Variant, longNames: boolean) {
  // Voltorb scores are coins on a board that pays at most a few hundred, so its rows step by 100.
  const voltorb = slug === "super-voltorb-flip";
  const top = slug === "space-shooter" ? 48210 : voltorb ? 384 : 9100;
  const first = slug === "space-shooter" ? "Nova" : voltorb ? "Pika" : "Kite";
  const names = [longNames ? LONG_NAME : first, "Orbit", "Vega"];
  const entries =
    variant === "empty"
      ? []
      : names.map((handle, index) => ({
          rank: index + 1,
          handle,
          score: top - index * (voltorb ? 100 : 1000),
          detail: null,
          achievedAt: "2026-10-06T12:00:00.000Z",
        }));
  return { game: slug, board: "daily", entries, you: null };
}

function pg2Body(variant: Variant, longNames: boolean) {
  const names = [longNames ? LONG_NAME : "Ada", "Grace", "Linus"];
  const entries =
    variant === "empty"
      ? []
      : names.map((name, index) => ({
          name,
          seed: "2026-10-06",
          timeMs: 83_400 + index * 4_000,
          daily: true,
          createdAt: "2026-10-06T12:00:00.000Z",
        }));
  return { entries };
}

/**
 * Answers the two public daily reads. Returns the live list of requested path+query
 * strings so a test can assert exactly what the page asked for.
 */
async function mockBoards(
  page: Page,
  variant: Variant,
  options: MockOptions = {},
): Promise<string[]> {
  const requested: string[] = [];
  await page.route(
    (url) =>
      url.pathname === "/api/arcade/scores" || url.pathname === "/api/password-game-2/leaderboard",
    async (route) => {
      const url = new URL(route.request().url());
      requested.push(`${url.pathname}${url.search}`);
      if (options.hold) await options.hold;
      if (variant === "error") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "mocked failure" }),
        });
        return;
      }
      const longNames = options.longNames === true;
      const body =
        url.pathname === "/api/arcade/scores"
          ? arcadeBody(url.searchParams.get("game") ?? "", variant, longNames)
          : pg2Body(variant, longNames);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  return requested;
}

/** Console errors and uncaught exceptions. Blocked or mocked-500 requests log a resource line; that is not a page error. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** Scrolls the Today strip into view (which starts its reads) and waits for all six tiles to settle. */
async function settle(page: Page) {
  const today = page.getByTestId("hub-today");
  await today.scrollIntoViewIfNeeded();
  await expect(today).toHaveAttribute("data-state", "settled");
}

function tile(page: Page, slug: string) {
  return page.locator(`[data-testid="today-tile"][data-slug="${slug}"]`);
}

function chip(page: Page, slug: string) {
  return page.locator(`[data-testid="stat-chip"][data-slug="${slug}"]`);
}

test.beforeEach(async ({ context, baseURL }) => {
  await blockThirdParties(context, baseURL);
});

test.describe("structure", () => {
  test("has one h1 and an unbroken heading outline", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await expect(page.locator("h1")).toHaveCount(1);
    const outline = await page
      .getByTestId("games-hub")
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((nodes) => nodes.map((node) => [node.tagName, node.textContent?.trim() ?? ""]));
    expect(outline).toEqual([
      ["H1", "Games"],
      ["H2", FEATURED.title],
      ["H2", "Today"],
      ...TODAY_SOURCES.map((source) => ["H3", GAMES_BY_SLUG[source.slug].title]),
      ["H2", "On this device"],
      ["H2", "More games"],
      ...REST.map((game) => ["H3", game.title]),
    ]);
    let previous = 0;
    for (const [tag] of outline) {
      const level = Number(tag?.slice(1));
      expect(level, `heading ${tag} follows level ${previous}`).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });

  test("links to exactly the public games, the featured one first", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    const anchors = await page
      .locator("a[data-game-card]")
      .evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute("data-game-card"), node.getAttribute("href")]),
      );
    expect(anchors).toEqual([FEATURED, ...REST].map((game) => [game.slug, `/games/${game.slug}`]));
  });

  test("leads with the featured card, then Today, On this device and More games", async ({
    page,
  }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    const tops = await page.evaluate(() => {
      const top = (selector: string) =>
        (document.querySelector(selector)?.getBoundingClientRect().top ?? -1) + window.scrollY;
      return [
        top("a[data-game-card]"),
        top('[data-testid="hub-today"]'),
        top('[data-testid="hub-device"]'),
        top("#hub-more-heading"),
      ];
    });
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(tops.every((value) => value >= 0)).toBe(true);
    await expect(page.locator("a[data-game-card]").first()).toContainText("Play now");
  });
});

test.describe("console", () => {
  test.use({ storageState: seeded(SEEDED) });

  for (const variant of ["populated", "empty", "error"] as const) {
    test(`logs no console errors when the boards are ${variant}`, async ({ page }) => {
      const errors = watchConsole(page);
      await mockBoards(page, variant);
      await page.goto("/games");
      await settle(page);
      await expect(page.getByTestId("hub-device")).toHaveAttribute("data-state", "populated");
      expect(errors).toEqual([]);
    });
  }
});

test.describe("Today strip", () => {
  test("shows the top three of each daily board", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await settle(page);
    await expect(page.getByTestId("today-tile")).toHaveCount(6);
    await expect(tile(page, "password-game")).toHaveAttribute("data-state", "ready");
    await expect(tile(page, "password-game")).toContainText("Daily run");
    await expect(tile(page, "password-game")).toContainText("Ada");
    await expect(tile(page, "password-game")).toContainText("1:23.4");
    await expect(tile(page, "password-game")).toContainText(
      "Fastest daily runs posted today (UTC)",
    );
    await expect(tile(page, "space-shooter")).toContainText("Nova");
    await expect(tile(page, "space-shooter")).toContainText("48,210");
    await expect(tile(page, "hextris")).toContainText("Kite");
    await expect(tile(page, "hextris")).toContainText("9,100");
    await expect(tile(page, "super-voltorb-flip")).toContainText("Pika");
    await expect(tile(page, "super-voltorb-flip")).toContainText("384");
    await expect(page.getByTestId("hub-today-reset")).toContainText("(00:00 UTC)");
  });

  test("says so when nobody has played yet today", async ({ page }) => {
    await mockBoards(page, "empty");
    await page.goto("/games");
    await settle(page);
    for (const source of TODAY_SOURCES) {
      await expect(tile(page, source.slug)).toHaveAttribute("data-state", "empty");
      await expect(tile(page, source.slug)).toContainText("No runs yet today. Be the first.");
    }
  });

  test("says the board is unavailable when a read fails", async ({ page }) => {
    await mockBoards(page, "error");
    await page.goto("/games");
    await settle(page);
    for (const source of TODAY_SOURCES) {
      await expect(tile(page, source.slug)).toHaveAttribute("data-state", "error");
      await expect(tile(page, source.slug)).toContainText("Board unavailable right now");
    }
  });

  test.describe("with a stored player id", () => {
    test.use({
      storageState: seeded({ ...SEEDED, "arcade:player:v1": '{"id":"should-never-be-sent"}' }),
    });

    test("asks for exactly six public reads and never passes a player id", async ({ page }) => {
      const requested = await mockBoards(page, "populated");
      await page.goto("/games");
      await settle(page);
      expect([...requested].sort()).toEqual(
        [
          "/api/arcade/scores?game=hextris&board=daily",
          "/api/arcade/scores?game=space-shooter&board=daily",
          "/api/arcade/scores?game=super-voltorb-flip&board=daily",
          "/api/arcade/scores?game=tower-stacker&board=daily",
          "/api/arcade/scores?game=typing-speed&board=daily",
          "/api/password-game-2/leaderboard?daily=1",
        ].sort(),
      );
      expect(requested.some((entry) => entry.includes("player"))).toBe(false);
    });
  });

  test.describe("below the fold", () => {
    test.use({ viewport: { width: 1280, height: 400 } });

    test("waits until the strip is near the viewport before reading", async ({ page }) => {
      const requested = await mockBoards(page, "populated");
      await page.goto("/games");
      // Hydrated once the device island has left its server placeholder.
      await expect(page.getByTestId("hub-device")).not.toHaveAttribute("data-state", "pending");
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const top = await page
        .getByTestId("hub-today")
        .evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
      expect(top, "the strip must start below the 200px preload margin").toBeGreaterThan(650);
      expect(requested).toEqual([]);
      await settle(page);
      expect(requested).toHaveLength(6);
    });
  });
});

test.describe("On this device", () => {
  test.describe("with seeded bests", () => {
    test.use({ storageState: seeded(SEEDED) });

    test("shows the bests this browser holds, labelled honestly", async ({ page }) => {
      await mockBoards(page, "populated");
      await page.goto("/games");
      const device = page.getByTestId("hub-device");
      await expect(device).toHaveAttribute("data-state", "populated");
      await expect(page.getByTestId("hub-device-caption")).toHaveText(PRIVACY_COPY);
      await expect(chip(page, "space-shooter")).toContainText("Best on this device");
      await expect(chip(page, "space-shooter")).toContainText("48,210");
      await expect(chip(page, "space-shooter")).toContainText(/12 runs, 1\/\d+ achievements/);
      await expect(chip(page, "hextris")).toContainText("9,100");
      await expect(chip(page, "super-voltorb-flip")).toContainText("Saved progress");
      await expect(chip(page, "super-voltorb-flip")).toContainText("Level 4");
      await expect(chip(page, "super-voltorb-flip")).toContainText("1,200 coins");
      await expect(chip(page, "super-voltorb-flip")).not.toContainText("best level");
      await expect(chip(page, "typing-speed")).toContainText("87");
      await expect(chip(page, "typing-speed")).toHaveAttribute("href", "/games/typing-speed");
    });

    test("only reads: seeded values are unchanged and no player or wallet key appears", async ({
      page,
    }) => {
      await mockBoards(page, "populated");
      await page.goto("/games");
      await settle(page);
      await expect(page.getByTestId("hub-device")).toHaveAttribute("data-state", "populated");
      const stored = await page.evaluate(
        (keys) => ({
          hub: keys.map((key) => window.localStorage.getItem(key)),
          player: window.localStorage.getItem("arcade:player:v1"),
          wallet: window.localStorage.getItem("walletCoins"),
        }),
        HUB_KEYS,
      );
      expect(stored.hub).toEqual(HUB_KEYS.map((key) => SEEDED[key] ?? null));
      expect(stored.player).toBeNull();
      expect(stored.wallet).toBeNull();
    });
  });

  test("invites a first-time visitor to play", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await expect(page.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
    await expect(page.getByTestId("hub-device-caption")).toHaveText(EMPTY_COPY);
    await expect(page.getByTestId("stat-chip")).toHaveCount(5);
  });

  test.describe("with corrupt stored values", () => {
    test.use({ storageState: seeded(CORRUPT) });

    test("treats corrupt stored values as nothing, without an error", async ({ page }) => {
      const errors = watchConsole(page);
      await mockBoards(page, "populated");
      await page.goto("/games");
      await expect(page.getByTestId("hub-device")).toHaveAttribute("data-state", "empty");
      await expect(page.getByTestId("hub-device-caption")).toHaveText(EMPTY_COPY);
      expect(errors).toEqual([]);
    });
  });

  test("a fresh visit leaves all five keys unset", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await settle(page);
    const stored = await page.evaluate(
      (keys) => keys.map((key) => window.localStorage.getItem(key)),
      HUB_KEYS,
    );
    expect(stored).toEqual(HUB_KEYS.map(() => null));
  });
});

interface Heights {
  today: number;
  device: number;
}

interface Scenario {
  /** false renders the server HTML only: the height every state must match. */
  js: boolean;
  variant?: Variant;
  seed?: Record<string, string>;
  /** Hold the reads so the tiles stay in their loading state while measured. */
  held?: boolean;
  longNames?: boolean;
}

async function heightOf(page: Page, testId: string): Promise<number> {
  return page.getByTestId(testId).evaluate((node) => node.getBoundingClientRect().height);
}

/** Loads /games in a fresh context under one scenario and measures the two island sections. */
async function measureHub(
  browser: Browser,
  baseURL: string | undefined,
  viewport: { width: number; height: number },
  scenario: Scenario,
): Promise<Heights> {
  const context = await browser.newContext({
    baseURL,
    viewport,
    javaScriptEnabled: scenario.js,
    ...(scenario.seed ? { storageState: seededState(baseURL, scenario.seed) } : {}),
  });
  let release: () => void = () => undefined;
  try {
    await blockThirdParties(context, baseURL);
    const page = await context.newPage();
    if (scenario.js) {
      const hold = scenario.held
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : undefined;
      await mockBoards(page, scenario.variant ?? "populated", {
        hold,
        longNames: scenario.longNames,
      });
    }
    await page.goto("/games");
    if (scenario.js) {
      await expect(page.getByTestId("hub-device")).not.toHaveAttribute("data-state", "pending");
      if (scenario.held) {
        await expect(page.getByTestId("hub-today")).toHaveAttribute("data-state", "loading");
      } else {
        await settle(page);
      }
    }
    await page.evaluate(() => document.fonts.ready);
    return {
      today: await heightOf(page, "hub-today"),
      device: await heightOf(page, "hub-device"),
    };
  } finally {
    release();
    await context.close();
  }
}

test.describe("layout stability", () => {
  const viewports = [
    { name: "phone", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const { name, width, height } of viewports) {
    test(`every state is the height of the server render at ${name} width`, async ({
      browser,
      baseURL,
    }) => {
      test.slow();
      const viewport = { width, height };
      const baseline = await measureHub(browser, baseURL, viewport, { js: false });
      expect(baseline.today).toBeGreaterThan(100);
      expect(baseline.device).toBeGreaterThan(100);
      const scenarios: Record<string, Scenario> = {
        "populated and seeded": { js: true, variant: "populated", seed: SEEDED },
        "reads in flight": { js: true, held: true },
        "empty boards": { js: true, variant: "empty" },
        "failed boards": { js: true, variant: "error" },
        "long names": { js: true, variant: "populated", seed: SEEDED, longNames: true },
      };
      for (const [label, scenario] of Object.entries(scenarios)) {
        const heights = await measureHub(browser, baseURL, viewport, scenario);
        expect
          .soft(Math.abs(heights.today - baseline.today), `Today, ${label}`)
          .toBeLessThanOrEqual(2);
        expect
          .soft(Math.abs(heights.device - baseline.device), `On this device, ${label}`)
          .toBeLessThanOrEqual(2);
      }
    });
  }
});

async function leftEdges(page: Page, selector: string): Promise<number[]> {
  return page
    .locator(selector)
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.describe("with seeded bests and the longest names", () => {
    test.use({ storageState: seeded(SEEDED) });

    test("never scrolls sideways", async ({ page }) => {
      await mockBoards(page, "populated", { longNames: true });
      await page.goto("/games");
      await settle(page);
      await expect(page.getByTestId("hub-device")).toHaveAttribute("data-state", "populated");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const clipped = await page
        .locator('[data-testid="today-tile"], [data-testid="stat-chip"]')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent),
        );
      expect(clipped).toEqual([]);
    });
  });

  test("stacks the tiles in one column and the chips in two", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await settle(page);
    expect(new Set(await leftEdges(page, '[data-testid="today-tile"]')).size).toBe(1);
    expect(new Set(await leftEdges(page, '[data-testid="stat-chip"]')).size).toBe(2);
  });

  test("keeps every hub link at least 44px tall", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await settle(page);
    const heights = await page
      .locator('[data-testid="today-tile"] a, [data-testid="stat-chip"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(heights).toHaveLength(TODAY_SOURCES.length + 5);
    for (const value of heights) expect(value).toBeGreaterThanOrEqual(44);
  });
});

test.describe("at desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lays the tiles out in three columns and the chips in five", async ({ page }) => {
    await mockBoards(page, "populated");
    await page.goto("/games");
    await settle(page);
    expect(new Set(await leftEdges(page, '[data-testid="today-tile"]')).size).toBe(3);
    expect(new Set(await leftEdges(page, '[data-testid="stat-chip"]')).size).toBe(5);
  });
});
