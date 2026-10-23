"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "./audio";
import { payoutPlan, tallyStride } from "./play-rules";
import type { VoltorbFlip } from "./engine";

/**
 * The scoreboard's rolling numbers and the level card: the "Total Coins" and "This Game"
 * readouts that tick up as coins are collected and drain into the total after a round, the
 * level held at its old value until the flip-down, and the level flash. Returns the displayed
 * values plus the two callbacks the board calls at the end of a round.
 */
export function usePayoutDisplay({
  game,
  muted,
  later,
  sleep,
}: {
  game: VoltorbFlip;
  muted: boolean;
  later: (fn: () => void, ms: number) => number;
  sleep: (ms: number) => Promise<void>;
}) {
  // Smoothly-rolled scoreboard values. Default to the live game values; the
  // payout animation overrides them while a round wraps up. Reading game
  // state via optional chaining since Gameboard mounts before the first
  // restart settles.
  const [displayTotal, setDisplayTotal] = useState(0);
  const [displayCurrent, setDisplayCurrent] = useState(0);
  // Level-card flash. "up" flashes green, "down" flashes red, both clear
  // automatically once the SE finishes.
  const [levelDir, setLevelDir] = useState<"up" | "down" | null>(null);
  const payoutAnimRef = useRef(false);
  const tallyTimerRef = useRef<number | null>(null);
  const tallyStepRef = useRef<number>(0);
  const prevCurrentScoreRef = useRef<number>(0);
  const skipPayoutRef = useRef(false);
  // Held back from game.currentLevel during win/lose so the visible Lv
  // value stays put while the fanfare + drain run; the new level is set
  // here in the same beat as the flash + SE inside flipCardsDown.
  const [displayLevel, setDisplayLevel] = useState<number>(() => 1);

  // Roll displayed scores toward the live game values. When currentScore
  // climbs (player flipped a 2x/3x tile), tick up one coin per frame at
  // ~60Hz (matches NDS frame rate; voltorb_flip.c runs the counter from
  // its main loop) and play the OKOZUKAI counter SE every 4 frames —
  // the cadence used by the original "Coins received" banner, surfaced
  // here so each multiplier reveal feels rewarding. Drops (restart,
  // voltorb-zero) snap. Once a round ends (gameStatus leaves "playing"
  // / "memo") we stop ticking so the rollup doesn't overlap the fanfare
  // or drain SE — runPostFanfare owns both displays from there.
  useEffect(() => {
    if (!game) return;
    if (payoutAnimRef.current) return;

    const status = game.gameStatus;
    if (status !== "playing" && status !== "memo") {
      if (tallyTimerRef.current) {
        window.clearTimeout(tallyTimerRef.current);
        tallyTimerRef.current = null;
      }
      return;
    }

    const targetCurrent = game.currentScore;
    const targetTotal = game.totalScore;

    const scheduled: number[] = [];
    const schedule = (fn: () => void) => {
      scheduled.push(window.setTimeout(fn, 0));
    };

    if (displayTotal !== targetTotal) {
      schedule(() => setDisplayTotal(targetTotal));
    }

    if (displayCurrent >= targetCurrent) {
      tallyStepRef.current = 0;
      if (displayCurrent !== targetCurrent) {
        schedule(() => setDisplayCurrent(targetCurrent));
      }
      return () => scheduled.forEach((id) => window.clearTimeout(id));
    }

    // Stride scales with the rollup target (matches the drain formula),
    // so a 1→500 climb takes ~100 ticks instead of dragging out the
    // last 100 coins one at a time as a gap-based stride would.
    const stride = tallyStride(targetCurrent);
    tallyTimerRef.current = window.setTimeout(() => {
      tallyTimerRef.current = null;
      setDisplayCurrent((prev) => Math.min(prev + stride, targetCurrent));
      const step = tallyStepRef.current;
      if (!muted && step % 4 === 0) void sfx.payoutTickEarn();
      tallyStepRef.current = step + 1;
    }, 17);

    return () => {
      scheduled.forEach((id) => window.clearTimeout(id));
      if (tallyTimerRef.current) {
        window.clearTimeout(tallyTimerRef.current);
        tallyTimerRef.current = null;
      }
    };
  }, [
    game,
    game?.currentScore,
    game?.totalScore,
    game?.gameStatus,
    displayCurrent,
    displayTotal,
    muted,
  ]);

  // Release the post-payout freeze when restartGame zeroes currentScore.
  // We hold payoutAnimRef.current=true through flipCardsDown / level-flash
  // so the rollup effect doesn't try to re-tick from 0 → earned while the
  // old round's currentScore is still non-zero.
  useEffect(() => {
    if (!game) return;
    const prev = prevCurrentScoreRef.current;
    if (prev > 0 && game.currentScore === 0 && payoutAnimRef.current) {
      payoutAnimRef.current = false;
    }
    prevCurrentScoreRef.current = game.currentScore;
  }, [game, game?.currentScore]);

  // Hold the visible Lv value at its old number while a round is wrapping
  // up (win/lose). The game already advances currentLevel as soon as the
  // round ends, but the player shouldn't *see* it change until the
  // flip-down animation runs — that's when the flash + SLOT01/03 SE fire.
  // While playing/memo, displayLevel mirrors game.currentLevel.
  useEffect(() => {
    if (!game) return;
    const status = game.gameStatus;
    let syncLevelTimer: number | null = null;

    if (status === "playing" || status === "memo") {
      if (displayLevel !== game.currentLevel) {
        syncLevelTimer = window.setTimeout(() => setDisplayLevel(game.currentLevel), 0);
      }
    }

    return () => {
      if (syncLevelTimer) window.clearTimeout(syncLevelTimer);
    };
  }, [game, game?.currentLevel, game?.gameStatus, displayLevel]);

  const triggerLevelTransition = useCallback(
    (dir: "up" | "down") => {
      if (!game) return;
      const newLevel = game.currentLevel;
      const oldLevel = displayLevel;
      // Skip when the level didn't actually move — e.g. lose at Lv 1
      // floors at 1, win at Lv 8 caps at 8. No flash, no SE.
      if (newLevel === oldLevel) return;
      setDisplayLevel(newLevel);
      setLevelDir(dir);
      if (!muted) {
        if (dir === "up") void sfx.levelUp();
        else void sfx.levelDown();
      }
      later(() => setLevelDir(null), 1200);
    },
    [game, muted, displayLevel, later],
  );

  // Click anywhere during the post-round drain to skip the counter.
  // Pointerdown so it covers both mouse and touch. Gated on payoutAnimRef
  // so tile clicks during normal play are unaffected.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (payoutAnimRef.current) skipPayoutRef.current = true;
    };
    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  // Promise-returning post-fanfare runner: drains the round's "This Game"
  // pot into "Total Coins". Phase 1 (the OKOZUKAI tally-up) is now driven
  // by the per-flip rollup effect above so the player hears each coin as
  // they collect it; here we only run Phase 2 — COIN_PAYOUT_ONE per 4
  // ticks, COIN_PAYOUT_LAST closes the chain. Matches voltorb_flip.c
  // AwardCoins_Main step 2; the BGM scene swap is a JP-only Game-Corner
  // detail and the NA build lets gameplay BGM ride through.
  const runPostFanfare = useCallback(async () => {
    if (!game) return;
    const finalTotal = game.totalScore;
    const finalCurrent = game.currentScore;
    const startTotal = Math.max(0, finalTotal - finalCurrent);
    const earned = finalCurrent;
    if (earned <= 0) return;

    skipPayoutRef.current = false;
    payoutAnimRef.current = true;
    // Cancel any in-flight per-flip tally-up — earned has already been
    // heard during play; we own the displays from here.
    if (tallyTimerRef.current) {
      window.clearTimeout(tallyTimerRef.current);
      tallyTimerRef.current = null;
    }
    // Snap to the round-end read in case the rollup didn't finish before
    // the level-clear fanfare ended (covers wins on a final huge multiplier).
    setDisplayCurrent(earned);
    setDisplayTotal(startTotal);
    // Beat of pause so the player can read the earned amount before drain.
    // Pollable in 60ms slices so skipping during the pause works too.
    {
      const pauseEnd = Date.now() + 320;
      while (Date.now() < pauseEnd && !skipPayoutRef.current) {
        await sleep(60);
      }
    }

    // 17ms/step ≈ NDS 60Hz frame rate; SE every 4 steps matches
    // COIN_PAYOUT_ONE cadence in voltorb_flip.c:1381. payoutPlan caps
    // the loop at 100 iterations so a 10k-coin haul doesn't take 170s —
    // instead each iteration drains ceil(earned / 100) coins. That keeps total
    // drain time bounded at ~1.7s regardless of how big "earned" is,
    // while small earnings still tick one coin per step like HG/SS.
    const tickMs = 17;
    const { coinsPerTick, iterations } = payoutPlan(earned);
    const tick = () => sleep(tickMs);

    let didSkip = false;
    let drained = 0;
    for (let j = 0; j < iterations; j++) {
      if (skipPayoutRef.current) {
        didSkip = true;
        break;
      }
      drained = Math.min(earned, drained + coinsPerTick);
      setDisplayCurrent(earned - drained);
      setDisplayTotal(startTotal + drained);
      if (j % 4 === 0 && !muted) void sfx.payoutTickBank();
      await tick();
    }
    // Snap to final wallet state — covers both natural completion and skip.
    setDisplayCurrent(0);
    setDisplayTotal(startTotal + earned);
    // COIN_PAYOUT_LAST always closes the chain, including on skip — the
    // closing chime is the audible "money's in the bank" cue and should
    // fire whether the player let it run or tapped through.
    if (!muted) void sfx.payoutFinal();
    // Breathing room so payoutFinal doesn't bleed into the level-up SE.
    // Shorter on skip so it still feels snappy.
    await sleep(didSkip ? 160 : 280);
    skipPayoutRef.current = false;

    // Hold payoutAnimRef.current=true through onFlipDownStart / flipCardsDown.
    // The release effect above flips it back to false the instant
    // restartGame zeroes currentScore, so the rollup effect doesn't try
    // to re-tick 0 → earned while the round's old score lingers.
  }, [game, muted, sleep]);

  return {
    displayTotal,
    displayCurrent,
    displayLevel,
    levelDir,
    runPostFanfare,
    triggerLevelTransition,
  };
}
