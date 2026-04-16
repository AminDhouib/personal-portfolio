"use client";

import { useEffect, useRef, useState } from "react";

interface ViewportSize {
  w: number;
  h: number;
  dpr: number;
}

type GameState = "menu" | "playing" | "paused" | "game-over";
type GameMode = "classic" | "sudden" | "speedrun";
type BiomeId = "surface" | "clouds" | "atmosphere" | "space" | "void";
type ThemeId = "classic" | "neon" | "gold" | "crystal" | "pixel";

interface Floor {
  x: number;
  width: number;
  y: number;
  height: number;
  hue: number;
  isPerfect: boolean;
  isGolden: boolean;
}

interface ActiveBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  hue: number;
  direction: 1 | -1;
  speed: number;
  isGolden: boolean;
}

interface Particle {
  kind: "dust" | "sparkle" | "debris" | "comboTrail" | "ambient" | "goldShower";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  width?: number;
  height?: number;
}

interface GhostFrame {
  floorIndex: number;
  x: number;
  width: number;
  timeMs: number;
}

interface RunRecord {
  floors: GhostFrame[];
  score: number;
  durationMs: number;
}

interface GameRefs {
  state: GameState;
  mode: GameMode;
  score: number;
  hp: number;
  floors: Floor[];
  activeBlock: ActiveBlock | null;
  perfectCombo: number;
  maxCombo: number;
  perfectsCount: number;
  goldenCount: number;
  cameraY: number;
  cameraTargetY: number;
  cameraScale: number;
  cameraTargetScale: number;
  particles: Particle[];
  particleCursor: number;
  biomeIdx: number;
  biomeTransition: number;
  bannerText: string;
  bannerTime: number;
  shake: number;
  slowMo: number;
  runRecord: RunRecord;
  runStartMs: number;
  startedAt: number;
  lastFrame: number;
  droppingLock: boolean;
  ghost: RunRecord | null;
  ghostPassed: boolean;
  achievementsUnlockedThisRun: string[];
  hintsOn: boolean;
  theme: ThemeId;
  seed: number;
  isDailyRun: boolean;
  isSeededRun: boolean;
  milestonesFired: Set<number>;
  prng: () => number;
  ambientCooldown: number;
}

