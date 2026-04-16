"use client";

import { motion } from "framer-motion";
import type { GameSlug } from "@/app/games/games-meta";

// ---------- shared ----------

function StarField({ density = 40, color = "white" }: { density?: number; color?: string }) {
  const stars = [];
  for (let i = 0; i < density; i++) {
    const seed = i * 9301 + 49297;
    const x = seed % 100;
    const y = (seed * 7) % 100;
    const s = ((seed * 13) % 100) / 100;
    stars.push({ x, y, size: 0.5 + s * 1.5, delay: s * 3 });
  }
  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map((star, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            backgroundColor: color,
          }}
          animate={{ opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: 2 + star.delay, repeat: Infinity, delay: star.delay }}
        />
      ))}
    </div>
  );
}

// ---------- Orbital Dodge ----------
// Actual game: #0a0a1a deep space bg, #a78bfa purple wireframe asteroids,
// cyan #22d3ee ship/bullets, gold #facc15 coins, wireframe toon materials.

function SpaceShooterBanner() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#0a0a1a" }}>
      <StarField density={55} color="#cbd5e1" />
      {/* Warp streaks */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px"
          style={{
            top: `${8 + i * 7.5}%`,
            width: "35%",
            background: "linear-gradient(90deg,transparent,#a78bfa88,transparent)",
          }}
          animate={{ x: ["-40%", "140%"] }}
          transition={{
            duration: 0.8 + (i % 3) * 0.25,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "linear",
          }}
        />
      ))}
      {/* Ship — cone + box wing + nacelles (matches Falcon) */}
      <motion.svg
        viewBox="-30 -30 60 60"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%]"
        animate={{ y: [-5, 5, -5], rotateZ: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="od-hull" x1="0" x2="0" y1="-20" y2="16">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        {/* Engine glow */}
        <ellipse cx="0" cy="14" rx="10" ry="6" fill="#22d3ee" opacity="0.35" />
        {/* Fuselage cone */}
        <polygon points="0,-20 8,12 -8,12" fill="url(#od-hull)" stroke="#a5f3fc" strokeWidth="0.6" />
        {/* Wings */}
        <polygon points="-8,6 -18,14 -6,12" fill="#0e7490" stroke="#67e8f9" strokeWidth="0.4" />
        <polygon points="8,6 18,14 6,12" fill="#0e7490" stroke="#67e8f9" strokeWidth="0.4" />
        {/* Nacelles */}
        <rect x="-20" y="10" width="5" height="8" rx="1.5" fill="#155e75" stroke="#22d3ee" strokeWidth="0.4" />
        <rect x="15" y="10" width="5" height="8" rx="1.5" fill="#155e75" stroke="#22d3ee" strokeWidth="0.4" />
        {/* Cockpit */}
        <ellipse cx="0" cy="-6" rx="2.5" ry="3.5" fill="#e0f2fe" opacity="0.85" />
      </motion.svg>
      {/* Engine trail */}
      <motion.div
        className="absolute left-1/2 top-[65%] -translate-x-1/2 w-[20%] h-5 rounded-full blur-lg"
        style={{ background: "linear-gradient(90deg,transparent,#22d3ee,transparent)" }}
        animate={{ opacity: [0.4, 1, 0.4], scaleX: [0.8, 1.2, 0.8] }}
        transition={{ duration: 0.35, repeat: Infinity }}
      />
      {/* Wireframe asteroids — octahedron silhouette matching game */}
      {[
        { x: "12%", y: "18%", size: 22, d: 5 },
        { x: "85%", y: "25%", size: 16, d: 6 },
        { x: "20%", y: "78%", size: 14, d: 7 },
        { x: "78%", y: "72%", size: 18, d: 5.5 },
      ].map((a, i) => (
        <motion.svg
          key={i}
          className="absolute"
          style={{ left: a.x, top: a.y, width: a.size, height: a.size }}
          viewBox="-12 -12 24 24"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: a.d, repeat: Infinity, ease: "linear" }}
        >
          <polygon points="0,-10 10,0 0,10 -10,0" fill="none" stroke="#a78bfa" strokeWidth="1.5" />
          <line x1="0" y1="-10" x2="0" y2="10" stroke="#a78bfa" strokeWidth="0.5" opacity="0.5" />
          <line x1="-10" y1="0" x2="10" y2="0" stroke="#a78bfa" strokeWidth="0.5" opacity="0.5" />
        </motion.svg>
      ))}
      {/* Bullet spheres */}
      {[
        { x: "42%", y: "32%", d: 0.6 },
        { x: "56%", y: "28%", d: 0.9 },
        { x: "49%", y: "20%", d: 1.2 },
      ].map((b, i) => (
        <motion.div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full"
          style={{
            left: b.x,
            background: "#22d3ee",
            boxShadow: "0 0 8px #22d3ee, 0 0 16px #22d3ee55",
          }}
          animate={{ top: ["50%", "-5%"], opacity: [1, 0.3] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: b.d, ease: "linear" }}
        />
      ))}
      {/* Gold coin */}
      <motion.div
        className="absolute w-4 h-4 rounded-full border-2"
        style={{
          right: "30%",
          top: "40%",
          borderColor: "#facc15",
          background: "radial-gradient(circle at 35% 35%, #fde68a, #b45309)",
          boxShadow: "0 0 10px #facc1555",
        }}
        animate={{ y: [0, -4, 0], rotate: [0, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ---------- Hextris ----------
// Actual game: dark bg, central hex outline, six face colors falling inward.

function HextrisBanner() {
  const colors = ["#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#f87171"];
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#111" }}>
      {/* Subtle hex grid pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hex-pat" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(0.5)">
            <path d="M28,2 L54,18 L54,50 L28,66 L2,50 L2,18 Z" fill="none" stroke="white" strokeWidth="1" />
            <path d="M28,34 L54,50 L54,82 L28,98 L2,82 L2,50 Z" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex-pat)" />
      </svg>
      {/* Central hex with stepping rotation */}
      <motion.svg
        viewBox="-50 -50 100 100"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%]"
        animate={{ rotate: [0, 60, 60, 120, 120, 180, 180, 240, 240, 300, 300, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Hex outline */}
        <polygon
          points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15"
          fill="none"
          stroke="white"
          strokeWidth="2"
          opacity="0.4"
        />
        {/* Inner hex */}
        <polygon
          points="0,-16 14,-8 14,8 0,16 -14,8 -14,-8"
          fill="none"
          stroke="white"
          strokeWidth="1"
          opacity="0.2"
        />
        {/* Colored blocks on faces */}
        {colors.map((c, i) => {
          const ang = (Math.PI / 3) * i - Math.PI / 2;
          const mx = Math.cos(ang) * 24;
          const my = Math.sin(ang) * 24;
          return (
            <g key={i} transform={`rotate(${60 * i} ${mx} ${my})`}>
              <rect x={mx - 7} y={my - 3.5} width="14" height="7" rx="1" fill={c} opacity="0.9" />
              <rect x={mx - 7} y={my - 3.5} width="14" height="7" rx="1" fill="none" stroke={c} strokeWidth="0.5" />
            </g>
          );
        })}
      </motion.svg>
      {/* Falling blocks approaching from edges */}
      {colors.map((c, i) => {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        const startX = 50 + Math.cos(ang) * 55;
        const startY = 50 + Math.sin(ang) * 55;
        const endX = 50 + Math.cos(ang) * 20;
        const endY = 50 + Math.sin(ang) * 20;
        return (
          <motion.div
            key={i}
            className="absolute w-4 h-2.5 rounded-sm"
            style={{
              background: c,
              boxShadow: `0 0 14px ${c}88`,
              rotate: `${60 * i}deg`,
            }}
            animate={{
              left: [`${startX}%`, `${endX}%`],
              top: [`${startY}%`, `${endY}%`],
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1, 1, 0.6],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeIn",
            }}
          />
        );
      })}
    </div>
  );
}

// ---------- Tower Stacker ----------
// Actual game: #05070d bg, #ef4444 red accent, corner tick marks, scanline
// aesthetic, monospace HUD, blocks trim on miss.

function TowerStackerBanner() {
  const blocks = [
    { c: "#ef4444", w: 100 },
    { c: "#ef4444", w: 95 },
    { c: "#ef4444", w: 88 },
    { c: "#ef4444", w: 82 },
    { c: "#ef4444", w: 78 },
    { c: "#ef4444", w: 74 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#05070d" }}>
      {/* Corner tick marks (matching game's UI) */}
      {[
        "top-2 left-2 border-t border-l",
        "top-2 right-2 border-t border-r",
        "bottom-2 left-2 border-b border-l",
        "bottom-2 right-2 border-b border-r",
      ].map((pos, i) => (
        <div key={i} className={`absolute w-4 h-4 ${pos}`} style={{ borderColor: "#ef444488" }} />
      ))}
      {/* Score HUD */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 font-mono text-xs tracking-widest text-white/60 uppercase">
        FLOOR 12
      </div>
      {/* Stacked blocks — red tones, progressively trimmed */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse items-center pb-3 gap-px">
        {blocks.map((b, i) => (
          <motion.div
            key={i}
            className="rounded-sm"
            style={{
              width: `${b.w * 0.5}%`,
              height: 14,
              background: `linear-gradient(180deg, #ef4444, #b91c1c)`,
              boxShadow: "0 0 12px #ef444430",
            }}
            initial={{ opacity: 0, y: -80 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.3, type: "spring", stiffness: 200 }}
          />
        ))}
      </div>
      {/* Moving top block */}
      <motion.div
        className="absolute top-[25%] rounded-sm"
        style={{
          width: "35%",
          height: 14,
          background: "linear-gradient(180deg, #f87171, #dc2626)",
          boxShadow: "0 0 20px #ef444450",
        }}
        animate={{ left: ["10%", "55%", "10%"] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, white 2px, white 3px)",
        }}
      />
    </div>
  );
}

// ---------- Typing Speed ----------
// Actual game: confetti colors #22c55e/#60a5fa/#f59e0b/#a78bfa/#ec4899,
// character-level pop, streak counter, WPM display.

function TypingSpeedBanner() {
  const text = "THE QUICK FOX";
  const correctColors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899"];
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#0a0f1a] via-[#111827] to-[#0a0f1a] flex items-center justify-center">
      {/* WPM display in corner */}
      <div className="absolute top-3 left-4 font-mono">
        <div className="text-[10px] text-white/40 uppercase tracking-widest">WPM</div>
        <motion.div
          className="text-2xl font-black text-white/90"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          142
        </motion.div>
      </div>
      {/* Accuracy in corner */}
      <div className="absolute top-3 right-4 font-mono text-right">
        <div className="text-[10px] text-white/40 uppercase tracking-widest">ACC</div>
        <div className="text-lg font-bold text-[#22c55e]">98%</div>
      </div>
      {/* Animated typed text */}
      <div className="relative font-mono text-xl sm:text-2xl md:text-3xl font-bold tracking-wide">
        {text.split("").map((ch, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={{ opacity: 0.2 }}
            animate={{
              opacity: [0.2, 1, 1, 0.2],
              y: [0, -3, 0, 0],
              scale: [1, 1.15, 1, 1],
            }}
            transition={{
              duration: text.length * 0.16,
              repeat: Infinity,
              delay: i * 0.16,
              times: [0, 0.08, 0.25, 1],
            }}
            style={{
              color: correctColors[i % correctColors.length],
              textShadow: `0 0 10px ${correctColors[i % correctColors.length]}66`,
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        ))}
      </div>
      {/* Streak counter */}
      <motion.div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full border bg-black/40"
        style={{ borderColor: "#f59e0b55" }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
        <span className="text-xs font-bold text-[#f59e0b]">STREAK x12</span>
      </motion.div>
      {/* Confetti bursts */}
      {correctColors.map((c, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            left: `${20 + i * 15}%`,
            background: c,
            boxShadow: `0 0 6px ${c}`,
          }}
          animate={{
            top: ["55%", "35%"],
            opacity: [0, 1, 0],
            x: [(i % 2 === 0 ? -1 : 1) * 10, (i % 2 === 0 ? 1 : -1) * 15],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.3 + 0.5,
          }}
        />
      ))}
    </div>
  );
}

// ---------- Super Voltorb Flip ----------
// Actual game: Game Boy green (#5ab859 → #3f8a3f) classic theme, gold tiles,
// red Voltorb bombs, column/row clue indicators.

function SuperVoltorbFlipBanner() {
  const tiles = [
    { v: 2, d: 0 },
    { v: 1, d: 0.4 },
    { v: "x", d: 0.8 },
    { v: 3, d: 1.2 },
    { v: 1, d: 1.6 },
    { v: 2, d: 2.0 },
    { v: "x", d: 2.4 },
    { v: 1, d: 2.8 },
    { v: 3, d: 3.2 },
  ];
  return (
    <div
      className="absolute inset-0 overflow-hidden flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #3f8a3f, #5ab859, #3f8a3f)" }}
    >
      {/* Subtle pixel grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, black 3px, black 4px), repeating-linear-gradient(90deg, transparent, transparent 3px, black 3px, black 4px)",
        }}
      />
      {/* Row/column clues */}
      <div className="absolute right-[8%] top-1/2 -translate-y-1/2 flex flex-col gap-1.5">
        {[{ p: 6, v: 1 }, { p: 4, v: 2 }, { p: 5, v: 1 }].map((c, i) => (
          <div key={i} className="w-8 h-6 rounded-sm bg-white/15 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white/80 font-mono">
            {c.p}/{c.v}
          </div>
        ))}
      </div>
      <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 flex gap-1.5">
        {[{ p: 5, v: 1 }, { p: 3, v: 2 }, { p: 7, v: 0 }].map((c, i) => (
          <div key={i} className="w-8 h-5 rounded-sm bg-white/15 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white/80 font-mono">
            {c.p}/{c.v}
          </div>
        ))}
      </div>
      {/* 3x3 tile grid */}
      <div className="grid grid-cols-3 gap-1.5 w-[42%] aspect-square" style={{ perspective: 600 }}>
        {tiles.map((t, i) => (
          <motion.div
            key={i}
            className="relative rounded-md"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: [0, 180, 180, 360] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              delay: t.d,
              times: [0, 0.2, 0.8, 1],
              ease: "easeInOut",
            }}
          >
            {/* Face down — green back */}
            <div
              className="absolute inset-0 rounded-md flex items-center justify-center"
              style={{
                backfaceVisibility: "hidden",
                background: "linear-gradient(135deg, #2d7a2d, #4a9e4a)",
                border: "1.5px solid #6abb6a",
              }}
            >
              <div className="w-3 h-3 rounded-full bg-white/15" />
            </div>
            {/* Face up */}
            <div
              className="absolute inset-0 rounded-md flex items-center justify-center font-bold text-base"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: t.v === "x"
                  ? "linear-gradient(135deg, #fee2e2, #fca5a5)"
                  : "linear-gradient(135deg, #fef3c7, #fbbf24)",
                border: t.v === "x" ? "1.5px solid #f87171" : "1.5px solid #d97706",
                color: t.v === "x" ? "#dc2626" : "#78350f",
              }}
            >
              {t.v === "x" ? (
                <svg viewBox="0 0 20 20" className="w-5 h-5">
                  <circle cx="10" cy="10" r="8" fill="#ef4444" stroke="#dc2626" strokeWidth="1" />
                  <text x="10" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">V</text>
                </svg>
              ) : (
                t.v
              )}
            </div>
          </motion.div>
        ))}
      </div>
      {/* Coin counter */}
      <motion.div
        className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/20 border border-white/15"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-3 h-3 rounded-full bg-[#fbbf24] border border-[#d97706]" />
        <span className="text-[10px] font-bold text-white/90 font-mono">1,240</span>
      </motion.div>
    </div>
  );
}

