"use client";

import { useRef, useEffect, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowLeftRight,
  Hand,
  Pause,
  Play,
  X,
} from "lucide-react";
import { HextrisSounds } from "./hextris/sound-manager";
import { createRun, drainEvents } from "./hextris/engine/state";
import { AFK_AFTER_MS } from "./hextris/engine/scoring";
import { advance, applyAction } from "./hextris/engine/step";
import type { EngineAction, RunState } from "./hextris/engine/types";
import { layout, type Layout } from "./hextris/render/layout";
import { paint, type PaintEnding } from "./hextris/render/paint";
import { POPUP_MS, type ShownPopup } from "./hextris/render/juice";
import {
  feedbackFor,
  musicTempo,
  playCue,
  shakeAmplitude,
  shrinkCountdown,
  type FeedbackMemo,
  type HapticPattern,
} from "./hextris/feedback";
import { arcadeSubmission, isRecordableRun, recordHighScore, runSeed } from "./hextris/session";
import { hextrisKeyAction } from "./hextris/input";
import { shareRun } from "./hextris/share";
import {
  NO_FIT,
  RESTART_LOCKOUT_MS,
  boardFit,
  countUpValue,
  gameOverView,
} from "./hextris/game-over";
import { markPanicTipSeen, readTips } from "./hextris/tips";
import { isTextEntryTarget } from "./text-entry";
import { safeJsonParse } from "@/lib/safe-json";
import { asNumberArray, safeLocalSet } from "@/lib/safe-storage";
import { gameCrashToReport } from "@/lib/report-game-error";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import { useArcadeBoard } from "@/hooks/use-arcade-board";

// The longest real-time gap one frame feeds the engine, so a stalled tab does not jump the run.
const MAX_FRAME_MS = 100;

// How long the one-time Panic Clear tip stays up if the player does not use it.
const PANIC_TIP_MS = 6000;

/** The final score, counted up from 0 when the game-over sheet opens (COUNT_UP_MS). */
function ScoreCountUp({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      const value = countUpValue(score, now - startedAt);
      setShown(value);
      if (value < score) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);
  return <span data-testid="final-score">{shown}</span>;
}

