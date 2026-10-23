"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  addCoins,
  addRunStats,
  incrementRunsPlayed,
  loadProfile,
  markFirstRunCompleted,
  saveProfile,
  setUpgradeLevel,
  spendCoins,
} from "./profile";
import { upgradeById } from "./shop-data";
import { PostFx } from "./post-fx";
import { RunBanner } from "./space-shooter/run-banner";
import { checkAchievements, grantAchievements, type Achievement } from "./achievements";
import {
  type BossId,
  type GameRefs,
  ARENA_W,
  ARENA_H,
  envForTime,
  tryDash,
} from "./space-shooter/types";
import { isWorldRecord, personalBestKind } from "./space-shooter/celebration";
import { buildConfetti } from "./space-shooter/confetti";
import {
  createInitialUiState,
  createUiStateFromGame,
  type UiState,
} from "./space-shooter/ui-state";
import { postRunGoals, unownedCatalog } from "./space-shooter/post-run";
import { CountdownOverlay } from "./space-shooter/countdown-overlay";
import { useCountdown } from "./space-shooter/use-countdown";
import { canvasLayout, SHOOTER_CAPTION, type CanvasVariant } from "./space-shooter/canvas-layout";
import { safeLocalSet } from "@/lib/safe-storage";
import { gameCrashToReport } from "@/lib/report-game-error";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { sounds } from "./space-shooter/sound-manager";
import { spawnBoss } from "./space-shooter/boss-behaviors";
import { createRefs, startRun, pauseRun, resumeRun, resetToArmed } from "./space-shooter/run-init";
import { Scene } from "./space-shooter/scene-components";
import { keyboardStep, orbitalKeyDecision, shouldCaptureTouch } from "./space-shooter/input";
import { isTextEntryTarget } from "./text-entry";
import {
  HS_KEY,
  NAME_KEY,
  SOUND_KEY,
  loadInitialPrefs,
  detectGyroSupported,
  type SpaceShooterPrefs,
} from "./space-shooter/prefs";
import { renderShareImage } from "./space-shooter/share-image";
import { ShopPanel, type ShopTab } from "./space-shooter/shop-panel";
import { TrophiesPanel } from "./space-shooter/trophies-panel";
import { RunHud } from "./space-shooter/run-hud";
import { TopControls } from "./space-shooter/top-controls";
import { PauseOverlay } from "./space-shooter/pause-overlay";
import { AchievementToasts } from "./space-shooter/achievement-toasts";
import { SettingsPanel } from "./space-shooter/settings-panel";
import { BossBanners } from "./space-shooter/boss-banners";
import { ArmedMenu } from "./space-shooter/armed-menu";
import { DeathOverlay, type CelebrationKind } from "./space-shooter/death-overlay";
import { CrashOverlay } from "./space-shooter/crash-overlay";

// ---------- leaderboard helpers ----------
// The board is read and written through useArcadeBoard("space-shooter") (leaderboard v2):
// the hook owns the player identity, the period tabs and the submit payload. There is no
// country lookup any more; the v2 board does not store one.

// ---------- main component ----------

