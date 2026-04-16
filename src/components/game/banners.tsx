"use client";

// Per-game banner art. Intentionally lightweight — pure CSS, SVG, and Framer
// Motion so a gallery of eight banners doesn't spawn eight WebGL contexts or
// tank mobile perf. Each banner sits inside a 16:10 tile and animates
// continuously while in view.

import { motion } from "framer-motion";
import type { GameSlug } from "@/app/games/games-meta";

// ---------- shared scaffolding ----------

function StarField({ density = 40 }: { density?: number }) {
  // Deterministic pseudo-random star positions so SSR/CSR match.
  const stars = [];
  for (let i = 0; i < density; i++) {
    const seed = i * 9301 + 49297;
    const x = (seed % 100);
    const y = ((seed * 7) % 100);
    const s = ((seed * 13) % 100) / 100;
    stars.push({ x, y, size: 0.5 + s * 1.5, delay: s * 3 });
  }
  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map((star, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 2 + star.delay, repeat: Infinity, delay: star.delay }}
        />
      ))}
    </div>
  );
}

// ---------- Orbital Dodge ----------

function SpaceShooterBanner() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#021026] via-[#04143a] to-[#021026]">
      <StarField density={50} />
      {/* Streaking warp lines */}
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent"
          style={{ top: `${10 + i * 8}%`, width: "40%" }}
          animate={{ x: ["-40%", "140%"] }}
          transition={{
            duration: 1 + (i % 3) * 0.3,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "linear",
          }}
        />
      ))}
      {/* Ship silhouette */}
      <motion.svg
        viewBox="-30 -30 60 60"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%]"
        animate={{ y: [-6, 6, -6], rotateZ: [-3, 3, -3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="ship-hull" x1="0" x2="0" y1="-20" y2="20">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#0891b2" />
          </linearGradient>
          <radialGradient id="ship-glow" cx="0" cy="0">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.8" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="8" r="18" fill="url(#ship-glow)" />
        <polygon points="0,-18 12,12 6,10 0,14 -6,10 -12,12" fill="url(#ship-hull)" stroke="#a5f3fc" strokeWidth="0.8" />
        <polygon points="-6,10 -12,12 -14,20 -8,18" fill="#0e7490" />
        <polygon points="6,10 12,12 14,20 8,18" fill="#0e7490" />
        <circle cx="0" cy="-6" r="3" fill="#e0f2fe" />
      </motion.svg>
      {/* Engine trail */}
      <motion.div
        className="absolute left-1/2 top-[68%] -translate-x-1/2 w-[30%] h-6 rounded-full blur-xl"
        style={{ background: "linear-gradient(90deg,transparent,#22d3ee,transparent)" }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 0.4, repeat: Infinity }}
      />
      {/* Asteroids */}
      {[
        { x: "15%", y: "20%", size: 18, d: 4 },
        { x: "82%", y: "30%", size: 12, d: 5 },
        { x: "25%", y: "75%", size: 10, d: 6 },
        { x: "75%", y: "70%", size: 14, d: 4.5 },
      ].map((a, i) => (
        <motion.div
          key={i}
          className="absolute rounded-md border-2 border-slate-400/70 bg-slate-700/40"
          style={{
            left: a.x,
            top: a.y,
            width: a.size,
            height: a.size,
            transform: "rotate(45deg)",
          }}
          animate={{ rotate: [45, 405], scale: [1, 1.1, 1] }}
          transition={{ duration: a.d, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

// ---------- Hextris ----------

function HextrisBanner() {
  const colors = ["#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#f87171"];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      {/* Central spinning hex */}
      <motion.svg
        viewBox="-50 -50 100 100"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[55%]"
        animate={{ rotate: [0, 60, 60, 120, 120, 180, 180, 240, 240, 300, 300, 360] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
        <polygon
          points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2"
        />
        {colors.map((c, i) => {
          const ang = (Math.PI / 3) * i - Math.PI / 2;
          const mx = Math.cos(ang) * 32;
          const my = Math.sin(ang) * 32;
          return (
            <rect
              key={i}
              x={mx - 6}
              y={my - 3}
              width="12"
              height="6"
              fill={c}
              transform={`rotate(${60 * i} ${mx} ${my})`}
            />
          );
        })}
      </motion.svg>
      {/* Falling blocks */}
      {colors.map((c, i) => (
        <motion.div
          key={i}
          className="absolute rounded-sm"
          style={{
            left: `${15 + i * 12}%`,
            width: 14,
            height: 10,
            background: c,
            boxShadow: `0 0 12px ${c}`,
          }}
          animate={{ y: ["-20%", "60%"], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.4,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
}

// ---------- Tower Stacker ----------

function TowerStackerBanner() {
  const blocks = [
    { c: "#f87171", w: 100 },
    { c: "#fbbf24", w: 96 },
    { c: "#34d399", w: 93 },
    { c: "#22d3ee", w: 90 },
    { c: "#a78bfa", w: 87 },
    { c: "#f472b6", w: 84 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#2a0f0f] via-[#3a1515] to-[#0f0505]">
      <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse items-center pb-4 gap-0.5">
        {blocks.map((b, i) => (
          <motion.div
            key={i}
            className="h-6 rounded-sm"
            style={{ width: `${b.w * 0.55}%`, background: b.c, boxShadow: `0 0 18px ${b.c}55` }}
            initial={{ opacity: 0, y: -120 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.18, duration: 0.4, type: "spring", stiffness: 180 }}
          />
        ))}
      </div>
      {/* Moving top block (the one the player would drop) */}
      <motion.div
        className="absolute top-4 h-6 w-[48%] rounded-sm bg-white/90"
        style={{ boxShadow: "0 0 24px rgba(255,255,255,0.6)" }}
        animate={{ x: ["-35%", "35%", "-35%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Height guides */}
      <div className="absolute right-3 top-3 bottom-3 w-px bg-white/10" />
    </div>
  );
}

// ---------- Geometric Flow ----------

function GeometricFlowBanner() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#1f0a1f] via-[#2d0f2d] to-[#0e040e]">
      {/* Lanes */}
      {[25, 50, 75].map((x) => (
        <div
          key={x}
          className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-pink-400/30 to-transparent"
          style={{ left: `${x}%` }}
        />
      ))}
      {/* Wireframe obstacles flowing toward camera */}
      {[
        { shape: "circle", lane: 25, d: 3.5, delay: 0 },
        { shape: "square", lane: 50, d: 3.5, delay: 1.2 },
        { shape: "triangle", lane: 75, d: 3.5, delay: 2.4 },
        { shape: "circle", lane: 50, d: 3.5, delay: 3.0 },
      ].map((o, i) => (
        <motion.svg
          key={i}
          viewBox="-20 -20 40 40"
          className="absolute w-12"
          style={{ left: `calc(${o.lane}% - 24px)` }}
          animate={{
            top: ["-10%", "110%"],
            scale: [0.3, 1.4],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: o.d,
            repeat: Infinity,
            delay: o.delay,
            ease: "linear",
          }}
        >
          {o.shape === "circle" && (
            <circle cx="0" cy="0" r="14" fill="none" stroke="#f472b6" strokeWidth="2" />
          )}
          {o.shape === "square" && (
            <rect x="-12" y="-12" width="24" height="24" fill="none" stroke="#60a5fa" strokeWidth="2" />
          )}
          {o.shape === "triangle" && (
            <polygon points="0,-14 12,10 -12,10" fill="none" stroke="#fbbf24" strokeWidth="2" />
          )}
        </motion.svg>
      ))}
      {/* Player triangle */}
      <motion.svg
        viewBox="-20 -20 40 40"
        className="absolute bottom-4 w-10"
        style={{ left: "calc(50% - 20px)" }}
        animate={{ left: ["15%", "calc(50% - 20px)", "75%", "calc(50% - 20px)", "15%"] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <polygon points="0,-14 12,10 -12,10" fill="#34d399" stroke="#a7f3d0" strokeWidth="2" />
      </motion.svg>
    </div>
  );
}

// ---------- Typing Speed ----------

function TypingSpeedBanner() {
  const text = "THE QUICK BROWN FOX";
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#061626] via-[#0a2540] to-[#05101a] flex items-center justify-center">
      {/* Caret-flanked text */}
      <div className="relative font-mono text-2xl sm:text-3xl md:text-4xl font-black tracking-wider text-white/90">
        {text.split("").map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0.15, y: 0 }}
            animate={{ opacity: [0.15, 1, 1, 0.15], y: [0, -4, 0, 0] }}
            transition={{
              duration: text.length * 0.18,
              repeat: Infinity,
              delay: i * 0.18,
              times: [0, 0.1, 0.4, 1],
            }}
            style={{ color: "#60a5fa", textShadow: "0 0 12px #60a5fa" }}
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        ))}
      </div>
      {/* Streak burst */}
      <motion.div
        className="absolute right-6 top-6 px-3 py-1 rounded-full border border-accent-amber/50 bg-accent-amber/10 text-accent-amber text-xs font-bold"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        STREAK x12
      </motion.div>
    </div>
  );
}

// ---------- Code Puzzle ----------

function CodePuzzleBanner() {
  const lines = [
    "function sum(arr) {",
    "  let total = 0;",
    "  for (let i = 1; i <= arr.length; i++) {",
    "    total += arr[i];",
    "  }",
    "  return total;",
    "}",
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#1a1405] via-[#2a2010] to-[#0e0a03] p-4 sm:p-6">
      <div className="font-mono text-[10px] sm:text-xs leading-relaxed text-white/70">
        {lines.map((line, i) => {
          const buggy = i === 2;
          return (
            <motion.div
              key={i}
              className={`whitespace-pre ${buggy ? "bg-accent-red/20 rounded" : ""}`}
              animate={buggy ? { backgroundColor: ["rgba(248,113,113,0.1)", "rgba(248,113,113,0.35)", "rgba(248,113,113,0.1)"] } : undefined}
              transition={buggy ? { duration: 1.6, repeat: Infinity } : undefined}
            >
              <span className="text-white/30 mr-2">{String(i + 1).padStart(2, "0")}</span>
              {line}
            </motion.div>
          );
        })}
      </div>
      {/* Floating bug icon */}
      <motion.div
        className="absolute bottom-4 right-4 text-3xl"
        animate={{ y: [0, -6, 0], rotate: [-5, 5, -5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <ellipse cx="20" cy="22" rx="10" ry="12" fill="#f87171" stroke="#fca5a5" strokeWidth="1.5" />
          <line x1="20" y1="10" x2="20" y2="34" stroke="#fca5a5" strokeWidth="1" />
          <line x1="10" y1="18" x2="4" y2="14" stroke="#fca5a5" strokeWidth="1.5" />
          <line x1="30" y1="18" x2="36" y2="14" stroke="#fca5a5" strokeWidth="1.5" />
          <line x1="10" y1="26" x2="4" y2="30" stroke="#fca5a5" strokeWidth="1.5" />
          <line x1="30" y1="26" x2="36" y2="30" stroke="#fca5a5" strokeWidth="1.5" />
          <circle cx="16" cy="18" r="1.5" fill="white" />
          <circle cx="24" cy="18" r="1.5" fill="white" />
        </svg>
      </motion.div>
    </div>
  );
}

// ---------- Super Voltorb Flip ----------

function SuperVoltorbFlipBanner() {
  // 3x3 grid of tiles that flip
  const tiles = [
    { v: 2, d: 0 },
    { v: 1, d: 0.3 },
    { v: "x", d: 0.6 }, // voltorb
    { v: 3, d: 0.9 },
    { v: 1, d: 1.2 },
    { v: 2, d: 1.5 },
    { v: 1, d: 1.8 },
    { v: 2, d: 2.1 },
    { v: 1, d: 2.4 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#1a1405] via-[#2a2010] to-[#0e0a03] flex items-center justify-center">
      <div className="grid grid-cols-3 gap-2 w-[65%] aspect-square" style={{ perspective: 600 }}>
        {tiles.map((t, i) => (
          <motion.div
            key={i}
            className="relative rounded-md"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: [0, 180, 180, 360] }}
            transition={{
              duration: 6,
              repeat: Infinity,
              delay: t.d,
              times: [0, 0.25, 0.75, 1],
              ease: "easeInOut",
            }}
          >
            {/* back face (face down) */}
            <div
              className="absolute inset-0 rounded-md bg-gradient-to-br from-orange-600 to-orange-800 border border-orange-400/50 flex items-center justify-center"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="w-3 h-3 rounded-full bg-orange-300/40" />
            </div>
            {/* front face */}
            <div
              className="absolute inset-0 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 border border-amber-500 flex items-center justify-center text-black font-bold text-lg"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              {t.v === "x" ? (
                <div className="w-5 h-5 rounded-full bg-red-500 border border-red-300" />
              ) : (
                t.v
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------- Password Game ----------

function PasswordGameBanner() {
  const rules = ["Rule 4", "Rule 11", "Rule 27"];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#26062a] via-[#3a0f42] to-[#150316] p-4 sm:p-6 flex flex-col justify-center">
      {/* Password field */}
      <div className="rounded-md border border-pink-400/40 bg-black/40 px-3 py-2 font-mono text-sm sm:text-base text-pink-200 mb-3 flex items-center gap-1 overflow-hidden">
        <span>hunter</span>
        <motion.span
          className="inline-block"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          2
        </motion.span>
        <motion.span
          className="inline-block w-0.5 h-4 bg-pink-300 ml-0.5"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.7, repeat: Infinity }}
        />
      </div>
      {/* Rule toasts sliding in */}
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <motion.div
            key={i}
            className="rounded border border-pink-400/30 bg-pink-500/10 px-2.5 py-1 text-[11px] sm:text-xs text-pink-100"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: [-30, 0, 0, -30], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 3.5,
              repeat: Infinity,
              delay: i * 1.0,
              times: [0, 0.2, 0.85, 1],
            }}
          >
            <span className="text-pink-300 font-bold">✗ {r}:</span> Your password must contain a chess move.
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------- registry ----------

const BANNERS: Record<GameSlug, () => React.ReactNode> = {
  "space-shooter": SpaceShooterBanner,
  hextris: HextrisBanner,
  "tower-stacker": TowerStackerBanner,
  "geometric-flow": GeometricFlowBanner,
  "typing-speed": TypingSpeedBanner,
  "code-puzzle": CodePuzzleBanner,
  "super-voltorb-flip": SuperVoltorbFlipBanner,
  "password-game": PasswordGameBanner,
};

export function GameBanner({ slug }: { slug: GameSlug }) {
  const Banner = BANNERS[slug];
  return <Banner />;
}