/** A run's unpaused play time as m:ss. */
function formatRunTime(elapsedMs: number): string {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function HextrisGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const destroyedRef = useRef(false);
  const [uiState, setUiState] = useState<"menu" | "playing" | "paused" | "gameover">("menu");
  const [crashed, setCrashed] = useState(false);
  const [uiScore, setUiScore] = useState(0);
  const [uiMomentum, setUiMomentum] = useState(0);
  const [uiShrinkWarn, setUiShrinkWarn] = useState<number | null>(null);
  // The 3, 2, 1 before GO; null once play starts.
  const [uiCountdown, setUiCountdown] = useState<number | null>(null);
  const [uiHigh, setUiHigh] = useState(0);
  const [uiCombo, setUiCombo] = useState(1);
  // The finished run, for the game-over card and the arcade submission.
  const [uiRun, setUiRun] = useState({
    score: 0,
    level: 1,
    elapsedMs: 0,
    cellsCleared: 0,
    bestCombo: 1,
  });
  const [scorePulse, setScorePulse] = useState(0);
  // The game-over sheet, and whether the player has collapsed it to a strip to see the board.
  const sheetRef = useRef<HTMLElement>(null);
  const [sheetHidden, setSheetHidden] = useState(false);
  // The run beat a stored best (never on the first run ever: there was nothing to beat).
  const [uiNewBest, setUiNewBest] = useState(false);
  // A short note under Share when the score went to the clipboard (a share sheet speaks for itself).
  const [shareNote, setShareNote] = useState<"Copied" | "Could not copy" | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("hextris_sound") !== "off";
    } catch {
      // silent-ok: best-effort localStorage read; default sound-on if unavailable (e.g. private mode)
      return true;
    }
  });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Fallback "fixed inset-0" fullscreen for mobile where the native API is flaky (iOS Safari).
  const [mobileImmersive, setMobileImmersive] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  // The one-time Panic Clear tip, shown above the button the first time the meter fills.
  const [panicTip, setPanicTip] = useState(false);
  // The player has gone AFK_AFTER_MS without input, so clears score nothing (spec 6.9).
  const [uiAway, setUiAway] = useState(false);
  // Combo milestone text (e.g., "×5 COMBO!") displayed briefly on crossing thresholds
  const [milestone, setMilestone] = useState<{ id: number; text: string; color: string } | null>(
    null,
  );

  // Leaderboard state
  const [playerName, setPlayerName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("hextris_name") || "";
    } catch {
      // silent-ok: best-effort localStorage read; empty name just re-prompts the player
      return "";
    }
  });
  // Leaderboard v2. fetchOnMount:false preserves the pre-existing timing (hextris only reads
  // the board on game-over, never on mount). The legacy rows were imported into the all-time
  // board, so it survives the move.
  const {
    entries: leaderboard,
    you: leaderboardYou,
    period: boardPeriod,
    setPeriod: setBoardPeriod,
    loading: boardLoading,
    readError: boardError,
    refresh: refreshLeaderboard,
    submit,
  } = useArcadeBoard("hextris", { fetchOnMount: false });
  const [rank, setRank] = useState<number | null>(null);
  // "rejected" is a 422 (implausible run): shown as "Score not accepted", never retried.
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "submitted" | "failed" | "rejected"
  >("idle");

  // Sound manager — created once per component lifetime
  const soundsRef = useRef<HextrisSounds | null>(null);
  if (!soundsRef.current) soundsRef.current = new HextrisSounds();

  const restartRef = useRef<() => void>(() => {});
  const pauseRef = useRef<() => void>(() => {});
  const panicRef = useRef<() => void>(() => {});

  // Sync sound enabled state to the manager + persist
  useEffect(() => {
    soundsRef.current!.setEnabled(soundEnabled);
    safeLocalSet("hextris_sound", soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  // Detect device type once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(touch);
  }, []);

  // Fullscreen API wiring
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Try native fullscreen first; on mobile where it's unreliable (iOS Safari),
  // fall back to CSS "fixed inset-0" so the game still fills the viewport.
  const enterImmersive = async () => {
    if (typeof document === "undefined") return;
    const canNative = !!document.fullscreenEnabled && !!containerRef.current?.requestFullscreen;
    if (canNative) {
      try {
        await containerRef.current!.requestFullscreen();
        return;
      } catch {
        // silent-ok: best-effort native fullscreen; falls through to CSS pseudo-fullscreen below
      }
    }
    setMobileImmersive(true);
  };

  const exitImmersive = async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // silent-ok: best-effort fullscreen exit; UI state is reset regardless below
      }
    }
    setMobileImmersive(false);
  };

  const toggleFullscreen = async () => {
    if (isFullscreen || mobileImmersive) {
      await exitImmersive();
    } else {
      await enterImmersive();
    }
  };

  // Auto-enter immersive on touch devices when gameplay begins — that's when
  // every pixel matters. Exit is explicit (via the fullscreen button).
  useEffect(() => {
    if (!isTouchDevice) return;
    if (uiState === "playing" && !isFullscreen && !mobileImmersive) {
      void enterImmersive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState, isTouchDevice]);

  // Lock page scroll while the game fills the viewport.
  useEffect(() => {
    if (!mobileImmersive && !isFullscreen) return;
    const prev = document.body.style.overflow;
    const prevRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = prevRoot;
    };
  }, [mobileImmersive, isFullscreen]);

  // Nudge a resize event when pseudo-fullscreen toggles. The container's
  // bounding box changes dramatically (inline → fixed-inset-0) and the
  // ResizeObserver normally catches it, but dispatching window.resize is
  // belt-and-suspenders for any edge cases.
  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
    return () => window.clearTimeout(t);
  }, [mobileImmersive]);

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    if (hasInteracted) return;
    const onInteract = () => {
      soundsRef.current!.resume();
      setHasInteracted(true);
    };
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [hasInteracted]);

  // Drive music from uiState transitions (only after first interaction)
  useEffect(() => {
    if (!hasInteracted) return;
    const s = soundsRef.current!;
    if (uiState === "menu") s.startMenuMusic();
    else if (uiState === "playing") s.startGameplayMusic();
    else if (uiState === "paused") s.stopMusic();
    else if (uiState === "gameover") s.playGameOverMusic();
  }, [uiState, hasInteracted]);

  // Stop music on unmount to prevent leaks if user switches tabs
  useEffect(() => {
    return () => {
      soundsRef.current?.stopMusic();
    };
  }, []);

  // Dismiss the tutorial when the user first interacts (also handled by
  // auto-hide when game-state leaves menu)
  function dismissTutorial() {
    setShowTutorial(false);
  }

  // Show tutorial DURING the first few seconds of gameplay (the first block
  // is mostly cosmetic anyway — perfect teaching moment). Hide on menu / pause /
  // gameover. Auto-fades after ~6s; user can also tap to dismiss earlier.
  useEffect(() => {
    if (uiState !== "playing") {
      setShowTutorial(false);
      return;
    }
    setShowTutorial(true);
    const t = window.setTimeout(() => setShowTutorial(false), 6500);
    return () => window.clearTimeout(t);
  }, [uiState]);

  useEffect(() => {
    if (!panicTip) return;
    const t = window.setTimeout(() => setPanicTip(false), PANIC_TIP_MS);
    return () => window.clearTimeout(t);
  }, [panicTip]);

  useEffect(() => {
    if (!shareNote) return;
    const t = window.setTimeout(() => setShareNote(null), 2000);
    return () => window.clearTimeout(t);
  }, [shareNote]);

  // Auto-clear combo milestone overlay after its animation
  useEffect(() => {
    if (!milestone) return;
    const t = window.setTimeout(() => setMilestone(null), 1200);
    return () => window.clearTimeout(t);
  }, [milestone]);

  // Persist player name
  useEffect(() => {
    if (playerName) safeLocalSet("hextris_name", playerName);
  }, [playerName]);

  async function submitScore(name: string) {
    if (submitState === "submitting" || submitState === "rejected") return;
    // A 0 (an idle or abandoned run) has no place on the board; the card offers no form for it.
    if (!isRecordableRun(uiRun.score)) return;
    setSubmitState("submitting");
    const result = await submit(arcadeSubmission(name, uiRun));
    if (result.ok && typeof result.rank === "number") {
      setRank(result.rank);
      setSubmitState("submitted");
      await refreshLeaderboard();
    } else if (result.rejected) {
      setSubmitState("rejected");
    } else {
      setSubmitState("failed");
    }
  }

  // On game-over: fetch the leaderboard. Scores are only posted when the player
  // presses Submit (or Enter in the name box), never automatically.
  useEffect(() => {
    if (uiState === "gameover") {
      void refreshLeaderboard();
    }
    if (uiState === "playing") {
      setRank(null);
      setSubmitState("idle");
      setSheetHidden(false);
      setShareNote(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState]);

  // While the game-over sheet is up, the board moves (and shrinks if it must) into the space the
  // sheet leaves, so the sheet never covers it. CSS translate and scale, so the clear shake's
  // transform still composes; the canvas keeps its size and nothing is redrawn.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sheet = sheetRef.current;
    if (!canvas) return;
    const reset = () => {
      canvas.style.translate = "";
      canvas.style.scale = "";
    };
    if (uiState !== "gameover" || sheetHidden || !sheet) {
      reset();
      return;
    }
    const place = () => {
      // offset* ignore transforms, so the sheet's slide-in does not skew the measure.
      const fit = boardFit(
        { w: canvas.offsetWidth, h: canvas.offsetHeight },
        { x: sheet.offsetLeft, y: sheet.offsetTop, w: sheet.offsetWidth, h: sheet.offsetHeight },
      );
      if (fit === NO_FIT) {
        reset();
        return;
      }
      canvas.style.translate = `${fit.dx}px ${fit.dy}px`;
      canvas.style.scale = String(fit.scale);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(sheet);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      reset();
    };
  }, [uiState, sheetHidden]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d")!;
    destroyedRef.current = false;
    const sounds = soundsRef.current!;

    let highScores: number[] = [];
    try {
      const hs = localStorage.getItem("hextris_highscores");
      if (hs) {
        const parsed = safeJsonParse<unknown>(hs, "hextris:highscores");
        highScores = asNumberArray(parsed);
      }
    } catch {
      // silent-ok: best-effort localStorage read; missing/corrupt highscores just start empty
    }

    // ?seed=<uint32> replays a run outside production (spec section 12.3).
    const allowSeedOverride =
      // eslint-disable-next-line no-restricted-properties -- dev-only seed seam, the same NODE_ENV gate as space-shooter.tsx's dev affordances; not an integration var
      process.env.NODE_ENV !== "production";
    const drawSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    const newRun = () =>
      createRun({ seed: runSeed(window.location.search, allowSeedOverride, drawSeed) });

    let run: RunState = newRun();
    const memo: FeedbackMemo = { combo: 1 };
    let view: Layout = layout(1, 1, false);
    let lastFrameAt = performance.now();
    let lastTempoAt = 0;
    let milestoneId = 0;
    // Run-clock time of the next boundary drop while its warning is up, and the second shown.
    let boundaryDropAt: number | null = null;
    let countdown: number | null = null;
    // "+N" popups on the board, each kept for POPUP_MS of run time, and the clear shake.
    let popups: ShownPopup[] = [];
    let shakePeak = 0;
    let shakeStartedAt = 0;
    let shaking = false;
    // Whether this page has already decided on the Panic Clear tip (shown, or seen before).
    let panicTipDecided = false;
    // The size the canvas backing store was last given, as width x height @ DPR, immersive.
    let fittedTo = "";
    let shownAway = false;
    // The latest animation-frame time, and the frame time the run ended on (null while it runs):
    // a key or a tap on the board restarts only RESTART_LOCKOUT_MS after the end.
    let frameNow = performance.now();
    let overAt: number | null = null;
    const restartReady = () => overAt !== null && frameNow - overAt >= RESTART_LOCKOUT_MS;
    // What the painter marks on the board after game over: the overflowed side, and whether to
    // burst for a new best. The loop keeps painting under the sheet, so the side keeps pulsing.
    let ending: Omit<PaintEnding, "sinceMs"> | null = null;
    // The shake and the game-over pulse and burst follow the OS reduced-motion preference.
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Haptic feedback helper — no-op on desktop / unsupported devices.
    // We silently swallow failures since some browsers (iOS Safari) throw.
    function haptic(pattern: HapticPattern) {
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(pattern);
        }
      } catch {
        // silent-ok: haptic feedback is cosmetic; some browsers throw vibrate() outside a user gesture
      }
    }

    // Hands the engine's queued events to the sounds, the vibration motor and the React HUD.
    function flush() {
      const events = drainEvents(run);
      if (events.length === 0) return;
      const f = feedbackFor(events, memo);
      for (const cue of f.sounds) playCue(sounds, cue);
      for (const pattern of f.haptics) haptic(pattern);
      if (f.score !== null) setUiScore(f.score);
      if (f.scorePulse) setScorePulse((p) => p + 1);
      if (f.combo !== null) setUiCombo(f.combo);
      if (f.momentum !== null) {
        setUiMomentum(f.momentum);
        if (f.momentum < 100) {
          // Panic Clear spent the meter (or a new run reset it): the tip has done its job.
          setPanicTip(false);
        } else if (!panicTipDecided) {
          panicTipDecided = true;
          // Marked seen as it shows, so a reload mid-tip does not show it again.
          if (!readTips().panicSeen) {
            markPanicTipSeen();
            setPanicTip(true);
          }
        }
      }
      if (f.milestone) {
        milestoneId += 1;
        setMilestone({ id: milestoneId, ...f.milestone });
      }
      if (f.rotated) setShowTutorial(false);
      if (f.countdown !== undefined) setUiCountdown(f.countdown);
      const bornMs = run.elapsedMs + run.carryMs;
      for (const popup of f.popups) popups.push({ ...popup, bornMs });
      if (f.shake > 0 && !reducedMotion) {
        const now = performance.now();
        // A new clear shakes from whichever is stronger: its own peak or what is left of the last.
        shakePeak = Math.max(f.shake, shakeAmplitude(shakePeak, now - shakeStartedAt));
        shakeStartedAt = now;
      }
      if (f.boundaryDropAt !== undefined) boundaryDropAt = f.boundaryDropAt;
      // A new run or a drop ends the countdown here, before the phase change renders, so Play
      // again cannot flash the last run's banner for a frame.
      if (f.boundaryDropAt === null && countdown !== null) {
        countdown = null;
        setUiShrinkWarn(null);
      }
      if (f.over) {
        // The run clock stops at game over, so a popup would hang on the board.
        popups = [];
        overAt = frameNow;
        // Read the best before this run is recorded into the list.
        const outcome = gameOverView({
          score: f.over.score,
          previousBest: highScores[0] ?? null,
          side: f.over.side,
          nowMs: 0,
          overAtMs: 0,
        });
        setUiNewBest(outcome.isNewBest);
        if (outcome.isNewBest) sounds.newBest();
        // Reduced motion: no burst, and the highlight holds still (sinceMs stays 0 below).
        ending = { side: outcome.side, newBest: outcome.isNewBest && !reducedMotion };
        if (isRecordableRun(f.over.score)) {
          highScores = recordHighScore(highScores, f.over.score);
          safeLocalSet("hextris_highscores", JSON.stringify(highScores));
        }
        setUiHigh(highScores[0] || 0);
        setUiRun({
          score: f.over.score,
          level: run.level,
          elapsedMs: run.elapsedMs,
          cellsCleared: f.over.cellsCleared,
          bestCombo: run.bestCombo,
        });
      }
      // Game-over music is triggered by the uiState effect.
      if (f.phase === "playing") setUiState("playing");
      else if (f.phase === "paused") setUiState("paused");
      else if (f.phase === "over") setUiState("gameover");
    }

    // The boundary countdown banner, with a tick on each second of it.
    function syncCountdown() {
      if (run.phase !== "playing") return;
      const next = boundaryDropAt === null ? null : shrinkCountdown(boundaryDropAt, run.elapsedMs);
      if (next === countdown) return;
      countdown = next;
      setUiShrinkWarn(next);
      if (next !== null) {
        sounds.rotate();
        haptic([15]);
      }
    }

    // Offsets the canvas by the decaying shake, in a fresh random direction each frame.
    function applyShake(now: number) {
      const amp = shakeAmplitude(shakePeak, now - shakeStartedAt);
      if (amp > 0) {
        const dx = (Math.random() * 2 - 1) * amp;
        const dy = (Math.random() * 2 - 1) * amp;
        canvas!.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        shaking = true;
      } else if (shaking) {
        canvas!.style.transform = "";
        shaking = false;
      }
    }

    function act(action: EngineAction) {
      applyAction(run, action);
      flush();
    }

    function startRun() {
      run = newRun();
      overAt = null;
      ending = null;
      popups = [];
      sounds.resume(); // Audio contexts require a user gesture to start
      act("start");
    }

    // Expose restart, pause and Panic Clear to the JSX buttons.
    restartRef.current = () => startRun();
    pauseRef.current = () => act("toggle-pause");
    panicRef.current = () => act("panic");

    function frame(now: number) {
      if (destroyedRef.current) return;
      animRef.current = requestAnimationFrame(frame);
      try {
        // A long gap (a background tab) is not fed to the run in one go.
        const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - lastFrameAt));
        lastFrameAt = now;
        frameNow = now;
        // The countdown runs the run clock too; play starts at GO.
        if (run.phase === "playing" || run.phase === "countdown") {
          advance(run, dt);
          // The music follows the level about once a second; the rush key never changes it.
          if (now - lastTempoAt > 1000) {
            lastTempoAt = now;
            sounds.setMusicTempo(musicTempo(run.level));
          }
        }
        flush();
        syncCountdown();
        // Not before AFK_AFTER_MS of play: a run starts away until the first input.
        const away = run.phase === "playing" && run.afk && run.elapsedMs >= AFK_AFTER_MS;
        if (away !== shownAway) {
          shownAway = away;
          setUiAway(away);
        }
        // Run time keeps moving through a hit-stop, so popups and easing play on while it holds.
        const nowMs = run.elapsedMs + run.carryMs;
        if (popups.length > 0) popups = popups.filter((p) => nowMs - p.bornMs < POPUP_MS);
        applyShake(now);
        paint(
          ctx,
          run,
          view,
          nowMs,
          popups,
          ending && overAt !== null
            ? { ...ending, sinceMs: reducedMotion ? 0 : now - overAt }
            : undefined,
        );
      } catch (err) {
        cancelAnimationFrame(animRef.current);
        destroyedRef.current = true;
        const crash = gameCrashToReport("hextris", err);
        if (crash) reportError(crash);
        setCrashed(true);
      }
    }

    function fitCanvas() {
      // ResizeObserver can fire during unmount or rapid tab switches — guard.
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      // Native fullscreen or pseudo-fullscreen: use the full container rect.
      // Portrait (mobile inline): tall canvas makes better use of the screen.
      // Landscape/desktop: cap at 75vh so page remains scrollable.
      const immersive =
        document.fullscreenElement === container ||
        container.classList.contains("hextris-immersive");
      let height: number;
      if (immersive) {
        height = Math.floor(rect.height);
      } else if (window.innerHeight > window.innerWidth) {
        height = Math.floor(Math.min(width * 1.3, window.innerHeight * 0.85));
      } else {
        height = Math.floor(Math.min(width * 0.7, window.innerHeight * 0.75));
      }
      const dpr = window.devicePixelRatio || 1;
      // Assigning canvas.width reallocates and clears the backing store even when the number is
      // unchanged (about 12 MB at 390 x 844 and DPR 3). The observers below often report the same
      // size several times in a row, most of all around a phone's auto-fullscreen on the first
      // tap, so an unchanged size is left alone.
      const fit = `${width}x${height}@${dpr}${immersive ? " immersive" : ""}`;
      if (fit === fittedTo) return;
      fittedTo = fit;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      // Resizing the canvas resets its transform; the painter works in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view = layout(width, height, immersive);
    }

    // ─── INPUT ───────────────────────────────────────────────

    function handleKeyDown(e: KeyboardEvent) {
      // After game over Space, Enter or R restart once the lockout has passed, so the
      // player reads the score first (game-over.ts); the router holds them until then.
      const { action, preventDefault } = hextrisKeyAction({
        key: e.key,
        phase: run.phase,
        textEntry: isTextEntryTarget(e),
        onControl:
          e.target instanceof Element &&
          e.target.closest("button, a") !== null &&
          (e.key === " " || e.key === "Enter"),
        modifier: e.ctrlKey || e.metaKey || e.altKey,
        repeat: e.repeat,
        canRestart: restartReady(),
      });
      if (preventDefault) e.preventDefault();
      if (action === "start" || action === "restart") startRun();
      else if (action !== "none") act(action);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") act("rush-off");
    }

    let lastTouchMs = 0;

    function handleCanvasClick(e: MouseEvent | TouchEvent) {
      e.preventDefault();

      // Suppress the synthesized click that follows a touchstart — otherwise
      // every tap on mobile fires rotation twice. preventDefault on touchstart
      // is unreliable across browsers, so debounce explicitly.
      if (!("touches" in e)) {
        if (Date.now() - lastTouchMs < 500) return;
      } else {
        lastTouchMs = Date.now();
      }

      switch (run.phase) {
        case "ready":
          startRun();
          return;
        case "paused":
          act("toggle-pause");
          return;
        case "over":
          // Same rule as the keys: a tap on the board restarts once the lockout has
          // passed. The sheet is not part of the canvas, so a tap on it never lands here.
          if (restartReady()) startRun();
          return;
        case "countdown":
        case "playing": {
          const clientX =
            "touches" in e
              ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0)
              : e.clientX;
          const rect = canvas!.getBoundingClientRect();
          act(clientX < rect.left + rect.width / 2 ? "rotate-ccw" : "rotate-cw");
          return;
        }
      }
    }

    // ─── SETUP ───────────────────────────────────────────────

    fitCanvas();
    setUiHigh(highScores[0] || 0);
    animRef.current = requestAnimationFrame(frame);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("touchstart", handleCanvasClick, {
      passive: false,
    });

    const resizeObserver = new ResizeObserver(() => {
      fitCanvas();
    });
    resizeObserver.observe(container);

    // Rescale on fullscreen transitions so the canvas fills the new viewport.
    let fsChangeRaf: number | null = null;
    const onFsChange = () => {
      // Delay by one frame so the browser has laid out the new rect.
      fsChangeRaf = requestAnimationFrame(() => fitCanvas());
    };
    document.addEventListener("fullscreenchange", onFsChange);
    // Also listen to window resize as a safety net for orientation changes
    // and pseudo-fullscreen toggles (keyboard opening, rotation, etc.).
    let resizeRaf: number | null = null;
    const onWindowResize = () => {
      resizeRaf = requestAnimationFrame(() => fitCanvas());
    };
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onWindowResize);

    // Window blur = auto-pause
    function handleBlur() {
      // The keyup for a held rush key is lost with focus; release it so the
      // speed-up cannot stay stuck after the player returns.
      act("rush-off");
      if (run.phase === "playing" || run.phase === "countdown") act("toggle-pause");
    }
    window.addEventListener("blur", handleBlur);

    // ─── CLEANUP ─────────────────────────────────────────────

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("touchstart", handleCanvasClick);
      resizeObserver.disconnect();
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      window.removeEventListener("blur", handleBlur);
      if (fsChangeRaf !== null) cancelAnimationFrame(fsChangeRaf);
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf);
      if (soundsRef.current) soundsRef.current.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      // The immersive layer must sit above the site navbar (z-70) and its
      // mobile menu, or the navbar covers the Exit fullscreen button.
      className={`overflow-hidden border border-white/10 bg-[#050505] ${
        isFullscreen
          ? "relative h-screen w-screen rounded-none"
          : mobileImmersive
            ? "hextris-immersive fixed inset-0 z-80 h-[100dvh] w-screen rounded-none"
            : "relative w-full rounded-xl"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="block w-full transition-[translate,scale] duration-500 ease-out"
        style={{ touchAction: "none" }}
      />

      {/* Start screen. Clicks pass through to the canvas, which starts the run. */}
      {uiState === "menu" && !crashed && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
          <div className="font-display text-5xl font-black tracking-tight text-white">HEXTRIS</div>
          <div className="flex items-center gap-1.5 font-mono text-base text-accent-green">
            <Play className="h-3.5 w-3.5" />
            Click to start
          </div>
          {uiHigh > 0 && (
            <div className="font-mono text-sm text-white/50">
              Best <span className="tabular-nums">{uiHigh}</span>
            </div>
          )}
        </div>
      )}

      {/* HUD — top-left chip. `key` pulse forces a brief scale animation on score change. */}
      <div className="absolute top-3 left-3 flex max-w-[calc(100%-172px)] flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs text-white/60 backdrop-blur">
          <span className="text-accent-pink/90">SCORE</span>
          <span
            key={scorePulse}
            className="hextris-score-pulse inline-block text-white tabular-nums"
          >
            {uiScore}
          </span>
        </div>
        {uiHigh > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs text-white/60 backdrop-blur">
            <span className="text-accent-green/90">BEST</span>
            <span className="text-white tabular-nums">{uiHigh}</span>
          </div>
        )}
        {uiCombo > 1 && uiState === "playing" && (
          <div
            key={`combo-${uiCombo}`}
            className="hextris-combo-pop flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1.5 font-mono text-xs text-accent-amber backdrop-blur"
          >
            <span className="opacity-80">COMBO</span>
            <span className="font-bold tabular-nums">×{uiCombo}</span>
          </div>
        )}
      </div>

      {/* Momentum meter — bottom-center. At 100% the entire bar becomes a large
          tappable button (thumb-friendly on mobile). */}
      {uiState === "playing" && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 flex w-[min(80%,320px)] -translate-x-1/2 flex-col items-center gap-1.5">
          {uiAway && !(uiMomentum >= 100 && panicTip) && (
            <div className="absolute bottom-full mb-2 font-mono text-[10px] tracking-wider whitespace-nowrap text-white/45 uppercase">
              Away: clears score 0 until you move
            </div>
          )}
          {uiMomentum >= 100 && panicTip && (
            <div
              role="status"
              className="hextris-combo-pop absolute bottom-full mb-2 rounded-md border border-accent-purple/50 bg-black/80 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-white backdrop-blur"
            >
              Press F or tap to clear the board
            </div>
          )}
          {uiMomentum >= 100 ? (
            <button
              type="button"
              onClick={() => panicRef.current()}
              className="hextris-score-pulse pointer-events-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-accent-purple bg-gradient-to-r from-accent-purple/40 via-accent-pink/40 to-accent-purple/40 px-4 py-3 font-mono text-sm text-white shadow-lg shadow-accent-purple/50 transition-all hover:brightness-110 active:scale-95"
              title="Purge the board (F)"
              aria-label="Panic Clear"
            >
              <span className="font-bold tracking-wider">PANIC CLEAR</span>
              <kbd className="hidden h-5 min-w-[1.25rem] items-center justify-center rounded border border-white/40 bg-white/10 px-1 text-[10px] sm:inline-flex">
                F
              </kbd>
            </button>
          ) : (
            <>
              <div className="relative h-3 w-48 overflow-hidden rounded-full border border-white/15 bg-black/50 backdrop-blur">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
                  style={{
                    width: `${uiMomentum}%`,
                    background: "linear-gradient(90deg, #6366f1, #a78bfa)",
                  }}
                />
              </div>
              <span className="font-mono text-[10px] tracking-wider text-white/50 uppercase">
                Momentum {uiMomentum}%
              </span>
            </>
          )}
        </div>
      )}

      {/* Top-right: pause, sound, fullscreen, status badge */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {(uiState === "playing" || uiState === "paused") && (
          <button
            type="button"
            onClick={() => pauseRef.current()}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/60 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
            aria-label={uiState === "paused" ? "Resume" : "Pause"}
            title={uiState === "paused" ? "Resume" : "Pause"}
          >
            {uiState === "paused" ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/60 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
          aria-label={soundEnabled ? "Mute" : "Unmute"}
          title={soundEnabled ? "Mute" : "Unmute"}
        >
          {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            void toggleFullscreen();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/60 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
          aria-label={isFullscreen || mobileImmersive ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen || mobileImmersive ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen || mobileImmersive ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Bottom controls bar removed — same instructions are shown in the
          on-canvas tutorial card and in the start menu. */}

      {/* Unified tutorial overlay — device-aware, icon-based. Shows DURING
          the countdown and the first seconds of play. Taps pass through to the
          board (the first rotation also hides it); only the close control takes
          pointer events. */}
      {showTutorial && uiState === "playing" && (
        <div className="hextris-tutorial-fade pointer-events-none absolute inset-0 z-10 flex items-end justify-center px-4 pb-20 sm:pb-24">
          <div className="relative flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-black/75 px-5 py-4 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={dismissTutorial}
              className="pointer-events-auto absolute -top-5 -right-5 flex h-11 w-11 items-center justify-center"
              aria-label="Dismiss tutorial"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/90 text-white/70">
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
            {isTouchDevice ? (
              <div className="flex items-center gap-4 text-white">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent-pink/50 bg-accent-pink/10 text-accent-pink">
                    <Hand className="h-5 w-5 -scale-x-100" />
                  </div>
                  <span className="font-mono text-[9px] text-white/50 uppercase">Left half</span>
                </div>
                <ArrowLeftRight className="h-4 w-4 text-white/40" />
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-accent-blue/50 bg-accent-blue/10 text-accent-blue">
                    <Hand className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[9px] text-white/50 uppercase">Right half</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-white">
                <div className="flex flex-col items-center gap-1.5">
                  <kbd className="inline-flex h-9 min-w-[2.5rem] items-center justify-center rounded border border-accent-pink/50 bg-accent-pink/10 px-2 font-mono text-sm text-accent-pink">
                    ←
                  </kbd>
                  <span className="font-mono text-[9px] text-white/50 uppercase">Rotate left</span>
                </div>
                <ArrowLeftRight className="h-4 w-4 text-white/40" />
                <div className="flex flex-col items-center gap-1.5">
                  <kbd className="inline-flex h-9 min-w-[2.5rem] items-center justify-center rounded border border-accent-blue/50 bg-accent-blue/10 px-2 font-mono text-sm text-accent-blue">
                    →
                  </kbd>
                  <span className="font-mono text-[9px] text-white/50 uppercase">Rotate right</span>
                </div>
              </div>
            )}
            <span className="mt-1 font-mono text-[11px] text-white/50">
              Match 3+ blocks to score
            </span>
          </div>
        </div>
      )}

      {/* Pause overlay — React card with clickable Resume (mobile-friendly) */}
      {uiState === "paused" && (
        <div className="pointer-events-none absolute inset-0 z-25 flex items-center justify-center px-4">
          <div className="hextris-gameover-in pointer-events-auto rounded-2xl border border-white/10 bg-black/85 px-8 py-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mb-2 font-mono text-[11px] tracking-widest text-accent-amber uppercase">
              Paused
            </div>
            <div className="mb-4 font-display text-3xl font-black text-white">Take a breath</div>
            <button
              type="button"
              onClick={() => pauseRef.current()}
              className="inline-flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-2 text-sm font-medium text-accent-green transition-colors hover:bg-accent-green/20"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
            {!isTouchDevice && (
              <div className="mt-3 font-mono text-[10px] text-white/40">or press Space</div>
            )}
          </div>
        </div>
      )}

      {/* Start countdown: each number pops in over the board until GO. */}
      {uiCountdown !== null && uiState === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div
            key={uiCountdown}
            className="hextris-combo-pop font-display text-8xl font-black text-white tabular-nums"
            style={{ textShadow: "0 0 4px rgba(0, 0, 0, 0.9), 0 0 24px rgba(0, 0, 0, 0.85)" }}
          >
            {uiCountdown}
          </div>
        </div>
      )}

      {/* Shrink countdown banner: top-center, visible only during the 10s warning. */}
      {uiShrinkWarn !== null && uiState === "playing" && (
        <div
          key={`shrink-${uiShrinkWarn}`}
          className="hextris-combo-pop absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-accent-red/60 bg-accent-red/15 px-3 py-1.5 font-mono text-xs text-accent-red backdrop-blur"
        >
          <span className="font-bold tracking-wider uppercase">Boundary shrinks</span>
          <span className="text-sm font-bold text-white tabular-nums">{uiShrinkWarn}s</span>
        </div>
      )}

      {/* Combo milestone burst — size + glow scale with combo strength */}
      {milestone && (
        <div
          key={milestone.id}
          className="hextris-milestone-burst pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <div
            className="text-center font-display font-black tracking-tight"
            style={{
              color: milestone.color,
              // Combo bursts ("xN COMBO!" or "xN CHAIN!") scale with N. CLEAN SWEEP,
              // PANIC CLEAR and BOUNDARY TIGHTENS render at fixed sizes: they
              // have no N for the scaler to read.
              fontSize: (() => {
                if (milestone.text.startsWith("CLEAN")) return "calc(2.5rem * 2.6)";
                if (!milestone.text.startsWith("×")) return "calc(2.5rem * 1.4)";
                const n = parseInt(milestone.text.match(/\d+/)?.[0] || "2", 10);
                const scale = 1 + Math.min(n - 2, 18) * 0.07;
                return `calc(2.5rem * ${scale})`;
              })(),
              textShadow: (() => {
                if (milestone.text.startsWith("CLEAN")) {
                  return `0 0 80px ${milestone.color}88, 0 0 160px ${milestone.color}44`;
                }
                if (!milestone.text.startsWith("×")) {
                  return `0 0 40px ${milestone.color}88, 0 0 80px ${milestone.color}33`;
                }
                const n = parseInt(milestone.text.match(/\d+/)?.[0] || "2", 10);
                const blur = 20 + Math.min(n, 20) * 3;
                return `0 0 ${blur}px ${milestone.color}66, 0 0 ${blur * 2}px ${milestone.color}33`;
              })(),
            }}
          >
            {milestone.text}
          </div>
        </div>
      )}

      {/* Game-over sheet: a bottom sheet on phones and a right-hand panel from sm up, so the
          board stays in view beside it (the effect above moves the board clear). Hide
          collapses it to a strip. Dark palette is hard-coded so it renders consistently even
          in light mode. */}
      {uiState === "gameover" && (
        <section
          ref={sheetRef}
          aria-label="Game over"
          className={`hextris-sheet-in pointer-events-auto absolute inset-x-0 bottom-0 z-30 overflow-y-auto rounded-t-2xl border-t border-white/10 bg-black/90 p-4 text-white shadow-2xl backdrop-blur-md sm:top-0 sm:left-auto sm:w-80 sm:rounded-none sm:border-t-0 sm:border-l sm:p-5 ${
            sheetHidden ? "sm:bottom-auto" : "max-h-[55%] sm:max-h-none"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-accent-pink uppercase">
                Game Over
                {uiNewBest && (
                  <span className="hextris-combo-pop rounded border border-accent-amber/50 bg-accent-amber/15 px-1.5 py-0.5 font-bold text-accent-amber">
                    NEW BEST
                  </span>
                )}
              </div>
              <div className="font-display text-4xl font-black text-white tabular-nums sm:text-5xl">
                <ScoreCountUp score={uiRun.score} />
              </div>
            </div>
            {sheetHidden && (
              <button
                type="button"
                onClick={() => restartRef.current()}
                className="min-h-11 rounded-md border border-accent-pink/40 bg-accent-pink/10 px-3 font-mono text-xs text-accent-pink transition-colors hover:bg-accent-pink/20"
              >
                Play again
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheetHidden((hidden) => !hidden)}
              aria-expanded={!sheetHidden}
              className="min-h-11 rounded-md border border-white/10 bg-white/[0.03] px-3 font-mono text-xs text-white/70 transition-colors hover:text-white"
            >
              {sheetHidden ? "Show" : "Hide"}
            </button>
          </div>
          {!sheetHidden && (
            <>
              {uiHigh > 0 && (
                <div className="mt-1 font-mono text-xs text-white/50">
                  Best <span className="text-accent-green">{uiHigh}</span>
                  {rank !== null && (
                    <>
                      <span className="mx-1.5 opacity-40">·</span>
                      <span>
                        Rank <span className="text-accent-amber">#{rank}</span>
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Name + submit lead the sheet; posting stays manual (Submit or Enter, never
                  automatic). A run that scored 0 has nothing to post. */}
              {isRecordableRun(uiRun.score) ? (
                <>
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (
                          submitState !== "submitting" &&
                          submitState !== "submitted" &&
                          submitState !== "rejected" &&
                          playerName.trim()
                        ) {
                          void submitScore(playerName);
                        }
                      }}
                      placeholder="Your name"
                      maxLength={12}
                      className="min-h-11 flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-base text-white placeholder-white/40 focus:border-accent-pink/60 focus:outline-none sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void submitScore(playerName);
                      }}
                      disabled={
                        submitState === "submitting" ||
                        submitState === "submitted" ||
                        submitState === "rejected" ||
                        !playerName.trim()
                      }
                      className="min-h-11 rounded-md border border-accent-green/40 bg-accent-green/10 px-3 py-2 font-mono text-xs text-accent-green transition-colors hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {submitState === "submitting"
                        ? "..."
                        : submitState === "submitted"
                          ? "Saved"
                          : submitState === "failed"
                            ? "Retry"
                            : submitState === "rejected"
                              ? "Rejected"
                              : "Submit"}
                    </button>
                  </div>

                  {submitState === "rejected" && (
                    <p role="status" className="mt-2 font-mono text-xs text-accent-amber">
                      Score not accepted
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-4 text-center font-mono text-xs text-white/50">No score to post</p>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                  <div className="font-mono text-[10px] tracking-wider text-white/50 uppercase">
                    Max Combo
                  </div>
                  <div className="mt-0.5 font-mono text-base text-accent-amber tabular-nums">
                    &times;{uiRun.bestCombo}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                  <div className="font-mono text-[10px] tracking-wider text-white/50 uppercase">
                    Cleared
                  </div>
                  <div className="mt-0.5 font-mono text-base text-accent-blue tabular-nums">
                    {uiRun.cellsCleared}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                  <div className="font-mono text-[10px] tracking-wider text-white/50 uppercase">
                    Time
                  </div>
                  <div className="mt-0.5 font-mono text-base text-accent-pink tabular-nums">
                    {formatRunTime(uiRun.elapsedMs)}
                  </div>
                </div>
              </div>

              {/* Top 8 leaderboard */}
              <div className="mt-4">
                <div className="mb-2 px-1 font-mono text-[10px] tracking-widest text-white/50 uppercase">
                  Top Runs
                </div>
                <ArcadeBoardTabs
                  label="Leaderboard period"
                  period={boardPeriod}
                  onChange={setBoardPeriod}
                  className="mb-2"
                  activeClassName="border-pink-400/60 bg-pink-500/20 text-pink-300"
                  inactiveClassName="border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                />
                {leaderboard.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-center font-mono text-xs text-white/50">
                    {boardLoading
                      ? "Loading"
                      : boardError
                        ? "Could not load the board"
                        : boardPeriod === "daily"
                          ? "No scores yet today"
                          : boardPeriod === "weekly"
                            ? "No scores yet this week"
                            : "No scores yet"}
                  </p>
                ) : (
                  <div className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    {leaderboard.slice(0, 8).map((e) => {
                      // The server marks the viewer's own row. The old name-and-rank match is
                      // only the fallback for a response that omits the flag.
                      const isYou =
                        e.isYou ??
                        (rank !== null &&
                          e.rank === rank &&
                          e.score === uiScore &&
                          e.name.toLowerCase() === (playerName.trim() || "Player").toLowerCase());
                      return (
                        <div
                          key={`${e.rank}-${e.name}-${e.createdAt}`}
                          className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs ${
                            isYou ? "bg-accent-pink/10" : ""
                          }`}
                        >
                          <span
                            className={`w-5 text-right tabular-nums ${isYou ? "text-accent-pink" : "text-white/40"}`}
                          >
                            {e.rank}
                          </span>
                          <span
                            className={`flex-1 truncate ${
                              isYou ? "font-bold text-accent-pink" : "text-white/90"
                            }`}
                          >
                            {e.name}
                          </span>
                          <span
                            className={`tabular-nums ${isYou ? "text-accent-pink" : "text-white/70"}`}
                          >
                            {e.score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {leaderboardYou && !leaderboard.slice(0, 8).some((e) => e.isYou) && (
                  <div className="mt-2 px-1 font-mono text-[10px] text-white/50">
                    Your best: #{leaderboardYou.rank} ({leaderboardYou.score})
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                {isRecordableRun(uiRun.score) && (
                  <button
                    type="button"
                    onClick={() => {
                      void shareRun(uiRun.score).then((outcome) => {
                        if (outcome === "copied") setShareNote("Copied");
                        else if (outcome === "failed") setShareNote("Could not copy");
                      });
                    }}
                    className="min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white/80 transition-colors hover:text-white"
                  >
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => restartRef.current()}
                  className="min-h-11 flex-1 rounded-lg border border-accent-pink/40 bg-accent-pink/10 py-2.5 text-sm font-medium text-accent-pink transition-colors hover:bg-accent-pink/20"
                >
                  Play again
                </button>
              </div>
              {shareNote && (
                <p role="status" className="mt-2 text-center font-mono text-xs text-accent-green">
                  {shareNote}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Crash overlay — the game loop threw and stopped; reload is the
          honest recovery (a "retry" that reruns the same crashing frame
          could re-crash). Reuses the game-over card's classes. */}
      {crashed && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-auto px-3 py-4 sm:px-4">
          <div className="hextris-gameover-in pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-black/90 p-4 text-center text-white shadow-2xl backdrop-blur-md sm:p-6">
            <div className="mb-2 font-mono text-[11px] tracking-widest text-accent-pink uppercase">
              Game Error
            </div>
            <div className="mt-2 text-sm text-white/70">This game hit an error and stopped.</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-lg border border-accent-pink/40 bg-accent-pink/10 py-2.5 text-sm font-medium text-accent-pink transition-colors hover:bg-accent-pink/20"
            >
              Reload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