export function SpaceShooterGame({ variant = "embed" }: { variant?: CanvasVariant } = {}) {
  const gameRefs = useRef<GameRefs>(createRefs());
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [ui, setUi] = useState<UiState>(createInitialUiState);
  const [celebration, setCelebration] = useState<CelebrationKind>(null);
  // The best before this run, for the death card's score-vs-best bar.
  const [previousBest, setPreviousBest] = useState<number | null>(null);
  // Fly Again's 3-2-1: the displayed step (null when not counting) and the
  // timestamp state machine behind it.
  const chimeCue = useCallback(() => sounds.play("chime"), []);
  const countdownMayAct = useCallback(() => gameRefs.current.status === "armed", []);
  const launchRun = useCallback(() => {
    const g = gameRefs.current;
    if (g.status === "armed") startRun(g);
  }, []);
  const {
    step: countStep,
    begin: beginCountdown,
    cancel: cancelCountdown,
  } = useCountdown(chimeCue, launchRun, countdownMayAct);
  const [crashed, setCrashed] = useState(false);
  const PERSONAL_CONFETTI = useMemo(() => buildConfetti(28, 220), []);
  const WORLD_CONFETTI = useMemo(() => buildConfetti(60, 360), []);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem(HS_KEY);
    const parsed = saved ? parseInt(saved, 10) : 0;
    // Corrupt/tampered storage must not poison the PB comparison with NaN.
    return Number.isFinite(parsed) ? parsed : 0;
  });
  // Whether a best is stored at all: an absent key is a first flight, not a personal best.
  const [hasStoredBest, setHasStoredBest] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem(HS_KEY);
    return saved !== null && Number.isFinite(parseInt(saved, 10));
  });
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(NAME_KEY) ?? "";
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // The server refused the run as implausible (422): not retryable, so the button says so.
  const [rejected, setRejected] = useState(false);
  // Leaderboard v2. fetchOnMount:false because the board only renders on the death overlay,
  // and the death handler refreshes it; the home-page embed mounts this same component, so a
  // mount fetch would cost every home view a GET for a board nobody sees. The legacy rows
  // were imported into the all-time board, so it survives the move.
  const {
    entries: leaderboard,
    you: leaderboardYou,
    period: boardPeriod,
    setPeriod: setBoardPeriod,
    loading: boardLoading,
    readError: boardError,
    refresh: refreshLeaderboard,
    submit: submitScoreToLeaderboard,
  } = useArcadeBoard("space-shooter", { fetchOnMount: false });
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    // Sound is ON by default — but localStorage "0" persists explicit mute.
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  });
  useEffect(
    () => () => {
      // Tear down a recorder left running by navigating away mid-run — the
      // dying-status auto-stop never fires if the component unmounts first.
      const r = recorderRef.current;
      if (r) {
        if (r.state !== "inactive") r.stop();
        for (const t of r.stream.getTracks()) t.stop();
      }
      sounds.destroy();
    },
    [],
  );
  const [showInstructions, setShowInstructions] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [shopTab, setShopTab] = useState<ShopTab>("upgrades");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<SpaceShooterPrefs>(loadInitialPrefs);
  const [achievementToasts, setAchievementToasts] = useState<(Achievement & { firedAt: number })[]>(
    [],
  );
  useEffect(() => {
    if (achievementToasts.length === 0) return;
    const t = setInterval(() => {
      setAchievementToasts((prev) => prev.filter((x) => Date.now() - x.firedAt < 3500));
    }, 500);
    return () => clearInterval(t);
  }, [achievementToasts.length]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRecording = useCallback(() => {
    try {
      const canvas = containerRef.current?.querySelector("canvas") ?? null;
      if (!canvas) return;
      const stream = canvas.captureStream(30);
      let mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setRecordingBlob(new Blob(chunksRef.current, { type: "video/webm" }));
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingBlob(null);
    } catch (err) {
      reportError(err);
    }
  }, []);
  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r) {
      if (r.state !== "inactive") r.stop();
      // Release the canvas capture stream — the recorder alone doesn't.
      for (const t of r.stream.getTracks()) t.stop();
    }
    setIsRecording(false);
  }, []);
  const captureShareImage = useCallback(
    async (stats: { score: number; distance: number; kills: number }): Promise<Blob | null> => {
      // The game's own canvas: on the home page the first canvas in the
      // document is the background scene.
      const canvas = containerRef.current?.querySelector("canvas") ?? null;
      if (!canvas) return null;
      return renderShareImage(canvas, stats);
    },
    [],
  );
  const [gyroSupported] = useState(detectGyroSupported);
  const [gyroPermission, setGyroPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const requestGyroPermission = useCallback(async (): Promise<boolean> => {
    const DOE = (
      window as {
        DeviceOrientationEvent?: typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        };
      }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        setGyroPermission(result === "granted" ? "granted" : "denied");
        return result === "granted";
      } catch {
        // silent-ok: iOS motion-permission prompt dismissed/denied by the user; gyro controls simply stay off
        setGyroPermission("denied");
        return false;
      }
    }
    setGyroPermission("granted");
    return true;
  }, []);
  useEffect(() => {
    if (!gyroSupported || !prefs.gyroEnabled || gyroPermission !== "granted") return;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const clampedGamma = Math.max(-30, Math.min(30, e.gamma));
      const clampedBeta = Math.max(-30, Math.min(30, e.beta - 45));
      gameRefs.current.gyroTilt.x = clampedGamma / 30;
      gameRefs.current.gyroTilt.y = -clampedBeta / 30;
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [gyroSupported, prefs.gyroEnabled, gyroPermission]);
  const [firstBossSeen, setFirstBossSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("orbital-dodge-first-boss-seen") === "1";
  });
  const [profile, setProfile] = useState(() => loadProfile());
  const refreshProfile = useCallback(() => setProfile(loadProfile()), []);
  const isReturningPlayer = profile.firstRunCompleted;
  const goals = useMemo(
    () =>
      postRunGoals({
        score: ui.score,
        previousBest,
        wallet: profile.walletCoins,
        catalog: unownedCatalog(profile.ownedCosmetics),
      }),
    [ui.score, previousBest, profile.walletCoins, profile.ownedCosmetics],
  );
  // Tutorial removed — players learn the game by playing it.
  // Save on change + mirror to gameRefs for per-frame access
  useEffect(() => {
    try {
      const p = loadProfile();
      p.preferences = { ...p.preferences, ...prefs };
      saveProfile(p);
    } catch {
      // silent-ok: best-effort settings persistence via the profile store; fall back to a plain localStorage write
      safeLocalSet("orbital-dodge-prefs", JSON.stringify(prefs));
    }
    gameRefs.current.prefs = { ...prefs };
  }, [prefs]);
  // Persist "first boss seen" flag when boss enters fighting phase
  useEffect(() => {
    if (firstBossSeen) return;
    if (ui.boss?.phase === "fighting") {
      safeLocalSet("orbital-dodge-first-boss-seen", "1");
      const id = window.setTimeout(() => setFirstBossSeen(true), 0);
      return () => window.clearTimeout(id);
    }
  }, [ui.boss?.phase, firstBossSeen]);
  const buyUpgrade = useCallback(
    (id: string) => {
      const def = upgradeById(
        id as
          "coin-magnet" | "coin-value" | "score-multiplier" | "combo-window" | "shield-duration",
      );
      if (!def) return;
      const currentLevel = profile.ownedUpgrades[id] ?? 0;
      if (currentLevel >= def.maxLevel) return;
      const cost = def.costAtLevel(currentLevel + 1);
      if (profile.walletCoins < cost) return;
      const spend = spendCoins(cost);
      if (!spend.ok) return;
      setUpgradeLevel(id, currentLevel + 1);
      sounds.play("purchase");
      refreshProfile();
    },
    [profile, refreshProfile],
  );

  const togglePause = useCallback(() => {
    const g = gameRefs.current;
    if (pauseRun(g)) {
      setUi((u) => ({ ...u, status: "paused" }));
    } else if (resumeRun(g)) {
      setUi((u) => ({ ...u, status: "playing" }));
    }
  }, []);

  // Auto-pause when the tab is hidden: RAF freezes but the wall clock does
  // not, so without this a backgrounded run silently burned power-ups and
  // inflated the survival timer. Resume stays manual (player input).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (pauseRun(gameRefs.current)) {
        setUi((u) => ({ ...u, status: "paused" }));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Same pause path for a window that lost focus and for an embed scrolled
  // mostly off-screen (the home page), so a run never plays itself unwatched.
  // Never auto-resumes.
  const inViewRef = useRef(true);
  useEffect(() => {
    const el = containerRef.current;
    const pauseIfRunning = () => {
      if (pauseRun(gameRefs.current)) {
        setUi((u) => ({ ...u, status: "paused" }));
      }
    };
    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          inViewRef.current = entry.isIntersecting && entry.intersectionRatio >= 0.35;
          if (!inViewRef.current) pauseIfRunning();
        },
        { threshold: [0, 0.35, 1] },
      );
      io.observe(el);
    }
    window.addEventListener("blur", pauseIfRunning);
    return () => {
      io?.disconnect();
      window.removeEventListener("blur", pauseIfRunning);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      // silent-ok: fullscreen request denied by the user or unsupported; the game still renders windowed
      el.requestFullscreen?.().catch(() => void 0);
    } else {
      void document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const isTouch = useMemo<boolean>(() => {
    if (typeof window === "undefined") return false;
    return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  }, []);
  // The scene is space: it renders the dark biome palette whatever the site
  // theme is.

  // sync sound manager with React state
  useEffect(() => {
    sounds.setEnabled(soundEnabled);
  }, [soundEnabled]);
  // granular prefs → SoundManager (music toggle + SFX toggle)
  useEffect(() => {
    sounds.setMusicEnabled(prefs.musicEnabled);
    sounds.setSfxEnabled(prefs.sfxEnabled);
  }, [prefs.musicEnabled, prefs.sfxEnabled]);
  // Auto-stop recording when the player dies
  useEffect(() => {
    if (ui.status === "dying" && isRecording) {
      const id = window.setTimeout(() => stopRecording(), 0);
      return () => window.clearTimeout(id);
    }
  }, [ui.status, isRecording, stopRecording]);
  // Shop + settings must never cover active gameplay. Close when status leaves
  // armed/dead so a menu opened on idle doesn't linger into a run.
  useEffect(() => {
    if (ui.status === "playing" || ui.status === "dying") {
      const id = window.setTimeout(() => {
        if (shopOpen) setShopOpen(false);
        if (settingsOpen) setSettingsOpen(false);
        if (achievementsOpen) setAchievementsOpen(false);
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [ui.status, shopOpen, settingsOpen, achievementsOpen]);
  // Escape closes whichever full-panel overlay is open.
  const panelOpen = shopOpen || achievementsOpen || settingsOpen;
  useEffect(() => {
    if (!panelOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShopOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [panelOpen]);
  const counting = countStep !== null;
  // Opening a panel, leaving the armed screen (e.g. Play pressed) or pressing
  // Escape cancels the countdown and leaves the armed screen as it was.
  useEffect(() => {
    if (!counting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelCountdown();
    };
    window.addEventListener("keydown", onKey);
    let id = 0;
    if (panelOpen || ui.status !== "armed") id = window.setTimeout(cancelCountdown, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(id);
    };
  }, [counting, panelOpen, ui.status, cancelCountdown]);
  // Dev-only FPS overlay: sample raf-delta each frame, keep a smoothed value
  const [devFps, setDevFps] = useState(60);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    let raf = 0;
    let last = performance.now();
    let ema = 60;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (dt > 0) ema = ema * 0.92 + (1000 / dt) * 0.08;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const poll = setInterval(() => setDevFps(Math.round(ema)), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(poll);
    };
  }, []);
  // Screen wake lock while actively playing (mobile); release when not
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    type WakeLockSentinel = { release: () => Promise<void> };
    type WakeLockAPI = { request: (t: "screen") => Promise<WakeLockSentinel> };
    const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
    if (!nav.wakeLock || ui.status !== "playing") return;
    let lock: WakeLockSentinel | null = null;
    void (async () => {
      try {
        lock = await nav.wakeLock!.request("screen");
      } catch {
        // silent-ok: wake-lock request commonly rejected or unsupported; the screen just won't stay awake during play
      }
    })();
    return () => {
      try {
        void lock?.release();
      } catch {
        // silent-ok: releasing an already-released wake lock throws; the lock is torn down with the page regardless
      }
    };
  }, [ui.status]);
  // Haptic feedback on damage / boss defeat
  useEffect(() => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (prefs.reducedMotion) return;
    if (ui.status === "dying")
      (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate([
        60, 30, 60,
      ]);
  }, [ui.status, prefs.reducedMotion]);

  const env = useMemo(() => envForTime(ui.seconds), [ui.seconds]);

  const onUiSync = useCallback(() => {
    const g = gameRefs.current;
    const now = performance.now();
    setUi(createUiStateFromGame(g, now));
    setTick((t) => (t + 1) % 1_000_000);
  }, []);

  const onDeath = useCallback(() => {
    try {
      const g = gameRefs.current;
      // Stop any sustained sound loops that might still be playing
      sounds.stopWarpLoop();
      g.warpActiveLast = false;
      // Losing jingle was played at collision; give it ~1s before crossfading
      // into the leaderboard track so the two don't talk over each other.
      setTimeout(() => sounds.startLeaderboardMusic(), 1100);
      // Persist everything that compounds across runs.
      addCoins(g.coinsThisRun);
      addRunStats({ asteroidsDestroyed: g.kills, distance: Math.floor(g.distance) });
      incrementRunsPlayed();
      markFirstRunCompleted();
      // Bump totalBossesDefeated + evaluate achievements
      try {
        const p = loadProfile();
        p.totalBossesDefeated = (p.totalBossesDefeated ?? 0) + g.bossesDefeatedThisRun;
        saveProfile(p);
        const runSnapshot = {
          finalScore: Math.floor(g.score * g.scoreMultiplier),
          finalDistance: Math.floor(g.distance),
          finalCombo: g.combo,
          asteroidsDestroyed: g.kills,
          bossesDefeated: g.bossesDefeatedThisRun,
          runSurvivalSeconds: Math.floor(((g.dyingAt || performance.now()) - g.startedAt) / 1000),
          peakCombo: g.comboPeak,
          coinsCollectedThisRun: g.coinsThisRun,
          damageTakenThisRun: g.damageTakenThisRun,
        };
        const fresh = loadProfile();
        const earned = checkAchievements(fresh, runSnapshot);
        if (earned.length > 0) {
          grantAchievements(earned);
          setAchievementToasts((t) => [
            ...t,
            ...earned.map((a) => ({ ...a, firedAt: Date.now() })),
          ]);
        }
      } catch {
        // silent-ok: best-effort profile/localStorage persistence for boss-defeat stats and achievement grants; must not block the death screen
      }
      const final = Math.floor(g.score * g.scoreMultiplier);
      // Compare against the current state value synchronously so the celebration
      // flag is correct in the same render cycle.
      setPreviousBest(hasStoredBest ? highScore : null);
      const bestKind = personalBestKind(final, hasStoredBest ? highScore : null);
      if (bestKind !== null) {
        safeLocalSet(HS_KEY, String(final));
        setHighScore(final);
        setHasStoredBest(true);
      }
      setUi((u) => ({
        ...u,
        status: "dead",
        score: final,
        coinsThisRun: g.coinsThisRun,
        coinPickups: g.coinPickupsThisRun,
        coinBoostBonus: g.coinBoostBonusThisRun,
        kills: g.kills,
        distance: Math.floor(g.distance),
      }));
      setSubmitted(false);
      setRejected(false);
      setCelebration(bestKind === "first" ? "first" : bestKind === "best" ? "personal" : null);
      void refreshLeaderboard();
      refreshProfile();
    } catch (err) {
      const crash = gameCrashToReport("space-shooter", err);
      if (crash) reportError(crash);
      setCrashed(true);
    }
  }, [highScore, hasStoredBest, refreshProfile, refreshLeaderboard]);

  // "Fly again" — reset everything to the armed state. The next mouse/touch
  // /key press starts a fresh run.
  const launch = useCallback(() => {
    const g = gameRefs.current;
    resetToArmed(g);
    sounds.stopWarpLoop();
    // Stop the leaderboard track playing on the death overlay; gameplay
    // music will start on the next first-input via startRun().
    sounds.stopMusic(0.4);
    setUi(createInitialUiState());
    setSubmitted(false);
    setRejected(false);
    setCelebration(null);
    setShowInstructions(true);
  }, []);

  // "Fly again" button: reset, then count 3-2-1 and start the run on its own.
  // Only this explicit tap starts the countdown; a paused run never resumes
  // itself (DESIGN.md).
  const flyAgain = useCallback(() => {
    launch();
    beginCountdown();
  }, [launch, beginCountdown]);

  // (Game auto-starts because createRefs() initializes startedAt = now and
  // status = "playing"; no mount-effect needed, which keeps the
  // react-hooks/set-state-in-effect rule happy.)

  // Hide instructions after 6s
  useEffect(() => {
    if (!showInstructions) return;
    const t = setTimeout(() => setShowInstructions(false), 6000);
    return () => clearTimeout(t);
  }, [showInstructions]);

  const submit = useCallback(async () => {
    // In-flight guard: the button is disabled via `submitting`, but guard here
    // too so a queued second click can't double-post the same run.
    if (submitting || submitted || rejected) return;
    setSubmitting(true);
    try {
      const trimmed = name.trim().slice(0, 12) || "Pilot";
      safeLocalSet(NAME_KEY, trimmed);
      // The hook floors every number and sends only this game's detail keys.
      const result = await submitScoreToLeaderboard({
        name: trimmed,
        score: ui.score,
        seconds: ui.seconds,
        kills: ui.kills,
        distance: ui.distance,
      });
      if (result.ok) {
        setSubmitted(true);
        await refreshLeaderboard();
        // World record overrides personal best celebration. result.rank is the rank of the
        // player's best, not of this run, so it must come with an improved all-time board.
        if (isWorldRecord(result.boards, ui.score)) {
          setCelebration("world");
        }
      } else if (result.rejected) {
        setRejected(true);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    submitted,
    rejected,
    name,
    ui.score,
    ui.seconds,
    ui.kills,
    ui.distance,
    submitScoreToLeaderboard,
    refreshLeaderboard,
  ]);

  // Sound toggle persistence
  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      // Persist explicit choice; "1" = on, "0" = off (default-on if missing)
      safeLocalSet(SOUND_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Pointer/touch/keyboard input
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Resume AudioContext on ANY interaction — Chrome requires a user gesture
    // but pointermove alone may not qualify. Pointerdown/touchstart always do.
    const ensureAudio = () => sounds.ensure();

    const updateTarget = (clientX: number, clientY: number) => {
      const g = gameRefs.current;
      if (g.status !== "armed" && g.status !== "playing") return;
      const rect = el.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      g.targetX = nx * (ARENA_W / 2);
      g.targetY = ny * (ARENA_H / 2);
    };

    // Input no longer auto-starts the run — the player must explicitly click
    // PLAY. A paused game resumes only via a deliberate gesture: the pause
    // overlay (click/tap anywhere on it), the header pause button, or a
    // movement key. Canvas pointer/touch input must NOT resume — it raced
    // the overlay's own click handler, re-pausing in the same gesture.
    const tryUnpause = () => {
      resumeRun(gameRefs.current);
    };

    const onMove = (e: PointerEvent) => {
      ensureAudio();
      updateTarget(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      ensureAudio();
      updateTarget(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Only steering touches are claimed; a tap on a button must keep its
      // synthesized click (PLAY, SHOP, TROPHIES, FLY AGAIN).
      const phase = e.type === "touchmove" ? "move" : "start";
      if (shouldCaptureTouch(e.target, gameRefs.current.status, phase)) e.preventDefault();
      ensureAudio();
      updateTarget(touch.clientX, touch.clientY);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("touchmove", onTouch, { passive: false });
    el.addEventListener("touchstart", onTouch, { passive: false });

    // Mobile dash: a tap landing FAR from the ship's current screen position
    // triggers a dash toward that tap. Tapping near the ship just steers.
    const onFarTap = (e: TouchEvent) => {
      const touch = e.touches[0] ?? e.changedTouches[0];
      if (!touch) return;
      const rect = el.getBoundingClientRect();
      const g = gameRefs.current;
      // Map the tap's X into world-arena X using the same math updateTarget uses
      const nx = (touch.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const tapWorldX = nx * (ARENA_W / 2);
      const dxWorld = tapWorldX - g.shipX;
      // "Far" threshold: > 35% of the arena half-width
      const farThreshold = (ARENA_W / 2) * 0.35;
      if (Math.abs(dxWorld) < farThreshold) return;
      const dir: "left" | "right" = dxWorld < 0 ? "left" : "right";
      const now = performance.now();
      // Bypass the double-tap window by priming the last-tap slot
      if (dir === "left") g.dash.lastLeftTapAt = now;
      else g.dash.lastRightTapAt = now;
      tryDash(g, dir, now + 10);
    };
    el.addEventListener("touchstart", onFarTap, { passive: true });

    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Dev hotkey: Shift+B cycles through bosses at current position
      if (process.env.NODE_ENV !== "production" && e.shiftKey && k === "b") {
        e.preventDefault();
        const bossIds: BossId[] = [
          "sentinel",
          "drifter",
          "swarm-mother",
          "mirror",
          "pulsar",
          "harvester",
          "warden",
          "void-tyrant",
        ];
        const g = gameRefs.current;
        const currentIdx = g.boss ? bossIds.indexOf(g.boss.id) : -1;
        const nextIdx = (currentIdx + 1) % bossIds.length;
        g.boss = null;
        g.bossProjectiles.length = 0;
        // nextIdx is always a valid modulo of bossIds.length; fallback never fires.
        spawnBoss(g, bossIds[nextIdx] ?? "sentinel", 0);
        return;
      }
      // Keys typed into a text field (the AI chat, the pilot name box) belong
      // to that field: they neither steer, resume nor get swallowed.
      const target = e.target;
      const runLive = gameRefs.current.status === "playing" || gameRefs.current.status === "paused";
      const d = orbitalKeyDecision({
        key: k,
        textEntry: isTextEntryTarget(e),
        onControl: target instanceof Element && target.closest("button, a") !== null,
        runLive,
        inView: inViewRef.current,
      });
      if (d.ignore) return;
      if (d.preventDefault) e.preventDefault();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(k)) {
        // Keydown is a user gesture too — resume a suspended AudioContext so
        // keyboard-only players are not stuck in silence until a mouse move.
        ensureAudio();
        tryUnpause();
      }
      // Dash: double-tap A / ArrowLeft or D / ArrowRight
      if ((k === "a" || k === "arrowleft") && !keys.has(k)) {
        tryDash(gameRefs.current, "left", performance.now());
      }
      if ((k === "d" || k === "arrowright") && !keys.has(k)) {
        tryDash(gameRefs.current, "right", performance.now());
      }
      keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    // Flush held keys when focus leaves — a keyup lost to Alt-Tab or a tab
    // switch would otherwise leave the ship strafing forever.
    const clearKeys = () => keys.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);

    let raf = 0;
    let lastFrameAt = performance.now();
    const loop = (frameAt: number) => {
      try {
        const g = gameRefs.current;
        const dtSeconds = (frameAt - lastFrameAt) / 1000;
        lastFrameAt = frameAt;
        if (g.status === "playing") {
          const speed = keyboardStep(dtSeconds);
          let dx = 0;
          let dy = 0;
          if (keys.has("arrowleft") || keys.has("a")) dx -= speed;
          if (keys.has("arrowright") || keys.has("d")) dx += speed;
          if (keys.has("arrowup") || keys.has("w")) dy += speed;
          if (keys.has("arrowdown") || keys.has("s")) dy -= speed;
          g.targetX += dx;
          g.targetY += dy;
        }
        raf = requestAnimationFrame(loop);
      } catch (err) {
        // No cancel needed: not rescheduling here is what stops the loop.
        const crash = gameCrashToReport("space-shooter", err);
        if (crash) reportError(crash);
        setCrashed(true);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchstart", onFarTap);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      cancelAnimationFrame(raf);
    };
  }, []);

  const layout = canvasLayout(variant, isFullscreen);

  return (
    <div>
      {/* 3D Canvas — responsive across mobile / 16:9 / 21:9 with a cap so
          super-ultrawide viewports get letterboxed instead of giving the
          player extra play area. Fullscreen mode fills the screen.
          touch-none is only applied while the game is consuming touches;
          during dead/dying we allow normal touch so the death overlay's
          Fly Again button is tappable on mobile fullscreen. */}
      <div
        ref={containerRef}
        className={`relative mx-auto overflow-hidden rounded-xl border border-(--border) ${
          ui.status === "playing" || ui.status === "paused" ? "touch-none" : "touch-auto"
        } ${layout.sizeClass}`}
        style={{
          background: env.bg,
          cursor: ui.status === "playing" ? "none" : "default",
          // Cap so 16:1 monitors letterbox at ~21:9, AND cap mobile portrait
          // height so the canvas doesn't dominate the viewport on tall phones.
          maxWidth: isFullscreen ? "100vw" : "min(100%, calc(100vh * 21 / 9))",
          maxHeight: layout.maxHeight,
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 5], fov: 60 }}
          dpr={[1, 1.6]}
          performance={{ min: 0.5 }}
          gl={{ preserveDrawingBuffer: true }}
        >
          <Scene
            gameRefs={gameRefs}
            onDeath={onDeath}
            onUiSync={onUiSync}
            env={env}
            tick={tick}
            shipId={profile.equippedShip}
          />
          <PostFx enabled={prefs.bloomEnabled} intensity={prefs.reducedMotion ? 0.5 : 1.0} />
        </Canvas>

        {/* ===== In-canvas HUD — lives inside the 3D viewport =====
             Also renders on dead screen when the shop or trophies modal is open
             so their buttons in the overlays can actually show the panel. */}
        {(ui.status === "playing" || ui.status === "paused" || shopOpen || achievementsOpen) && (
          <>
            {/* Top-left: score + distance + kills — styled to match game aesthetic */}
            {/* Shop modal — only reachable for returning players */}
            <ShopPanel
              shopOpen={shopOpen}
              setShopOpen={setShopOpen}
              shopTab={shopTab}
              setShopTab={setShopTab}
              profile={profile}
              buyUpgrade={buyUpgrade}
              refreshProfile={refreshProfile}
            />

            {/* Achievements modal — separate surface from shop so progress
                and spending are not conflated. */}
            <TrophiesPanel
              achievementsOpen={achievementsOpen}
              setAchievementsOpen={setAchievementsOpen}
              profile={profile}
            />

            {ui.status === "playing" && <RunBanner startedAt={0} now={ui.seconds * 1000} />}

            {/* The run HUD shows only during a run, never behind a modal on the
                armed or dead screen. */}
            {(ui.status === "playing" || ui.status === "paused") && <RunHud ui={ui} />}

            {/* Top-right: best + controls (pause / mute / fullscreen) */}
            {!shopOpen && !achievementsOpen && (
              <TopControls
                ui={ui}
                highScore={highScore}
                togglePause={togglePause}
                soundEnabled={soundEnabled}
                toggleSound={toggleSound}
                isFullscreen={isFullscreen}
                toggleFullscreen={toggleFullscreen}
              />
            )}

            {/* Biome label — bottom center */}
            {(ui.status === "playing" || ui.status === "paused") && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[10px] tracking-widest text-white/40 uppercase">
                <span className="h-1 w-1 animate-pulse rounded-full bg-accent-blue/60" />
                {env.name}
              </div>
            )}
          </>
        )}

        {/* Fly Again 3-2-1: over the armed screen, outside the run-only HUD above. */}
        <CountdownOverlay step={countStep} status={ui.status} panelOpen={panelOpen} />

        {/* Pulsing instruction overlay — anchored low so the ship in the
            centre of the canvas stays visible behind it. */}
        {/* Pause overlay */}
        <PauseOverlay ui={ui} togglePause={togglePause} />

        {/* Achievement toasts */}
        {achievementToasts.length > 0 && (
          <AchievementToasts achievementToasts={achievementToasts} />
        )}

        {/* Dev-only FPS + object counts */}
        {process.env.NODE_ENV !== "production" && (
          <div className="absolute top-3 left-1/2 z-30 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
            {devFps} fps · obs {ui.objectCounts.obstacles} · proj {ui.objectCounts.bossProjectiles}{" "}
            · exp {ui.objectCounts.explosions}
          </div>
        )}

        {/* Dash cooldown indicator (playing only) */}
        {ui.status === "playing" && (
          <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2">
            <div className="text-[10px] tracking-[0.2em] text-slate-400">DASH</div>
            <div className="h-1.5 w-16 overflow-hidden rounded bg-black/40">
              <div
                className={`h-full transition-[width] duration-100 ${ui.dashCooldown.onCooldown ? "bg-slate-400" : "bg-cyan-400"}`}
                style={{ width: `${ui.dashCooldown.pct * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Record toggle (armed only). Top-left so it never sits over the
            bottom-anchored hint line. */}
        {ui.status === "armed" && !panelOpen && (
          <button
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            className="absolute top-3 left-3 z-30 flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-black/50 px-3 text-xs text-white hover:bg-black/70"
            type="button"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${isRecording ? "animate-pulse bg-red-500" : "bg-white/50"}`}
            />
            {isRecording ? "Stop" : "Record"}
          </button>
        )}
        {/* Settings gear (idle or dead only) */}
        {(ui.status === "armed" || ui.status === "dead") && !panelOpen && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-3 right-3 z-30 flex h-11 w-11 items-center justify-center rounded border border-white/20 bg-black/40 text-white transition hover:bg-black/60"
            aria-label="Settings"
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        {settingsOpen && (
          <SettingsPanel
            prefs={prefs}
            setPrefs={setPrefs}
            setSettingsOpen={setSettingsOpen}
            gyroSupported={gyroSupported}
            gyroPermission={gyroPermission}
            requestGyroPermission={requestGyroPermission}
          />
        )}

        {/* Boss intro banner */}
        <BossBanners ui={ui} firstBossSeen={firstBossSeen} />

        {/* Armed instructions: first-timer sees the pulsing pill; returning player sees Play/Shop buttons */}
        <ArmedMenu
          ui={ui}
          gameRefs={gameRefs}
          profile={profile}
          isReturningPlayer={isReturningPlayer}
          isTouch={isTouch}
          panelOpen={panelOpen}
          setShopOpen={setShopOpen}
          setAchievementsOpen={setAchievementsOpen}
        />

        {/* Death overlay with leaderboard */}
        <DeathOverlay
          ui={ui}
          panelOpen={panelOpen}
          celebration={celebration}
          PERSONAL_CONFETTI={PERSONAL_CONFETTI}
          WORLD_CONFETTI={WORLD_CONFETTI}
          goals={goals}
          prefs={prefs}
          name={name}
          setName={setName}
          submit={submit}
          submitted={submitted}
          submitting={submitting}
          rejected={rejected}
          boardPeriod={boardPeriod}
          setBoardPeriod={setBoardPeriod}
          boardLoading={boardLoading}
          boardError={boardError}
          leaderboard={leaderboard}
          leaderboardYou={leaderboardYou}
          flyAgain={flyAgain}
          isReturningPlayer={isReturningPlayer}
          setShopOpen={setShopOpen}
          recordingBlob={recordingBlob}
          captureShareImage={captureShareImage}
        />

        {/* Crash overlay — a game-loop or death-handler throw stopped play;
            reload is the honest recovery (a "retry" that reruns the same
            crashing frame could re-crash). Reuses the death overlay's classes. */}
        {crashed && <CrashOverlay />}
      </div>

      <p className="text-xs text-(--muted)">{SHOOTER_CAPTION}</p>
    </div>
  );
}
