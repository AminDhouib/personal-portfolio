import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import ts from "typescript";
import { dailyReplayOptions } from "../src/components/game/failover/daily/daily";
import { replay, type ReplayResult } from "../src/components/game/failover/sim/replay";
import { BOARD_S, MID_RUN_S, play } from "../src/components/game/failover/sim/__tests__/scripted";
import { blockThirdParties } from "./helpers";

// The cross-engine golden. The daily is only fair if the server's Node replay and the player's
// browser play a run identically, so this plays the pinned golden run, and a daily, in this
// suite's Chromium and in Node, and demands the same state hash and score from both. The sim is
// plain TypeScript with no DOM, so the page gets it as transpiled modules served from the source
// tree (no bundle, no app route, nothing reaches the app). CI only: Firefox and Safari are
// checked by hand (the plan's open question 4).

const SIM_ROOT = path.join(process.cwd(), "src", "components", "game");
const SERVED = "/__failover-src/";
const BLANK = "/__failover-blank";

// The golden run, as recorded in sim/__tests__/golden.test.ts. If the sim is changed on purpose
// and that test is re-recorded, record these two numbers again with it.
const GOLDEN_SEED = "failover-golden";
const GOLDEN_TICKS = 6000;
const GOLDEN_HASH = 464767114;
const GOLDEN_SCORE = 26175;

const DAY = "2026-10-15";

type Summary = Pick<ReplayResult, "hash" | "score" | "endedAtTick" | "endReason">;

function summary(result: ReplayResult): Summary {
  const { hash, score, endedAtTick, endReason } = result;
  return { hash, score, endedAtTick, endReason };
}

/**
 * A module's source for the browser: TypeScript out, and every relative import given its .js (or
 * /index.js when it names a folder, as the sim's handlers do).
 */
function transpile(source: string, dir: string): string {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return outputText.replace(
    /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.{1,2}\/[^"']+)\2/g,
    (_match, lead: string, quote: string, spec: string) => {
      const isFolder = ts.sys.directoryExists(path.join(dir, spec));
      return `${lead}${quote}${spec}${isFolder ? "/index" : ""}.js${quote}`;
    },
  );
}

async function openSimPage(page: Page) {
  await page
    .context()
    .route(`**${BLANK}`, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>golden</title>" }),
    );
  await page.context().route(`**${SERVED}**`, (route) => {
    const served = new URL(route.request().url()).pathname.slice(SERVED.length);
    const file = path.join(SIM_ROOT, served.replace(/\.js$/, ".ts"));
    if (!file.startsWith(SIM_ROOT)) return route.fulfill({ status: 403 });
    const source = ts.sys.readFile(file);
    // A module the sim does not have is a 404 in the page, which fails the test below.
    if (source === undefined) return route.fulfill({ status: 404 });
    return route.fulfill({
      contentType: "text/javascript",
      body: transpile(source, path.dirname(file)),
    });
  });
  await page.goto(BLANK);
  await page.addScriptTag({
    type: "module",
    content: `
      import { replay } from "${SERVED}failover/sim/replay.js";
      import { dailyReplayOptions } from "${SERVED}failover/daily/daily.js";
      window.__failover = { replay, dailyReplayOptions };
    `,
  });
  await page.waitForFunction(() => "__failover" in window, undefined, { timeout: 20_000 });
}

test.describe("Failover cross-engine golden", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await blockThirdParties(context, baseURL);
  });

  test("the golden run replays to the pinned hash and score in Chromium and in Node", async ({
    page,
  }) => {
    const script = [...BOARD_S, ...MID_RUN_S];
    const log = play(GOLDEN_SEED, "survival", script, GOLDEN_TICKS).log;

    const inNode = summary(
      replay({ seed: GOLDEN_SEED, mode: "survival", log, ticks: GOLDEN_TICKS }),
    );
    expect({ hash: inNode.hash, score: inNode.score }).toEqual({
      hash: GOLDEN_HASH,
      score: GOLDEN_SCORE,
    });

    await openSimPage(page);
    const inBrowser = await page.evaluate(
      (args) => {
        const { replay: run } = window.__failover;
        const { hash, score, endedAtTick, endReason } = run(args);
        return { hash, score, endedAtTick, endReason };
      },
      { seed: GOLDEN_SEED, mode: "survival" as const, log, ticks: GOLDEN_TICKS },
    );
    expect(inBrowser).toEqual(inNode);
  });

  test("a daily, with its incident, replays to the same hash and score in Chromium and in Node", async ({
    page,
  }) => {
    const script = [...BOARD_S, ...MID_RUN_S];
    const log = play("failover-daily-actions", "survival", script, GOLDEN_TICKS).log;

    const inNode = summary(replay({ ...dailyReplayOptions(DAY), log, ticks: GOLDEN_TICKS }));

    await openSimPage(page);
    const inBrowser = await page.evaluate(
      ({ day, actions, ticks }) => {
        const { replay: run, dailyReplayOptions: options } = window.__failover;
        const { hash, score, endedAtTick, endReason } = run({
          ...options(day),
          log: actions,
          ticks,
        });
        return { hash, score, endedAtTick, endReason };
      },
      { day: DAY, actions: log, ticks: GOLDEN_TICKS },
    );
    expect(inBrowser).toEqual(inNode);
    expect(inBrowser.endedAtTick).toBeGreaterThan(0);
  });
});

declare global {
  interface Window {
    /** The two functions the module script above hangs on the page. */
    __failover: {
      replay: (options: {
        seed: string;
        mode: "survival" | "sandbox";
        log: ReadonlyArray<readonly number[]>;
        ticks: number;
      }) => ReplayResult;
      dailyReplayOptions: (day: string) => {
        seed: string;
        mode: "survival" | "sandbox";
      };
    };
  }
}