const BASE_BLOCK_HEIGHT = 28;
const BASE_BLOCK_WIDTH_PX = 220;
const BASE_BLOCK_SPEED = 260;
const MAX_BLOCK_SPEED = 820;
const SPEED_FACTOR = 0.8;
const PERFECT_THRESHOLD = 4;
const NEAR_MISS_RATIO = 0.88;
const PARTICLE_MAX = 200;
const BIOME_THRESHOLDS: Record<BiomeId, number> = {
  surface: 0,
  clouds: 15,
  atmosphere: 35,
  space: 60,
  void: 90,
};
const BIOME_ORDER: BiomeId[] = ["surface", "clouds", "atmosphere", "space", "void"];
const HUE_STEP = 6;
const HUE_BASE = 340;
const LS_PREFIX = "tower_stacker_";

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSize>({ w: 800, h: 600, dpr: 1 });
  const [, forceTick] = useState(0);

  const refs = useRef<GameRefs>({
    state: "menu",
    mode: "classic",
    score: 0,
    hp: 3,
    floors: [],
    activeBlock: null,
    perfectCombo: 0,
    maxCombo: 0,
    perfectsCount: 0,
    goldenCount: 0,
    cameraY: 0,
    cameraTargetY: 0,
    cameraScale: 1,
    cameraTargetScale: 1,
    particles: new Array(PARTICLE_MAX).fill(null).map(() => ({
      kind: "dust" as const, x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotSpeed: 0,
      life: 0, maxLife: 1, size: 0, color: "#000",
    })),
    particleCursor: 0,
    biomeIdx: 0,
    biomeTransition: 1,
    bannerText: "",
    bannerTime: 0,
    shake: 0,
    slowMo: 0,
    runRecord: { floors: [], score: 0, durationMs: 0 },
    runStartMs: 0,
    startedAt: 0,
    lastFrame: 0,
    droppingLock: false,
    ghost: null,
    ghostPassed: false,
    achievementsUnlockedThisRun: [],
    hintsOn: true,
    theme: "classic",
    seed: 1,
    isDailyRun: false,
    isSeededRun: false,
    milestonesFired: new Set<number>(),
    prng: Math.random,
    ambientCooldown: 0,
  });

  const [uiState, setUiState] = useState<GameState>("menu");
  const [uiScore, setUiScore] = useState(0);
  const [uiHp, setUiHp] = useState(3);
  const [uiCombo, setUiCombo] = useState(0);

  function spawnBlock() {
    const r = refs.current;
    const { w, h } = viewportRef.current;
    const prev = r.floors[r.floors.length - 1];
    const prevWidth = prev ? prev.width : BASE_BLOCK_WIDTH_PX;
    const floorIdx = r.floors.length;
    const hue = (HUE_BASE + floorIdx * HUE_STEP) % 360;
    const fromLeft = (floorIdx % 2) === 0;
    const y = prev ? prev.y - BASE_BLOCK_HEIGHT - 2 : h - 80 - BASE_BLOCK_HEIGHT;
    const speed = Math.min(MAX_BLOCK_SPEED, BASE_BLOCK_SPEED + r.score * SPEED_FACTOR * 0.1);
    r.activeBlock = {
      x: fromLeft ? 0 : w - prevWidth,
      y,
      width: prevWidth,
      height: BASE_BLOCK_HEIGHT,
      hue,
      direction: fromLeft ? 1 : -1,
      speed,
      isGolden: false,
    };
    r.droppingLock = false;
  }

  function startRun() {
    const r = refs.current;
    const { w, h } = viewportRef.current;
    r.state = "playing";
    r.score = 0;
    r.hp = r.mode === "classic" ? 3 : 1;
    r.floors = [];
    r.perfectCombo = 0;
    r.maxCombo = 0;
    r.perfectsCount = 0;
    r.goldenCount = 0;
    r.cameraY = 0;
    r.cameraTargetY = 0;
    r.cameraScale = 1;
    r.cameraTargetScale = 1;
    r.biomeIdx = 0;
    r.biomeTransition = 1;
    r.shake = 0;
    r.slowMo = 0;
    r.runStartMs = performance.now();
    r.droppingLock = false;
    r.ghostPassed = false;
    r.achievementsUnlockedThisRun = [];
    r.runRecord = { floors: [], score: 0, durationMs: 0 };
    r.milestonesFired = new Set();
    r.ambientCooldown = 0;
    // Place base plate (future tasks will enhance with actual block spawning)
    r.floors.push({
      x: w / 2 - BASE_BLOCK_WIDTH_PX / 2,
      y: h - 80,
      width: BASE_BLOCK_WIDTH_PX,
      height: BASE_BLOCK_HEIGHT,
      hue: HUE_BASE,
      isPerfect: true,
      isGolden: false,
    });
    setUiState("playing");
    setUiScore(0);
    setUiHp(r.hp);
    setUiCombo(0);
    spawnBlock();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.min(720, Math.floor(rect.width * 0.9)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewportRef.current = { w, h, dpr };
      forceTick((n) => (n + 1) % 1_000_000);
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    window.addEventListener("orientationchange", applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", applySize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let rafId = 0;
    let alive = true;

    const frame = (now: number) => {
      if (!alive) return;
      const r = refs.current;
      if (!r.lastFrame) r.lastFrame = now;
      let dt = (now - r.lastFrame) / 1000;
      if (dt > 0.05) dt = 0.05;
      if (r.slowMo > 0) {
        dt *= 0.4;
        r.slowMo = Math.max(0, r.slowMo - (now - r.lastFrame));
      }
      r.lastFrame = now;

      const { w, h } = viewportRef.current;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0b1220");
      grad.addColorStop(1, "#1f2937");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // update active block
      if (r.state === "playing" && r.activeBlock) {
        const a = r.activeBlock;
        a.x += a.direction * a.speed * dt;
        if (a.x <= 0) { a.x = 0; a.direction = 1; }
        if (a.x + a.width >= w) { a.x = w - a.width; a.direction = -1; }
      }

      // draw floors
      for (const f of r.floors) {
        ctx.fillStyle = `hsl(${f.hue} 80% 55%)`;
        ctx.fillRect(f.x, f.y, f.width, f.height);
      }

      // draw active block
      if (r.activeBlock) {
        const a = r.activeBlock;
        ctx.fillStyle = `hsl(${a.hue} 80% 55%)`;
        ctx.fillRect(a.x, a.y, a.width, a.height);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    try {
      const m = localStorage.getItem(LS_PREFIX + "mode") as GameMode | null;
      if (m === "classic" || m === "sudden" || m === "speedrun") refs.current.mode = m;
      const h = localStorage.getItem(LS_PREFIX + "hints");
      if (h !== null) refs.current.hintsOn = h === "true";
      const t = localStorage.getItem(LS_PREFIX + "theme") as ThemeId | null;
      if (t === "classic" || t === "neon" || t === "gold" || t === "crystal" || t === "pixel") {
        refs.current.theme = t;
      }
    } catch {}
    forceTick((n) => (n + 1) % 1_000_000);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none"
        style={{ touchAction: "manipulation" }}
      />

      {uiState === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-neutral-900/90 p-6 shadow-[0_0_60px_-10px_rgba(239,68,68,0.5)]">
            <h2 className="text-3xl font-bold text-red-400 mb-1">Tower Stacker</h2>
            <p className="text-sm text-neutral-400 mb-5">Time the drop. Keep the tower alive.</p>

            <div className="space-y-3 mb-5">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["classic", "sudden", "speedrun"] as GameMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        refs.current.mode = m;
                        try { localStorage.setItem(LS_PREFIX + "mode", m); } catch {}
                        forceTick((n) => (n + 1) % 1_000_000);
                      }}
                      className={`rounded-lg px-3 py-2 text-sm border transition ${
                        refs.current.mode === m
                          ? "border-red-500 bg-red-500/15 text-red-200"
                          : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {m === "classic" ? "Classic" : m === "sudden" ? "Sudden" : "Speedrun"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={refs.current.hintsOn}
                  onChange={(e) => {
                    refs.current.hintsOn = e.target.checked;
                    try { localStorage.setItem(LS_PREFIX + "hints", String(e.target.checked)); } catch {}
                    forceTick((n) => (n + 1) % 1_000_000);
                  }}
                />
                Landing hints (dashed projection)
              </label>
            </div>

            <button
              onClick={() => startRun()}
              className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-3 text-lg shadow-lg shadow-red-900/30 transition"
            >
              START
            </button>

            <p className="text-xs text-neutral-500 mt-4 text-center">
              Tap, click, or press Space / Enter to drop.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