// ---------- Password Game ----------
// Actual game: chaos system with overlays, fracture cracks, destruction glyphs,
// pink/purple chaos aesthetic, seed display.

function PasswordGameBanner() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#1a0e1e] to-[#0a0a0f] p-4 sm:p-5 flex flex-col justify-center">
      {/* Fracture cracks (SVG lines like the actual game's FractureWeb) */}
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points="95,5 72,21 56,37 37,50" fill="none" stroke="#f472b6" strokeWidth="0.4" />
        <polyline points="5,45 23,51 39,60 56,67" fill="none" stroke="#f472b6" strokeWidth="0.3" />
        <polyline points="95,95 77,83 64,71 50,59" fill="none" stroke="#a78bfa" strokeWidth="0.3" />
      </svg>
      {/* Chaos indicator */}
      <motion.div
        className="absolute top-3 right-3 px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider"
        style={{
          background: "linear-gradient(90deg, #f472b6, #a78bfa)",
          color: "white",
        }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        CHAOS 4
      </motion.div>
      {/* Seed display */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="8" width="12" height="9" rx="1" />
          <path d="M7 8V5a3 3 0 016 0v3" />
        </svg>
        <span className="text-[10px] font-mono text-white/40">3697376024</span>
      </div>
      {/* Password input field */}
      <div className="rounded-lg border border-pink-400/30 bg-black/50 px-3 py-2 font-mono text-sm text-pink-100 mb-3 flex items-center gap-0.5 backdrop-blur-sm">
        <span className="text-white/90">p@ssW0rd</span>
        <motion.span
          className="text-pink-300"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        >
          Kg4
        </motion.span>
        <motion.span
          className="inline-block w-0.5 h-4 bg-pink-300 ml-0.5"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      </div>
      {/* Rule cards — escalating chaos style */}
      <div className="space-y-1.5">
        {[
          { rule: "Rule 4", text: "Must include a special character", ok: true },
          { rule: "Rule 11", text: "Must contain a chess move in algebraic notation", ok: false },
          { rule: "Rule 27", text: "Digits must sum to a prime number", ok: false },
        ].map((r, i) => (
          <motion.div
            key={i}
            className="rounded-md border px-2.5 py-1.5 text-[11px]"
            style={{
              borderColor: r.ok ? "#34d39944" : "#f472b644",
              background: r.ok ? "#34d39910" : "#f472b610",
              color: r.ok ? "#a7f3d0" : "#fda4af",
            }}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: [-20, 0, 0, -20], opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: i * 1.2,
              times: [0, 0.15, 0.85, 1],
            }}
          >
            <span className="font-bold mr-1">{r.ok ? "\u2713" : "\u2717"} {r.rule}:</span>
            {r.text}
          </motion.div>
        ))}
      </div>
      {/* Glitch/destruction overlay chips */}
      {[
        { pos: "top-[15%] right-[15%]", rot: "3.7deg", scale: 0.88 },
        { pos: "bottom-[20%] left-[10%]", rot: "-4.7deg", scale: 0.81 },
      ].map((chip, i) => (
        <motion.div
          key={i}
          className={`absolute w-8 h-8 border border-pink-400/20 rounded-sm ${chip.pos}`}
          style={{ rotate: chip.rot, scale: chip.scale }}
          animate={{ opacity: [0, 0.3, 0], rotate: [chip.rot, `${parseFloat(chip.rot) + 2}deg`] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 1.5 }}
        />
      ))}
    </div>
  );
}

// ---------- registry ----------

const BANNERS: Record<GameSlug, () => React.ReactNode> = {
  "space-shooter": SpaceShooterBanner,
  hextris: HextrisBanner,
  "tower-stacker": TowerStackerBanner,
  "typing-speed": TypingSpeedBanner,
  "super-voltorb-flip": SuperVoltorbFlipBanner,
  "password-game": PasswordGameBanner,
};

export function GameBanner({ slug }: { slug: GameSlug }) {
  const Banner = BANNERS[slug];
  return <Banner />;
}
