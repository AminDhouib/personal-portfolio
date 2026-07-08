"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Rocket,
  Trophy,
  Shield,
  RotateCcw,
  Send,
  Volume2,
  VolumeX,
  Crosshair,
  Zap,
  Target,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ShoppingCart,
  Magnet,
  Coins as CoinsIcon,
  X as XIcon,
  Share2,
} from "lucide-react";
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
import { UPGRADES, upgradeById, SHIPS, CONSUMABLES, COSMETICS } from "./shop-data";
import {
  ShipPreview,
  UpgradePreview,
  ConsumablePreview,
  CosmeticPreview,
} from "./space-shooter/shop-previews";
import { PostFx } from "./post-fx";
import {
  ACHIEVEMENTS,
  checkAchievements,
  grantAchievements,
  type Achievement,
} from "./achievements";
import {
  type GameStatus,
  type PowerUpType,
  type BossId,
  type BossPhase,
  type GameRefs,
  ARENA_W,
  ARENA_H,
  POWERUP_DURATION_MS,
  ENVIRONMENTS,
  INVERTED_ARMED_ENV,
  envForTime,
  POWERUP_DEFS,
  tryDash,
} from "./space-shooter/types";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { gameCrashToReport } from "@/lib/report-game-error";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { comboColor } from "./space-shooter/difficulty";
import { sounds } from "./space-shooter/sound-manager";
import { buildBossSchedule, BOSS_DISPLAY_NAMES, spawnBoss } from "./space-shooter/boss-behaviors";
import { pickNextBiomeDistance, createRefs, startRun } from "./space-shooter/run-init";
import { Scene } from "./space-shooter/scene-components";

// ---------- constants ----------

const HS_KEY = "space-shooter-hs";
const NAME_KEY = "space-shooter-name";
const SOUND_KEY = "space-shooter-sound";

// ---------- UI helpers ----------

function SettingsToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-slate-200">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
        aria-pressed={checked}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

// ---------- leaderboard helpers ----------
// fetchLeaderboard/submitScore moved to useLeaderboard("space-shooter")
// (RC-8, CT-006); the hook injects `game`, while the submit call site below
// still passes level:1 itself (legacy shape so the route validates the old field).

// Detect the player's country/region for the leaderboard. Free, no API key
// required. Falls back to "" silently if blocked.
async function detectRegion(): Promise<string> {
  try {
    const r = await fetch("https://ipapi.co/json/", {
      cache: "force-cache",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return "";
    const j = await r.json();
    if (typeof j?.country_name === "string" && j.country_name) return j.country_name;
    if (typeof j?.country_code === "string") return j.country_code;
  } catch {
    // silent-ok: region/geo lookup is best-effort; the leaderboard just omits the region on failure
  }
  return "";
}

// ---------- main component ----------

interface UiState {
  status: GameStatus;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  combo: number;
  comboPeak: number;
  coinsThisRun: number;
  active: { type: PowerUpType; remainingMs: number }[];
  objectCounts: {
    obstacles: number;
    bossProjectiles: number;
    explosions: number;
  };
  dashCooldown: {
    pct: number;
    onCooldown: boolean;
  };
  boss: {
    id: BossId;
    phase: BossPhase;
    hpPct: number;
    hasDrone: boolean;
  } | null;
  bossesDefeatedThisRun: number;
}

type CelebrationKind = "personal" | "world" | null;

const DEFAULT_SPACE_SHOOTER_PREFS = {
  reducedMotion: false,
  gyroEnabled: false,
  bloomEnabled: true,
  musicEnabled: true,
  sfxEnabled: true,
};

type SpaceShooterPrefs = typeof DEFAULT_SPACE_SHOOTER_PREFS;

// Deterministic confetti pieces — angle + distance per piece, no Math.random
// during render (would trip react-hooks/purity).
function buildConfetti(count: number, dist: number) {
  const colors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899", "#22d3ee"];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 4) * 0.3;
    const d = dist * (0.7 + (i % 5) * 0.12);
    return {
      id: i,
      dx: Math.cos(angle) * d,
      dy: Math.sin(angle) * d - 80,
      rot: (i * 53) % 360,
      color: colors[i % colors.length],
    };
  });
}

function createInitialUiState(): UiState {
  return {
    status: "armed",
    score: 0,
    seconds: 0,
    kills: 0,
    distance: 0,
    combo: 1,
    comboPeak: 1,
    coinsThisRun: 0,
    active: [],
    objectCounts: { obstacles: 0, bossProjectiles: 0, explosions: 0 },
    dashCooldown: { pct: 1, onCooldown: false },
    boss: null,
    bossesDefeatedThisRun: 0,
  };
}

function createUiStateFromGame(g: GameRefs, now: number): UiState {
  let seconds = 0;
  if (g.startedAt > 0) {
    if (g.status === "dying" || g.status === "dead") {
      seconds = ((g.dyingAt || now) - g.startedAt) / 1000;
    } else {
      seconds = (now - g.startedAt) / 1000;
    }
  }

  const onCooldown = now < g.dash.cooldownUntil;
  const boss = g.boss;

  return {
    status: g.status,
    score: Math.floor(g.score),
    seconds,
    kills: g.kills,
    distance: Math.floor(g.distance),
    combo: g.combo,
    comboPeak: g.comboPeak,
    coinsThisRun: g.coinsThisRun,
    active: g.activePowerUps.map((p) => ({
      type: p.type,
      remainingMs: Math.max(0, p.expiresAt - now),
    })),
    objectCounts: {
      obstacles: g.obstacles.length,
      bossProjectiles: g.bossProjectiles.length,
      explosions: g.explosions.length,
    },
    dashCooldown: {
      pct: onCooldown ? Math.max(0, 1 - (g.dash.cooldownUntil - now) / 2000) : 1,
      onCooldown,
    },
    boss: boss
      ? {
          id: boss.id,
          phase: boss.phase,
          hpPct: Math.max(0, (boss.hp / boss.hpMax) * 100),
          hasDrone: boss.subEntities.some((s) => s.type === "drone"),
        }
      : null,
    bossesDefeatedThisRun: g.bossesDefeatedThisRun,
  };
}

