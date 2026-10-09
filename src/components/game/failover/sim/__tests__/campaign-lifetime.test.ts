// @vitest-environment node
// A campaign level's controller belongs to that level (Server Survival's lifetime
// bugs, ported).
//
// Upstream, `window.campaign.active` was set by loadLevel() and cleared in one place
// only, so most ways out of a level (Escape to the menu and then New Game or Sandbox)
// left the controller running and grading. The cosmetic half was the old level's
// objectives repainting the HUD. The real half: resetGame handed the new run
// reputation 100 while the campaign's completion counters still held what was banked
// during the old attempt, and those two together are the win gate, so a level abandoned
// in failure was scored a WIN on an empty sandbox board.
//
// Here a level is a CampaignRun the test drives, and the only way out of it is
// resetSim. The controller owns the world it started and nothing else: once the sim is
// anything but that exact run at the tick the run left it, a frame does nothing at all
// (no grading, no scripted spawns, no step). Upstream cases about the save/load
// persistence layer, the debrief modal and the objectives panel are dropped: the sim has
// no storage and no DOM.

import { afterEach, describe, expect, it } from "vitest";
import { resetSim, S } from "../state";
import { placeAt, wire } from "./campaign-play";
import { campaignFrame, isCurrent, startCampaignLevel } from "./fixtures/campaign";

afterEach(() => resetSim({ seed: "after-campaign-lifetime" }));

/** Level 1's briefed chain: Internet -> WAF -> ALB -> Compute -> DB. */
function levelOneChain(): void {
  const waf = placeAt("waf", -20, 0);
  const alb = placeAt("alb", -10, 0);
  const compute = placeAt("compute", 0, 0);
  const db = placeAt("db", 10, 0);
  wire("internet", waf);
  wire(waf, alb);
  wire(alb, compute);
  wire(compute, db);
}

describe("positive control: the controller does grade the world it started", () => {
  it("level 1's chain wins, so the cases below are not passing on a dead controller", () => {
    const run = startCampaignLevel(1, "lifetime-control");
    levelOneChain();
    for (let i = 0; i < 2000 && campaignFrame(run); i++) {
      // Drive to the end.
    }
    expect(run.ended).toBe(true);
    expect(run.outcome).toBe("win");
  });
});

describe("a campaign level does not keep grading after you leave it", () => {
  it("THE FREE WIN: an abandoned level cannot be won off an empty sandbox board", () => {
    const run = startCampaignLevel(1, "lifetime-free-win");
    levelOneChain();
    // Play a good while, then sink the standing on purpose so the level is neither won
    // nor lost yet: plenty served, reputation under the win bar.
    for (let i = 0; i < 300; i++) {
      S.reputation = Math.min(S.reputation, 60);
      campaignFrame(run);
    }
    expect(S.requestsProcessed, "the level must have served real traffic").toBeGreaterThan(10);
    expect(run.ended, "the level must not be over yet").toBe(false);

    // Escape, then "Sandbox Mode".
    resetSim({ seed: "lifetime-sandbox", mode: "sandbox" });
    expect(isCurrent(run), "the run no longer owns this world").toBe(false);

    // A whole second of sandbox on a board with nothing on it.
    for (let i = 0; i < 20; i++) expect(campaignFrame(run)).toBe(false);
    expect(S.gameMode).toBe("sandbox");
    expect(S.services).toHaveLength(0);
    expect(S.tick, "a stale controller stepped someone else's sim").toBe(0);
    expect(run.outcome, "a sandbox board cannot win a campaign level").not.toBe("win");
    expect(run.ended, "and no level may END during a sandbox run").toBe(false);
  });

  it("THE MIRROR: an abandoned level's timeout cannot end a later run in a loss", () => {
    const run = startCampaignLevel(2, "lifetime-mirror");
    campaignFrame(run);
    resetSim({ seed: "lifetime-survival", mode: "survival" });
    // Play past whatever deadline the abandoned level was counting to.
    S.elapsedGameTime = 100000;
    for (let i = 0; i < 20; i++) campaignFrame(run);
    expect(run.outcome).not.toBe("lose");
    expect(run.ended, "a survival run was ended by a level nobody was playing").toBe(false);
    expect(S.tick, "a stale controller stepped someone else's sim").toBe(0);
    expect(S.elapsedGameTime, "and rewrote its clock").toBe(100000);
  });

  it("the scripted traffic of a level stops when the level does", () => {
    // Level 5 fires a 15-request burst every 5 s, staggered over 280 ms.
    const run = startCampaignLevel(5, "lifetime-burst");
    let guard = 0;
    while (run.pendingSpawnsMs.length === 0 && guard++ < 400) campaignFrame(run);
    expect(
      run.pendingSpawnsMs.length,
      "a burst must be in flight when the level is left",
    ).toBeGreaterThan(0);

    resetSim({ seed: "lifetime-after-burst", mode: "survival" });
    S.currentRPS = 0;
    for (let i = 0; i < 200; i++) campaignFrame(run);
    expect(S.requests, "a level's bursts fired into another run").toHaveLength(0);
    expect(S.tick).toBe(0);
  });

  it("another driver stepping the same world makes the run stale too", () => {
    const run = startCampaignLevel(1, "lifetime-shared");
    expect(campaignFrame(run)).toBe(true);
    S.tick += 1; // someone else advanced the sim
    expect(isCurrent(run)).toBe(false);
    expect(campaignFrame(run)).toBe(false);
  });
});

describe("starting a level arms it", () => {
  it("a fresh level is current, live and carries its own settings", () => {
    const run = startCampaignLevel(3, "lifetime-arm");
    expect(isCurrent(run)).toBe(true);
    expect(run.level.id).toBe(3);
    expect(run.ended).toBe(false);
    expect(S.money).toBe(run.level.budget);
    expect(S.currentRPS).toBe(run.level.rps);
    expect(S.upkeepEnabled).toBe(true);
    expect(S.scriptedEvents, "level 3 does not opt in to survival's events").toBe(false);
    expect(S.services).toHaveLength(run.level.preBuilt.services.length);
  });

  it("only the levels that opt in switch on survival's spike, shift and event timers", () => {
    expect(startCampaignLevel(14, "lifetime-events-14").level.enableSurvivalShifts).toBe(true);
    expect(S.scriptedEvents).toBe(true);
    startCampaignLevel(25, "lifetime-events-25");
    expect(S.scriptedEvents).toBe(true);
    startCampaignLevel(13, "lifetime-events-13");
    expect(S.scriptedEvents).toBe(false);
  });
});
