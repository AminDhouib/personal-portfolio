// @vitest-environment node
import { describe, it, expect } from "vitest";
import { AFK_AFTER_MS } from "@/components/game/hextris/engine/scoring";
import { COUNTDOWN_MS, COUNTDOWN_STEP_MS } from "@/components/game/hextris/engine/state";
import { RESTART_LOCKOUT_MS } from "@/components/game/hextris/game-over";
import { GAME_CONTENT } from "..";

// The About copy states two rules the engine enforces (spec sections 3.7 and 6.9) and the shell's
// restart lockout. These pin the copy to the code's numbers, so a retune cannot leave the page
// describing the old game.
describe("Hextris copy", () => {
  const content = GAME_CONTENT.hextris;

  it("describes the 3, 2, 1 countdown before play, during which rotation works", () => {
    expect(COUNTDOWN_MS / COUNTDOWN_STEP_MS).toBe(3);
    const start = content.howToPlay.join(" ");
    expect(start).toMatch(/3, 2, 1 countdown/);
    expect(start).toMatch(/rotate during it/);
  });

  it("states the idle rule with the engine's away time", () => {
    const seconds = AFK_AFTER_MS / 1000;
    const strategy = content.strategy.join(" ");
    expect(strategy).toContain(`${seconds} seconds without one`);
    expect(strategy).toMatch(/scores nothing until you move again/);
  });

  it("states the restart rule with the shell's lockout, and the share", () => {
    const play = content.howToPlay.join(" ");
    expect(play).toMatch(/Space, Enter, R or a tap on the board plays again/);
    expect(play).toContain(`${RESTART_LOCKOUT_MS / 1000} seconds`);
    expect(play).toMatch(/Share sends your score with a link/);
  });
});