function loadInitialPrefs(): SpaceShooterPrefs {
  const prefs: SpaceShooterPrefs = { ...DEFAULT_SPACE_SHOOTER_PREFS };

  try {
    const profile = loadProfile();
    if (profile.preferences) {
      return { ...prefs, ...profile.preferences };
    }

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("orbital-dodge-prefs");
      if (raw) {
        const parsed = safeJsonParse<Partial<SpaceShooterPrefs>>(raw, "space-shooter:prefs");
        if (parsed) return { ...prefs, ...parsed };
        return prefs;
      }

      const osReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (osReduced) return { ...prefs, reducedMotion: true };
    }
  } catch {
    // silent-ok: best-effort profile/localStorage read; fall back to default prefs
  }

  return prefs;
}

function detectGyroSupported() {
  if (typeof window === "undefined") return false;
  const hasOrientation = "DeviceOrientationEvent" in window;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return hasOrientation && isMobile;
}

export function SpaceShooterGame() {
  const gameRefs = useRef<GameRefs>(createRefs());
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [ui, setUi] = useState<UiState>(createInitialUiState);
  const [celebration, setCelebration] = useState<CelebrationKind>(null);
  const [crashed, setCrashed] = useState(false);
  const [region, setRegion] = useState<string>("");
  const PERSONAL_CONFETTI = useMemo(() => buildConfetti(28, 220), []);
  const WORLD_CONFETTI = useMemo(() => buildConfetti(60, 360), []);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem(HS_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(NAME_KEY) ?? "";
  });
  const [submitted, setSubmitted] = useState(false);
  // fetchOnMount:true preserves the pre-existing mount-time fetch (below,
  // "Initial leaderboard load + region detection"); bucket unchanged from
  // before (space-shooter keeps sending game:"space-shooter", so the
  // merged-legacy board is preserved per the ruling).
  const {
    entries: leaderboard,
    refresh: refreshLeaderboard,
    submit: submitScoreToLeaderboard,
  } = useLeaderboard("space-shooter");
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    // Sound is ON by default — but localStorage "0" persists explicit mute.
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  });
  useEffect(
    () => () => {
      sounds.destroy();
    },
    [],
  );
  const [showInstructions, setShowInstructions] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [shopTab, setShopTab] = useState<
    "upgrades" | "consumables" | "ships" | "cosmetics" | "missions" | "achievements"
  >("upgrades");
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
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
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
    if (r && r.state !== "inactive") r.stop();
    setIsRecording(false);
  }, []);
  const captureShareImage = useCallback(
    async (stats: { score: number; distance: number; kills: number }): Promise<Blob | null> => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) return null;
      const w = 1200,
        h = 630;
      const outCanvas = document.createElement("canvas");
      outCanvas.width = w;
      outCanvas.height = h;
      const ctx = outCanvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 64px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ORBITAL DODGE", w / 2, 120);
      ctx.font = "36px system-ui";
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(`Score: ${stats.score.toLocaleString()}`, w / 2, 280);
      ctx.fillText(`Distance: ${stats.distance}m`, w / 2, 340);
      ctx.fillText(`Kills: ${stats.kills}`, w / 2, 400);
      ctx.font = "20px system-ui";
      ctx.fillStyle = "#64748b";
      ctx.fillText("amindhouib.ca/games", w / 2, 580);
      return new Promise((resolve) => outCanvas.toBlob((b) => resolve(b), "image/png"));
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
  // Tutorial removed — players learn the game by playing it.
  // Save on change + mirror to gameRefs for per-frame access
  useEffect(() => {
    try {
      const p = loadProfile();
      p.preferences = { ...p.preferences, ...prefs };
      saveProfile(p);
    } catch {
      // silent-ok: best-effort settings persistence via the profile store; fall back to a plain localStorage write
      try {
        localStorage.setItem("orbital-dodge-prefs", JSON.stringify(prefs));
      } catch {
        // silent-ok: localStorage may be unavailable (private browsing/quota); in-session settings still apply
      }
    }
    gameRefs.current.prefs = { ...prefs };
  }, [prefs]);
  // Persist "first boss seen" flag when boss enters fighting phase
  useEffect(() => {
    if (firstBossSeen) return;
    if (ui.boss?.phase === "fighting") {
      try {
        window.localStorage.setItem("orbital-dodge-first-boss-seen", "1");
      } catch {
        // silent-ok: best-effort localStorage write for the first-boss-seen flag; in-session React state still updates below
      }
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
    if (g.status === "playing") {
      g.status = "paused";
      sounds.stopMusic(0.3);
      setUi((u) => ({ ...u, status: "paused" }));
    } else if (g.status === "paused") {
      g.status = "playing";
      sounds.startGameplayMusic();
      setUi((u) => ({ ...u, status: "playing" }));
    }
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
  const { resolvedTheme } = useTheme();
  const invertedArmed = resolvedTheme === "light" && ui.status === "armed";
  // Mirror to gameRefs so runTick can pick the right color target each frame.
  useEffect(() => {
    gameRefs.current.invertedArmed = invertedArmed;
  }, [invertedArmed]);

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
      // Update mission progress using this run's stats (max-of so multi-run peaks count)
      try {
        const p = loadProfile();
        const seconds = Math.floor(((g.dyingAt || performance.now()) - g.startedAt) / 1000);
        for (const m of p.missionsToday) {
          if (m.claimed) continue;
          // Bump by the greater of existing progress and this run's stat
          const nextVal =
            m.id === "kill-20-heavies"
              ? Math.max(m.progress, g.kills)
              : m.id === "kill-50"
                ? Math.max(m.progress, g.kills)
                : m.id === "reach-2km"
                  ? Math.max(m.progress, Math.floor(g.distance))
                  : m.id === "reach-5km"
                    ? Math.max(m.progress, Math.floor(g.distance))
                    : m.id === "score-5k"
                      ? Math.max(m.progress, Math.floor(g.score))
                      : m.id === "score-10k"
                        ? Math.max(m.progress, Math.floor(g.score))
                        : m.id === "survive-180-clean"
                          ? Math.max(m.progress, seconds)
                          : m.progress;
          m.progress = nextVal;
        }
        saveProfile(p);
      } catch {
        // silent-ok: best-effort profile/localStorage persistence for daily mission progress; must not block the death screen
      }
      const final = Math.floor(g.score * g.scoreMultiplier);
      // Compare against the current state value synchronously so the celebration
      // flag is correct in the same render cycle.
      const isPersonalBest = final > highScore && final > 0;
      if (isPersonalBest) {
        safeLocalSet(HS_KEY, String(final));
        setHighScore(final);
      }
      setUi((u) => ({
        ...u,
        status: "dead",
        score: final,
        kills: g.kills,
        distance: Math.floor(g.distance),
      }));
      setSubmitted(false);
      setCelebration(isPersonalBest ? "personal" : null);
      void refreshLeaderboard();
      refreshProfile();
    } catch (err) {
      const crash = gameCrashToReport("space-shooter", err);
      if (crash) reportError(crash);
      setCrashed(true);
    }
  }, [highScore, refreshProfile, refreshLeaderboard]);

  // "Fly again" — reset everything to the armed state. The next mouse/touch
  // /key press starts a fresh run.
  const launch = useCallback(() => {
    const g = gameRefs.current;
    g.status = "armed";
    g.score = 0;
    g.kills = 0;
    g.distance = 0;
    g.combo = 1;
    g.comboLastAt = 0;
    g.comboPeak = 1;
    g.obstacles.length = 0;
    g.bullets.length = 0;
    g.explosions.length = 0;
    g.speedLines.length = 0;
    g.powerUps.length = 0;
    g.coins.length = 0;
    g.coinsThisRun = 0;
    g.boss = null;
    g.bossProjectiles.length = 0;
    g.bossSchedule = buildBossSchedule();
    g.bossScheduleIdx = 0;
    g.bossesDefeatedThisRun = 0;
    g.damageTakenThisRun = 0;
    g.normalSpawningPausedUntil = 0;
    g.activePowerUps.length = 0;
    g.debris.length = 0;
    g.scorePopups.length = 0;
    g.shieldActiveLast = false;
    g.warpActiveLast = false;
    g.warpIntensity = 0;
    g.currentEnv = ENVIRONMENTS[0];
    g.nextBiomeAt = pickNextBiomeDistance(0);
    sounds.stopWarpLoop();
    // Stop the leaderboard track playing on the death overlay; gameplay
    // music will start on the next first-input via startRun().
    sounds.stopMusic(0.4);
    g.targetX = 0;
    g.targetY = 0;
    g.shipX = 0;
    g.shipY = 0;
    g.shipZ = 2;
    g.shipRotZ = 0;
    g.lastBullet = 0;
    g.lastSpawn = 0;
    g.lastPowerUpSpawn = 0;
    g.nextWallAt = 0;
    g.lastUiSync = 0;
    g.invulnUntil = 0;
    g.startedAt = 0;
    g.dyingAt = 0;
    g.shipFallSpeed = 0;
    g.deathVelX = 0;
    g.deathVelY = 0;
    g.deathVelZ = 0;
    g.deathAngVel = 0;
    g.cameraTargetX = 0;
    g.cameraTargetY = 0;
    g.cameraTargetZ = 5;
    setUi(createInitialUiState());
    setSubmitted(false);
    setCelebration(null);
    setShowInstructions(true);
  }, []);

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
    const trimmed = name.trim().slice(0, 12) || "Pilot";
    safeLocalSet(NAME_KEY, trimmed);
    const result = await submitScoreToLeaderboard({
      name: trimmed,
      score: ui.score,
      // keep legacy shape on `level` so the route validates the old field
      level: 1,
      seconds: Math.floor(ui.seconds),
      kills: ui.kills,
      distance: ui.distance,
      region,
    });
    if (result.ok) {
      setSubmitted(true);
      await refreshLeaderboard();
      // World record overrides personal best celebration
      if (result.rank === 1 && ui.score > 0) {
        setCelebration("world");
      }
    }
  }, [
    name,
    ui.score,
    ui.seconds,
    ui.kills,
    ui.distance,
    region,
    submitScoreToLeaderboard,
    refreshLeaderboard,
  ]);

  // Initial leaderboard load + region detection (useLeaderboard's
  // fetchOnMount:true default handles the leaderboard fetch)
  useEffect(() => {
    void detectRegion().then(setRegion);
  }, []);

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
    // PLAY. We still use this to unpause, though, so mouse/touch wake the
    // paused game.
    const tryUnpause = () => {
      const g = gameRefs.current;
      if (g.status === "paused") g.status = "playing";
    };

    const onMove = (e: PointerEvent) => {
      ensureAudio();
      tryUnpause();
      updateTarget(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      ensureAudio();
      tryUnpause();
      updateTarget(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      ensureAudio();
      tryUnpause();
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
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(k)) {
        if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
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
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const loop = () => {
      try {
        const g = gameRefs.current;
        if (g.status === "playing") {
          const speed = 0.14;
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
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf);
    };
  }, []);

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
        } ${
          isFullscreen
            ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-0"
            : "aspect-3/4 w-full sm:aspect-auto sm:h-115"
        }`}
        style={{
          background: invertedArmed ? INVERTED_ARMED_ENV.bg : env.bg,
          cursor: ui.status === "playing" ? "none" : "default",
          // Cap so 16:1 monitors letterbox at ~21:9, AND cap mobile portrait
          // height so the canvas doesn't dominate the viewport on tall phones.
          maxWidth: isFullscreen ? "100vw" : "min(100%, calc(100vh * 21 / 9))",
          maxHeight: isFullscreen ? "100vh" : "70vh",
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
             Also renders on dead screen when the shop modal is open so the
             Shop button in the death overlay can actually show the shop. */}
        {(ui.status === "playing" || ui.status === "paused" || shopOpen) && (
          <>
            {/* Top-left: score + distance + kills — styled to match game aesthetic */}
            {/* Shop modal — only reachable for returning players */}
            <AnimatePresence>
              {shopOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex flex-col bg-black/80 backdrop-blur-md"
                >
                  {/* Sticky header + tabs — always visible so the player can
                      navigate between sub-sections without being forced to
                      close the shop. */}
                  <div className="sticky top-0 z-20 border-b border-white/10 bg-black/85 px-4 pt-4 pb-2 backdrop-blur-md">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ShoppingCart className="h-5 w-5 text-accent-amber" />
                        <h3 className="text-lg font-bold text-white">Shop</h3>
                        <div className="flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/20 px-2 py-1 font-mono text-sm text-accent-amber">
                          <CoinsIcon className="h-3.5 w-3.5" />
                          {profile.walletCoins}
                        </div>
                      </div>
                      <button
                        onClick={() => setShopOpen(false)}
                        className="rounded-lg border border-white/20 bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                        aria-label="Close shop"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mx-auto flex w-full max-w-3xl items-center gap-1 overflow-x-auto">
                      {(["upgrades", "consumables", "ships", "cosmetics"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setShopTab(t)}
                          className={`rounded border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase ${
                            shopTab === t
                              ? "border-accent-blue/60 bg-accent-blue/25 text-white"
                              : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Scrollable tab body */}
                  <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                    {shopTab === "upgrades" && (
                      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                        {UPGRADES.map((u) => {
                          const level = profile.ownedUpgrades[u.id] ?? 0;
                          const maxed = level >= u.maxLevel;
                          const nextCost = maxed ? 0 : u.costAtLevel(level + 1);
                          const affordable = profile.walletCoins >= nextCost;
                          return (
                            <button
                              key={u.id}
                              onClick={() => !maxed && affordable && buyUpgrade(u.id)}
                              disabled={maxed || !affordable}
                              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                                maxed
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : affordable
                                    ? "border-accent-blue/50 bg-white/5 hover:bg-white/10"
                                    : "border-white/10 bg-white/5 opacity-50"
                              }`}
                            >
                              <UpgradePreview icon={u.iconKey} />
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex w-full items-center gap-2">
                                  <span className="flex-1 truncate font-semibold text-white">
                                    {u.label}
                                  </span>
                                  <div
                                    className="flex items-center gap-0.5"
                                    aria-label={`Level ${level} of ${u.maxLevel}`}
                                  >
                                    {Array.from({ length: u.maxLevel }).map((_, i) => (
                                      <span
                                        key={i}
                                        className={`h-1.5 w-2.5 rounded-sm ${
                                          i < level
                                            ? maxed
                                              ? "bg-emerald-400"
                                              : "bg-accent-blue"
                                            : "bg-white/15"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="text-xs text-white/70">{u.description}</div>
                                <div className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                                  {maxed ? (
                                    <span className="text-emerald-400">MAXED</span>
                                  ) : (
                                    <>
                                      <CoinsIcon className="h-3 w-3 text-accent-amber" />
                                      <span
                                        className={
                                          affordable ? "text-accent-amber" : "text-white/40"
                                        }
                                      >
                                        {nextCost}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {shopTab === "consumables" && (
                      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                        {CONSUMABLES.map((c) => {
                          const owned = profile.consumableInventory[c.id] ?? 0;
                          const affordable = profile.walletCoins >= c.cost;
                          return (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                            >
                              <ConsumablePreview icon={c.icon} />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-white">
                                  {c.label} <span className="text-xs text-slate-400">x{owned}</span>
                                </div>
                                <div className="text-xs text-slate-400">{c.description}</div>
                              </div>
                              <button
                                type="button"
                                disabled={!affordable}
                                onClick={() => {
                                  if (!affordable) return;
                                  const r = spendCoins(c.cost);
                                  if (r.ok) {
                                    const p = loadProfile();
                                    p.consumableInventory[c.id] =
                                      (p.consumableInventory[c.id] ?? 0) + 1;
                                    saveProfile(p);
                                    sounds.play("purchase");
                                    refreshProfile();
                                  }
                                }}
                                className={`rounded px-3 py-1.5 text-xs font-bold tracking-wide uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                              >
                                Buy · {c.cost}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {shopTab === "ships" && (
                      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                        {SHIPS.map((s) => {
                          const owned =
                            s.id === "falcon" || profile.ownedCosmetics.includes(`ship:${s.id}`);
                          const equipped = profile.equippedShip === s.id;
                          const affordable = profile.walletCoins >= s.unlockCost;
                          return (
                            <div
                              key={s.id}
                              className={`flex gap-3 rounded-lg border p-3 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                            >
                              <ShipPreview color={s.hullTint} shipId={s.id} />
                              <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-white">
                                    {s.label}
                                  </span>
                                  <span
                                    className="inline-block h-4 w-4 rounded border border-white/20"
                                    style={{ background: s.hullTint }}
                                  />
                                </div>
                                <div className="text-xs text-slate-400">{s.description}</div>
                                <div className="mt-1 flex items-center gap-2">
                                  {owned ? (
                                    <button
                                      type="button"
                                      disabled={equipped}
                                      onClick={() => {
                                        const p = loadProfile();
                                        p.equippedShip = s.id;
                                        saveProfile(p);
                                        refreshProfile();
                                      }}
                                      className={`rounded px-3 py-1 text-xs font-bold uppercase ${equipped ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border border-accent-blue/40 bg-accent-blue/20 text-accent-blue"}`}
                                    >
                                      {equipped ? "Equipped" : "Equip"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!affordable}
                                      onClick={() => {
                                        if (!affordable) return;
                                        const r = spendCoins(s.unlockCost);
                                        if (r.ok) {
                                          const p = loadProfile();
                                          const key = `ship:${s.id}`;
                                          if (!p.ownedCosmetics.includes(key))
                                            p.ownedCosmetics.push(key);
                                          saveProfile(p);
                                          sounds.play("purchase");
                                          refreshProfile();
                                        }
                                      }}
                                      className={`rounded px-3 py-1 text-xs font-bold uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                                    >
                                      Unlock · {s.unlockCost}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {shopTab === "cosmetics" && (
                      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3">
                        {COSMETICS.map((c) => {
                          const owned = profile.ownedCosmetics.includes(c.id);
                          const cond = c.unlockCondition;
                          let locked = false;
                          if (cond && cond !== "always") {
                            const val =
                              cond.stat === "totalAsteroidsDestroyed"
                                ? profile.totalAsteroidsDestroyed
                                : cond.stat === "totalDistance"
                                  ? profile.totalDistance
                                  : profile.totalRunsPlayed;
                            locked = val < cond.atLeast;
                          }
                          const equippedId =
                            c.slot === "hull"
                              ? profile.equippedHull
                              : c.slot === "engine"
                                ? profile.equippedEngine
                                : profile.equippedDeathFx;
                          const equipped = equippedId === c.id;
                          const affordable = profile.walletCoins >= c.cost;
                          return (
                            <div
                              key={c.id}
                              className={`flex flex-col items-start gap-1 rounded-lg border p-2 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"} ${locked ? "opacity-60" : ""}`}
                            >
                              <div className="flex w-full items-center gap-2">
                                <CosmeticPreview slot={c.slot} value={c.value} />
                                <span className="flex-1 truncate text-xs font-semibold text-white">
                                  {c.label}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">{c.slot}</div>
                              {locked ? (
                                <div className="text-[10px] text-slate-500">Locked</div>
                              ) : owned ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const p = loadProfile();
                                    if (c.slot === "hull") p.equippedHull = equipped ? null : c.id;
                                    else if (c.slot === "engine")
                                      p.equippedEngine = equipped ? null : c.id;
                                    else p.equippedDeathFx = equipped ? null : c.id;
                                    saveProfile(p);
                                    refreshProfile();
                                  }}
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${equipped ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border border-accent-blue/40 bg-accent-blue/20 text-accent-blue"}`}
                                >
                                  {equipped ? "Equipped" : "Equip"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!affordable}
                                  onClick={() => {
                                    if (!affordable) return;
                                    const r = spendCoins(c.cost);
                                    if (r.ok) {
                                      const p = loadProfile();
                                      if (!p.ownedCosmetics.includes(c.id))
                                        p.ownedCosmetics.push(c.id);
                                      saveProfile(p);
                                      sounds.play("purchase");
                                      refreshProfile();
                                    }
                                  }}
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${affordable ? "border border-accent-amber/50 bg-accent-amber/20 text-accent-amber" : "border border-white/10 bg-white/5 text-slate-500"}`}
                                >
                                  Buy · {c.cost}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Achievements modal — separate surface from shop so progress
                and spending are not conflated. */}
            <AnimatePresence>
              {achievementsOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex flex-col bg-black/80 backdrop-blur-md"
                >
                  <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/85 px-4 pt-4 pb-3 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-accent-amber" />
                      <h3 className="text-lg font-bold text-white">Trophies</h3>
                      <div className="text-[10px] font-bold tracking-[0.25em] text-white/50 uppercase">
                        {profile.unlockedAchievements.length} / {ACHIEVEMENTS.length}
                      </div>
                    </div>
                    <button
                      onClick={() => setAchievementsOpen(false)}
                      className="rounded-lg border border-white/20 bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                      aria-label="Close trophies"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                      {ACHIEVEMENTS.map((a) => {
                        const owned = profile.unlockedAchievements.includes(a.id);
                        return (
                          <div
                            key={a.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 ${
                              owned
                                ? "border-amber-500/50 bg-amber-900/20"
                                : "border-white/10 bg-white/5 opacity-70"
                            }`}
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs font-black ${
                                owned
                                  ? "bg-amber-400 text-amber-900"
                                  : "bg-slate-700 text-slate-500"
                              }`}
                            >
                              {a.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className={`text-sm font-bold ${owned ? "text-white" : "text-slate-400"}`}
                              >
                                {a.name}
                              </div>
                              <div className="text-xs text-slate-400">{a.description}</div>
                              {a.unlocksCosmeticId && owned && (
                                <div className="mt-1 text-[10px] text-emerald-400">
                                  Unlocked cosmetic: {a.unlocksCosmeticId}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pointer-events-none absolute top-3 right-3 left-3 flex flex-col gap-1.5 text-[10px] sm:right-auto sm:text-sm">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur-sm sm:gap-4 sm:px-3">
                <span className="flex items-center gap-1.5 font-mono font-bold text-accent-blue tabular-nums">
                  <Rocket className="h-3.5 w-3.5" />
                  {ui.score}
                </span>
                <span className="font-mono text-white/80 tabular-nums">{ui.distance}m</span>
                <span className="font-mono text-white/80 tabular-nums">{ui.kills} kills</span>
                {ui.combo > 1 && (
                  <motion.span
                    key={ui.combo}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="font-mono font-bold tabular-nums"
                    style={{ color: comboColor(ui.combo) }}
                  >
                    {"\u00d7"}
                    {ui.combo}
                  </motion.span>
                )}
                <span className="font-mono text-white/50 tabular-nums">
                  {ui.seconds.toFixed(0)}s
                </span>
              </div>
              {/* Active power-ups */}
              {ui.active.length > 0 && (
                <div className="flex items-center gap-2">
                  {ui.active.map((a) => {
                    const def = POWERUP_DEFS[a.type];
                    const Icon =
                      a.type === "shield"
                        ? Shield
                        : a.type === "triple"
                          ? Crosshair
                          : a.type === "rapid"
                            ? Zap
                            : a.type === "warp"
                              ? Rocket
                              : a.type === "magnet"
                                ? Magnet
                                : Target;
                    const pct = Math.min(100, (a.remainingMs / POWERUP_DURATION_MS) * 100);
                    return (
                      <div
                        key={a.type}
                        className="flex items-center gap-1 rounded-md border border-white/10 bg-black/50 px-2 py-1 backdrop-blur-sm"
                        style={{ borderColor: `${def.color}55` }}
                      >
                        <Icon className="h-3 w-3" style={{ color: def.color }} />
                        <div className="h-1 w-10 overflow-hidden rounded-full bg-white/15">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: def.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top-right: best + controls (pause / mute / fullscreen) */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {highScore > 0 && (
                <div className="pointer-events-none flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 font-mono text-xs text-accent-amber tabular-nums backdrop-blur-sm">
                  <Trophy className="h-3 w-3" />
                  {highScore}
                </div>
              )}
              <button
                onClick={togglePause}
                aria-label={ui.status === "paused" ? "Resume" : "Pause"}
                className="rounded-lg border border-white/10 bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
              >
                {ui.status === "paused" ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={toggleSound}
                aria-label={soundEnabled ? "Mute" : "Unmute"}
                className="rounded-lg border border-white/10 bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
              >
                {soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="rounded-lg border border-white/10 bg-black/50 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:text-white"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Biome label — bottom center */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[10px] tracking-widest text-white/40 uppercase">
              <span className="h-1 w-1 animate-pulse rounded-full bg-accent-blue/60" />
              {env.name}
            </div>
          </>
        )}

        {/* Pulsing instruction overlay — anchored low so the ship in the
            centre of the canvas stays visible behind it. */}
        {/* Pause overlay */}
        <AnimatePresence>
          {ui.status === "paused" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[2px]"
            >
              <div className="text-xs font-bold tracking-[0.3em] text-white/60 uppercase">
                Paused
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePause}
                className="rounded-xl border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-md"
              >
                Resume
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Achievement toasts */}
        {achievementToasts.length > 0 && (
          <div className="pointer-events-none absolute top-14 right-4 z-40 flex flex-col gap-2">
            {achievementToasts.map((a) => (
              <div
                key={`${a.id}-${a.firedAt}`}
                className="flex min-w-[220px] items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-900/80 px-4 py-2 backdrop-blur-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded bg-amber-400 text-xs font-black text-amber-900">
                  {a.icon}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] tracking-wide text-amber-200">ACHIEVEMENT</div>
                  <div className="text-sm font-bold text-white">{a.name}</div>
                  <div className="text-xs text-amber-100">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
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

        {/* Record toggle (armed only) */}
        {ui.status === "armed" && (
          <button
            onClick={() => (isRecording ? stopRecording() : startRecording())}
            className="absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-md border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-white hover:bg-black/70"
            type="button"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${isRecording ? "animate-pulse bg-red-500" : "bg-white/50"}`}
            />
            {isRecording ? "Stop" : "Record"}
          </button>
        )}
        {/* Settings gear (idle or dead only) */}
        {(ui.status === "armed" || ui.status === "dead") && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-3 right-3 z-30 rounded border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/60"
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
          <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/80"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="max-w-[90%] min-w-[260px] rounded-lg border border-white/20 bg-slate-900 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Settings</h3>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="text-slate-400 hover:text-white"
                  aria-label="Close settings"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <SettingsToggle
                  label="Reduced motion"
                  checked={prefs.reducedMotion}
                  onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))}
                />
                <SettingsToggle
                  label="Bloom / glow"
                  checked={prefs.bloomEnabled}
                  onChange={(v) => setPrefs((p) => ({ ...p, bloomEnabled: v }))}
                />
                <SettingsToggle
                  label="Music"
                  checked={prefs.musicEnabled}
                  onChange={(v) => setPrefs((p) => ({ ...p, musicEnabled: v }))}
                />
                <SettingsToggle
                  label="SFX"
                  checked={prefs.sfxEnabled}
                  onChange={(v) => setPrefs((p) => ({ ...p, sfxEnabled: v }))}
                />
                {gyroSupported && (
                  <div>
                    <SettingsToggle
                      label="Gyro controls"
                      checked={prefs.gyroEnabled}
                      onChange={(v) => {
                        void (async () => {
                          if (v && gyroPermission !== "granted") {
                            const ok = await requestGyroPermission();
                            if (!ok) return;
                          }
                          setPrefs((p) => ({ ...p, gyroEnabled: v }));
                        })();
                      }}
                    />
                    {gyroPermission === "denied" && (
                      <div className="mt-1 text-[10px] text-red-400">
                        Permission denied. Enable motion access in iOS Settings.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Boss intro banner */}
        {ui.boss?.phase === "intro" && (
          <div className="pointer-events-none absolute inset-x-0 top-[18%] z-30 flex flex-col items-center">
            <div className="animate-pulse text-xs tracking-[0.4em] text-red-400">INCOMING</div>
            <div className="text-3xl font-black text-white drop-shadow-[0_0_12px_rgba(239,68,68,0.6)] sm:text-5xl">
              {BOSS_DISPLAY_NAMES[ui.boss.id]}
            </div>
            {!firstBossSeen && (
              <div className="mt-2 max-w-xs text-center text-xs text-slate-300">
                Bosses interrupt normal flight. Shoot them to progress. Dodge their attacks.
              </div>
            )}
          </div>
        )}
        {/* Boss HP bar */}
        {ui.boss?.phase === "fighting" && (
          <div className="pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            <div className="text-[10px] tracking-[0.3em] text-red-300">
              {BOSS_DISPLAY_NAMES[ui.boss.id]}
            </div>
            <div className="h-2 w-48 overflow-hidden rounded-sm border border-red-500/50 bg-black/60 sm:w-64">
              <div
                className="h-full bg-linear-to-r from-red-600 to-red-400 transition-[width] duration-100"
                style={{ width: `${ui.boss.hpPct}%` }}
              />
            </div>
            {ui.boss.id === "swarm-mother" && ui.boss.hasDrone && (
              <div className="animate-pulse text-[10px] tracking-[0.3em] text-fuchsia-300">
                CLEAR DRONES
              </div>
            )}
          </div>
        )}

        {/* Armed instructions: first-timer sees the pulsing pill; returning player sees Play/Shop buttons */}
        <AnimatePresence>
          {ui.status === "armed" && !isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const g = gameRefs.current;
                  if (g.status === "armed") startRun(g);
                }}
                className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-10 py-3 text-lg font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/30"
                type="button"
              >
                Play
              </motion.button>
              <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">
                Cannons fire automatically · {isTouch ? "drag to steer" : "mouse or WASD"}
              </div>
            </motion.div>
          )}
          {ui.status === "armed" && isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/15 px-2.5 py-1 font-mono text-xs text-accent-amber">
                <CoinsIcon className="h-3.5 w-3.5" />
                {profile.walletCoins}
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const g = gameRefs.current;
                    if (g.status === "armed") startRun(g);
                  }}
                  className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-7 py-3 text-base font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/30"
                >
                  Play
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShopOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/20 px-5 py-3 text-sm font-bold tracking-wider text-accent-amber uppercase"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Shop
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAchievementsOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold tracking-wider text-white/80 uppercase"
                >
                  <Trophy className="h-4 w-4" />
                  Trophies
                </motion.button>
              </div>
              <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">
                {isTouch
                  ? "Drag to steer · cannons auto-fire"
                  : "Mouse or WASD to steer · cannons auto-fire"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Death overlay with leaderboard */}
        <AnimatePresence>
          {ui.status === "dead" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 16 }}
                className="relative text-center"
              >
                {/* Confetti burst — bigger when world record */}
                {celebration && (
                  <>
                    {(celebration === "world" ? WORLD_CONFETTI : PERSONAL_CONFETTI).map((c) => (
                      <motion.div
                        key={c.id}
                        className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
                        initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                        animate={{ x: c.dx, y: c.dy, opacity: 0, rotate: c.rot }}
                        transition={{
                          duration: celebration === "world" ? 1.8 : 1.3,
                          ease: "easeOut",
                          delay: c.id * 0.012,
                        }}
                        style={{ background: c.color }}
                      />
                    ))}
                  </>
                )}
                <div className="text-xs font-bold tracking-[0.3em] text-red-400 uppercase">
                  Ship destroyed
                </div>
                <div className="mt-1 font-display text-4xl font-black text-white tabular-nums sm:text-5xl">
                  {ui.score}
                </div>
                {celebration === "world" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-linear-to-br from-accent-amber via-accent-pink to-accent-blue px-4 py-1.5 text-sm font-black tracking-widest text-black uppercase"
                  >
                    <Trophy className="h-4 w-4" />
                    World Record
                  </motion.div>
                )}
                {celebration === "personal" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent-amber/60 bg-accent-amber/20 px-3 py-1 text-xs font-bold tracking-widest text-accent-amber uppercase"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Personal Best
                  </motion.div>
                )}
                {ui.coinsThisRun > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-2 flex items-center justify-center gap-1.5 font-mono text-sm text-accent-amber"
                  >
                    <CoinsIcon className="h-4 w-4" />+{ui.coinsThisRun} coins
                  </motion.div>
                )}
                <div className="mx-auto mt-3 grid max-w-md grid-cols-2 gap-2 px-2 text-xs text-white/75 sm:grid-cols-4">
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-[10px] tracking-wider text-white/50 uppercase">
                      Survived
                    </div>
                    <div className="font-mono text-white tabular-nums">
                      {ui.seconds.toFixed(0)}s
                    </div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-[10px] tracking-wider text-white/50 uppercase">
                      Distance
                    </div>
                    <div className="font-mono text-white tabular-nums">{ui.distance}m</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-[10px] tracking-wider text-white/50 uppercase">Kills</div>
                    <div className="font-mono text-white tabular-nums">{ui.kills}</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-[10px] tracking-wider text-white/50 uppercase">
                      Peak Combo
                    </div>
                    <div
                      className="font-mono text-white tabular-nums"
                      style={{ color: comboColor(ui.comboPeak) }}
                    >
                      {"\u00d7"}
                      {ui.comboPeak}
                    </div>
                  </div>
                </div>
                {ui.bossesDefeatedThisRun > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 font-mono text-sm text-red-300">
                    <span>Bosses Defeated:</span>
                    <span className="font-bold text-white">{ui.bossesDefeatedThisRun}</span>
                  </div>
                )}
              </motion.div>

              <div className="flex w-full max-w-md items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 12))}
                  placeholder="Pilot name"
                  maxLength={12}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-accent-blue focus:outline-none"
                />
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    void submit();
                  }}
                  disabled={submitted}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitted ? "Submitted" : "Submit"}
                </motion.button>
              </div>

              {leaderboard.length > 0 && (
                <div className="w-full max-w-md rounded-lg border border-white/15 bg-white/5 p-3 text-sm">
                  <div className="mb-2 text-xs font-bold tracking-widest text-white/60 uppercase">
                    Top pilots
                  </div>
                  <ol className="space-y-1">
                    {leaderboard.slice(0, 8).map((e, i) => (
                      <li
                        key={`${e.name}-${e.createdAt}-${i}`}
                        className="flex items-center gap-2 text-white/85"
                      >
                        <span className="w-5 text-white/40 tabular-nums">{i + 1}.</span>
                        <span className="flex-1 truncate">
                          {e.name}
                          {e.region && (
                            <span className="ml-1.5 text-xs text-white/40">{e.region}</span>
                          )}
                        </span>
                        {typeof e.seconds === "number" && (
                          <span className="text-xs text-white/45 tabular-nums">{e.seconds}s</span>
                        )}
                        <span className="font-mono tabular-nums">{e.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2 px-2 sm:gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={launch}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-blue uppercase sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  <RotateCcw className="h-4 w-4" />
                  Fly again
                </motion.button>
                {isReturningPlayer && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShopOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-amber uppercase sm:px-5 sm:py-2.5 sm:text-sm"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Shop
                  </motion.button>
                )}
                {recordingBlob && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const url = URL.createObjectURL(recordingBlob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `orbital-dodge-run-${Date.now()}.webm`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-blue-400/50 bg-blue-500/20 px-4 py-2 text-xs font-bold tracking-wider text-blue-300 uppercase sm:px-5 sm:py-2.5 sm:text-sm"
                  >
                    Download Replay
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    void (async () => {
                      const blob = await captureShareImage({
                        score: ui.score,
                        distance: ui.distance,
                        kills: ui.kills,
                      });
                      if (!blob) return;
                      const file = new File([blob], `orbital-dodge-${Date.now()}.png`, {
                        type: "image/png",
                      });
                      const nav = navigator as Navigator & {
                        canShare?: (d: { files: File[] }) => boolean;
                        share?: (d: {
                          files: File[];
                          title?: string;
                          text?: string;
                        }) => Promise<void>;
                      };
                      if (nav.canShare?.({ files: [file] }) && nav.share) {
                        try {
                          await nav.share({
                            title: "Orbital Dodge",
                            text: `Score: ${ui.score}`,
                            files: [file],
                          });
                          return;
                        } catch {
                          // silent-ok: Web Share API rejected (user cancelled or unsupported); falls through to direct download below
                        }
                      }
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = file.name;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    })();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-xs font-bold tracking-wider text-emerald-300 uppercase sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Crash overlay — a game-loop or death-handler throw stopped play;
            reload is the honest recovery (a "retry" that reruns the same
            crashing frame could re-crash). Reuses the death overlay's classes. */}
        {crashed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
            <div className="text-center">
              <div className="text-xs font-bold tracking-[0.3em] text-red-400 uppercase">
                Game Error
              </div>
              <div className="mt-2 text-sm text-white/70">This game hit an error and stopped.</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-blue uppercase sm:px-5 sm:py-2.5 sm:text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                Reload
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-(--muted)">
        Endless run. Pick up power-ups for temporary firepower or shield. Biome shifts every 35s —
        and the asteroids get meaner the longer you survive.
      </p>
    </div>
  );
}
