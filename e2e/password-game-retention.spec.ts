import { expect, test } from "@playwright/test";
import { blockThirdParties } from "./helpers";

// Password Game 2's retention surface against the production build: the start screen reads
// the device's stored bests and daily streak (pg2:stats). Storage is seeded through
// Playwright's storageState (applied before any page script runs, no setItem call in our
// code). No run is started and nothing is posted: the leaderboard is never touched.

const GAME_PATH = "/games/password-game";
const DAY_MS = 86_400_000;

const dayOffset = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

const statsJson = (lastDailyDay: string) =>
  JSON.stringify({
    v: 1,
    runs: 4,
    bestMs: 731000,
    dailyBestMs: 731000,
    streak: 3,
    bestStreak: 3,
    lastDailyDay,
    history: [],
  });

type SeededState = {
  cookies: [];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

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

function seeded(data: Record<string, string>) {
  return async (
    { baseURL }: { baseURL: string | undefined },
    apply: (state: SeededState) => Promise<void>,
  ) => apply(seededState(baseURL, data));
}

test.describe("a live streak", () => {
  test.use({ storageState: seeded({ "pg2:stats": statsJson(dayOffset(0)) }) });

  test("the start screen shows the stored best and the streak", async ({
    page,
    context,
    baseURL,
  }) => {
    await blockThirdParties(context, baseURL);
    await page.goto(GAME_PATH);
    const panel = page.getByTestId("pg2-stats");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("12:11").first()).toBeVisible();
    await expect(page.getByText("Daily streak: 3")).toBeVisible();
  });
});

test.describe("a missed day", () => {
  test.use({ storageState: seeded({ "pg2:stats": statsJson(dayOffset(5)) }) });

  test("the streak chip is gone and the panel shows no live streak", async ({
    page,
    context,
    baseURL,
  }) => {
    await blockThirdParties(context, baseURL);
    await page.goto(GAME_PATH);
    const panel = page.getByTestId("pg2-stats");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("12:11").first()).toBeVisible();
    await expect(page.getByText(/Daily streak:/)).toHaveCount(0);
    await expect(panel.getByText("0-day streak")).toBeVisible();
  });
});
