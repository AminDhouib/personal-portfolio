"use client";

import { motion, useMotionValue, useMotionTemplate, animate } from "framer-motion";
import { useEffect } from "react";
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
// Matched from actual gameplay screenshot: dark space with warm nebula glow,
// solid flat-shaded polyhedra asteroids (not wireframe), diagonal warp
// streaks, cyan ship with engine trail, vignette + bloom feel.

function SpaceShooterBanner() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#0a0a1a" }}>
      {/* Biome nebula glow — drifts slowly downward for parallax */}
      <motion.div
        className="absolute w-[70%] h-[80%] rounded-full blur-3xl"
        style={{
          right: "-15%",
          background: "radial-gradient(circle, #b4540030 0%, #facc1518 40%, transparent 70%)",
        }}
        animate={{ top: ["-20%", "80%"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute w-[50%] h-[60%] rounded-full blur-3xl"
        style={{
          left: "-10%",
          background: "radial-gradient(circle, #a78bfa15 0%, transparent 65%)",
        }}
        animate={{ top: ["10%", "110%"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      />
      {/* Starfield scrolling slowly downward — parallax layer behind everything */}
      <motion.div
        className="absolute left-0 w-full"
        style={{ height: "200%", top: 0 }}
        animate={{ top: ["0%", "50%"] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      >
        <StarField density={60} color="#94a3b8" />
      </motion.div>
      {/* Vertical warp streaks — flying forward through space */}
      {[...Array(16)].map((_, i) => {
        const seed = i * 7919 + 1031;
        const x = seed % 100;
        const len = 8 + (seed % 12);
        return (
          <motion.div
            key={i}
            className="absolute"
            style={{
              left: `${x}%`,
              width: 1,
              height: `${len}%`,
              background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.35), transparent)",
            }}
            animate={{ top: ["-15%", "110%"] }}
            transition={{
              duration: 0.5 + (i % 5) * 0.12,
              repeat: Infinity,
              delay: i * 0.07,
              ease: "linear",
            }}
          />
        );
      })}
      {/* Solid flat-shaded asteroids — spawn from top, flow down, rotate */}
      {[
        { x: 8, size: 44, faces: ["#4c1d95", "#5b21b6", "#7c3aed"], spd: 3.5, delay: 0 },
        { x: 78, size: 34, faces: ["#134e4a", "#1a6b64", "#2dd4bf"], spd: 4.2, delay: 1.0 },
        { x: 30, size: 28, faces: ["#3b0764", "#6b21a8", "#a855f7"], spd: 3.0, delay: 2.0 },
        { x: 65, size: 38, faces: ["#1e3a5f", "#2563eb", "#60a5fa"], spd: 3.8, delay: 0.6 },
        { x: 48, size: 22, faces: ["#4c1d95", "#6d28d9", "#8b5cf6"], spd: 2.8, delay: 1.5 },
        { x: 90, size: 30, faces: ["#134e4a", "#0f766e", "#2dd4bf"], spd: 3.3, delay: 2.5 },
      ].map((a, i) => (
        <motion.svg
          key={i}
          className="absolute"
          style={{ left: `${a.x}%`, width: a.size, height: a.size }}
          viewBox="-14 -14 28 28"
          animate={{
            top: ["-12%", "110%"],
            rotate: [0, 360],
            scale: [0.6, 1.2],
          }}
          transition={{
            duration: a.spd,
            repeat: Infinity,
            delay: a.delay,
            ease: "linear",
          }}
        >
          <polygon points="0,-12 12,0 0,2" fill={a.faces[0]} />
          <polygon points="0,-12 -12,0 0,2" fill={a.faces[1]} />
          <polygon points="0,12 12,0 0,2" fill={a.faces[2]} />
          <polygon points="0,12 -12,0 0,2" fill={a.faces[1]} />
          <polygon points="0,-12 12,0 0,12 -12,0" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        </motion.svg>
      ))}
      {/* Ship (positioned off-center like in gameplay) */}
      <motion.svg
        viewBox="-30 -30 60 60"
        className="absolute w-[28%]"
        style={{ left: "38%", top: "38%" }}
        animate={{ y: [-4, 4, -4], rotateZ: [-1.5, 1.5, -1.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="od-hull2" x1="0" x2="0" y1="-18" y2="14">
            <stop offset="0" stopColor="#67e8f9" />
            <stop offset="1" stopColor="#0e7490" />
          </linearGradient>
          <radialGradient id="od-eng2">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.7" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Engine glow */}
        <ellipse cx="0" cy="18" rx="8" ry="12" fill="url(#od-eng2)" />
        {/* Fuselage — solid cone */}
        <polygon points="0,-18 7,11 -7,11" fill="url(#od-hull2)" />
        {/* Wings — darker flat shade */}
        <polygon points="-7,5 -16,13 -5,11" fill="#0e7490" />
        <polygon points="7,5 16,13 5,11" fill="#0e7490" />
        {/* Nacelles */}
        <rect x="-18" y="9" width="4" height="7" rx="1" fill="#155e75" />
        <rect x="14" y="9" width="4" height="7" rx="1" fill="#155e75" />
        {/* Nacelle glow tips */}
        <circle cx="-16" cy="16" r="2" fill="#22d3ee" opacity="0.6" />
        <circle cx="16" cy="16" r="2" fill="#22d3ee" opacity="0.6" />
        {/* Cockpit */}
        <ellipse cx="0" cy="-5" rx="2" ry="3" fill="#cffafe" />
      </motion.svg>
      {/* Engine trail — elongated blur */}
      <motion.div
        className="absolute w-[15%] h-10 rounded-full blur-xl"
        style={{
          left: "44%",
          top: "60%",
          background: "linear-gradient(180deg, #22d3ee88, #22d3ee00)",
        }}
        animate={{ opacity: [0.5, 1, 0.5], scaleY: [0.8, 1.3, 0.8] }}
        transition={{ duration: 0.3, repeat: Infinity }}
      />
      {/* Bullet tracers — bright cyan spheres shooting upward */}
      {[
        { x: "47%", d: 0 },
        { x: "51%", d: 0.35 },
        { x: "49%", d: 0.7 },
      ].map((b, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: b.x,
            background: "#22d3ee",
            boxShadow: "0 0 6px 2px #22d3ee, 0 0 14px #22d3ee66",
          }}
          animate={{ top: ["42%", "0%"], opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, delay: b.d, ease: "linear" }}
        />
      ))}
      {/* Gold coins flowing down like asteroids */}
      {[
        { x: "22%", spd: 3.2, delay: 0.8 },
        { x: "72%", spd: 2.8, delay: 2.2 },
        { x: "45%", spd: 3.6, delay: 1.6 },
      ].map((c, i) => (
        <motion.div
          key={i}
          className="absolute w-3.5 h-3.5 rounded-full"
          style={{
            left: c.x,
            background: "radial-gradient(circle at 35% 35%, #fde68a, #d97706)",
            boxShadow: "0 0 10px #facc1566",
          }}
          animate={{
            top: ["-5%", "110%"],
            scale: [0.5, 1.1],
            rotate: [0, 360],
          }}
          transition={{ duration: c.spd, repeat: Infinity, delay: c.delay, ease: "linear" }}
        />
      ))}
      {/* Vignette — dark edges like the actual PostFx */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 65% at 50% 50%, transparent 40%, #0a0a1a 100%)",
        }}
      />
    </div>
  );
}

// ---------- Hextris ----------
// Matched to actual gameplay: #0d0d0d bg, outer hex boundary, and the real
// 4-color palette (#ec4899 / #f59e0b / #6366f1 / #22c55e — matches COLORS
// in hextris.tsx). Full match-and-clear simulation on three faces: blocks
// fall from outside, land in stack order (inner → middle → outer), and when
// three of the same color are on a face they flash and clear. Loops.

function HextrisBanner() {
  // Exact palette from src/components/game/hextris.tsx
  const PINK = "#ec4899";
  const AMBER = "#f59e0b";
  const INDIGO = "#6366f1";
  const GREEN = "#22c55e";

  // One full drop cycle: fall → stack → match → clear → buffer → hex-rotate.
  // All three active faces fire in sync so the rotation happens on a clean
  // empty board, matching the real game's "rotate between moves" rhythm.
  const CYCLE = 4.2;

  // Three active faces drop together (no stagger) so they all clear at the
  // same moment and the rotation snap happens over a blank hex.
  const faces = [
    { angleDeg: -90, color: PINK, delay: 0 },
    { angleDeg: 30, color: GREEN, delay: 0 },
    { angleDeg: 150, color: INDIGO, delay: 0 },
  ];
  // Extra one-off filler blocks on the remaining faces — these never match
  // (stay at slot 0) so the hex doesn't look half-empty between clears.
  const fillers = [
    { angleDeg: -30, color: AMBER },
    { angleDeg: 90, color: AMBER },
    { angleDeg: 210, color: GREEN },
  ];

  // Inner hex is flat-top. For a regular hex the edge length equals the
  // vertex radius, so an inner hex with vertex-radius 14 has 14-unit edges.
  // Blocks are sized to match that edge length so a stack reads as column
  // of three blocks locked to the face, like the real game.
  const INNER_R = 14;
  const APOTHEM = INNER_R * Math.cos(Math.PI / 6); // ≈ 12.12
  const BLOCK_W = INNER_R; // = face edge length
  const BLOCK_H = 6.5;
  // Slot 0 centers half-a-block out from the face; each next slot stacks
  // one block-height further out.
  const SLOT_R = [
    APOTHEM + BLOCK_H / 2,
    APOTHEM + BLOCK_H / 2 + BLOCK_H,
    APOTHEM + BLOCK_H / 2 + 2 * BLOCK_H,
  ];
  const START_R = 55; // well past the outer hex apothem

  // Keyframe times normalized to CYCLE. Three blocks fall sequentially,
  // land in order, pop+clear, then a buffer + hex rotation closes the cycle.
  //   drops (0.00 → 0.60)  clear (0.60 → 0.70)  buffer+rotation (0.70 → 1.0)
  const t_release = [0.001, 0.18, 0.36];
  const t_landed = [0.18, 0.36, 0.54];
  const t_rest_end = 0.58;
  const t_pop = 0.62;
  const t_clear = 0.70;

  // Rotation: once per CYCLE the whole canvas snaps 60° (6 steps = one full
  // revolution, so the outer animation cycle = 6·CYCLE seconds and loops
  // seamlessly at 360° = 0°). The rotation is fast — the hex holds still
  // through the drops and then does a quick sweep with an overshoot that
  // snaps back near-instantly to the target step.
  //
  // We drive this via a MotionValue + SVG transform attribute (not CSS
  // transform) so rotation pivots around the viewBox origin (0,0 user
  // coords = center of our -60..60 viewBox) regardless of the group's
  // bounding box. CSS transform-origin gets resolved against the bbox
  // (which changes as blocks move) and caused the whole hex to wobble
  // off-screen under rotation.
  const ROT_STEPS = 6;
  const rotDuration = CYCLE * ROT_STEPS;
  const rotKeyframes: number[] = [0];
  const rotTimes: number[] = [0];
  for (let k = 0; k < ROT_STEPS; k++) {
    const base = k * 60;
    const next = (k + 1) * 60;
    const subStart = k / ROT_STEPS;
    const subLen = 1 / ROT_STEPS;
    // Hold at base through drop + clear (0 → 0.82 of sub-cycle)
    rotKeyframes.push(base);
    rotTimes.push(subStart + 0.82 * subLen);
    // Fast sweep to overshoot (0.82 → 0.93 of sub-cycle)
    rotKeyframes.push(next + 10);
    rotTimes.push(subStart + 0.93 * subLen);
    // Immediate snap back (0.93 → 0.95 of sub-cycle)
    rotKeyframes.push(next);
    rotTimes.push(subStart + 0.95 * subLen);
    // Settle until the sub-cycle ends
    rotKeyframes.push(next);
    rotTimes.push(subStart + subLen);
  }

  const rotate = useMotionValue(0);
  useEffect(() => {
    const controls = animate(rotate, rotKeyframes, {
      duration: rotDuration,
      repeat: Infinity,
      times: rotTimes,
      ease: "easeOut",
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rotateTransform = useMotionTemplate`rotate(${rotate})`;

  // All animated geometry lives inside the same SVG viewBox so a block's
  // position is expressed in viewBox units — aspect-ratio-invariant. The
  // rect inside each <motion.g> keeps a fixed rotate() matching its face
  // tangent while framer-motion drives translate/opacity/scale via CSS
  // transform on the group.
  const renderBlock = (
    angleDeg: number,
    slot: number,
    color: string,
    delay: number,
    key: string,
  ) => {
    const rad = (angleDeg * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const landX = ux * SLOT_R[slot];
    const landY = uy * SLOT_R[slot];
    const startX = ux * START_R;
    const startY = uy * START_R;

    return (
      <motion.g
        key={key}
        animate={{
          x: [startX, startX, landX, landX, landX, landX, startX],
          y: [startY, startY, landY, landY, landY, landY, startY],
          opacity: [0, 0, 1, 1, 1, 0, 0],
          scale: [1, 1, 1, 1, 1.12, 1, 1],
        }}
        transition={{
          duration: CYCLE,
          repeat: Infinity,
          delay,
          ease: "linear",
          times: [
            0,
            t_release[slot],
            t_landed[slot],
            t_rest_end,
            t_pop,
            t_clear,
            1,
          ],
        }}
      >
        <rect
          x={-BLOCK_W / 2}
          y={-BLOCK_H / 2}
          width={BLOCK_W}
          height={BLOCK_H}
          rx={0.8}
          fill={color}
          transform={`rotate(${angleDeg + 90})`}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
        <rect
          x={-BLOCK_W / 2}
          y={-BLOCK_H / 2}
          width={BLOCK_W}
          height={BLOCK_H}
          rx={0.8}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={0.4}
          transform={`rotate(${angleDeg + 90})`}
        />
      </motion.g>
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#0d0d0d" }}>
      {/* Outer-hex vignette — matches the boundary fade in the real canvas */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 55%, #050505 100%)",
        }}
      />
      <svg
        viewBox="-60 -60 120 120"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Rotating canvas — the outer hex, inner hex, blocks, fillers and
            pop texts are all children so the whole board snaps 60° between
            drop cycles (matching the real game's rotate-between-moves).
            Uses the SVG transform attribute (not CSS transform) so the
            rotation pivot is the element's local (0, 0) = viewBox center,
            not the bbox center which shifts as blocks animate. */}
        <motion.g transform={rotateTransform}>
        {/* Outer hex boundary — flat-top orientation (flat edges at top/
            bottom, vertex points on left and right). Matches the real game
            layout so blocks sit ON faces at -90/-30/30/90/150/210. Outer
            vertex-radius 46, apothem 40. */}
        <polygon
          points="46,0 23,-40 -23,-40 -46,0 -23,40 23,40"
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />
        {/* Inner score hex — flat-top, vertex-radius 14, apothem ~12.12 */}
        <polygon
          points="14,0 7,-12 -7,-12 -14,0 -7,12 7,12"
          fill="#111114"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={0.5}
        />
        {/* Three faces running the full match-and-clear cycle */}
        {faces.flatMap((f) =>
          [0, 1, 2].map((slot) =>
            renderBlock(f.angleDeg, slot, f.color, f.delay, `${f.angleDeg}-${slot}`),
          ),
        )}
        {/* Non-matching filler blocks on other faces (slot 0, static) so
            the hex never looks half-empty between clears. */}
        {fillers.map((f) => {
          const rad = (f.angleDeg * Math.PI) / 180;
          const cx = Math.cos(rad) * SLOT_R[0];
          const cy = Math.sin(rad) * SLOT_R[0];
          return (
            <g key={`filler-${f.angleDeg}`} transform={`translate(${cx} ${cy})`} opacity={0.85}>
              <rect
                x={-BLOCK_W / 2}
                y={-BLOCK_H / 2}
                width={BLOCK_W}
                height={BLOCK_H}
                rx={0.8}
                fill={f.color}
                transform={`rotate(${f.angleDeg + 90})`}
                style={{ filter: `drop-shadow(0 0 2.5px ${f.color})` }}
              />
              <rect
                x={-BLOCK_W / 2}
                y={-BLOCK_H / 2}
                width={BLOCK_W}
                height={BLOCK_H}
                rx={0.8}
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={0.4}
                transform={`rotate(${f.angleDeg + 90})`}
              />
            </g>
          );
        })}
        {/* Score pop — "+9" that appears centered on the cleared face, rises
            toward center. Positioned in viewBox units so it stays aligned. */}
        {faces.map((f) => {
          const rad = (f.angleDeg * Math.PI) / 180;
          const popX = Math.cos(rad) * 8;
          const popY = Math.sin(rad) * 8;
          return (
            <motion.text
              key={`pop-${f.angleDeg}`}
              x={popX}
              y={popY}
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
              fontSize={7}
              fontWeight={700}
              fill={f.color}
              style={{ filter: `drop-shadow(0 0 3px ${f.color})` }}
              animate={{ opacity: [0, 0, 1, 0], scale: [0.6, 0.6, 1.2, 1] }}
              transition={{
                duration: CYCLE,
                repeat: Infinity,
                delay: f.delay,
                ease: "easeOut",
                times: [0, t_pop - 0.01, t_pop + 0.02, t_clear + 0.05],
              }}
            >
              +9
            </motion.text>
          );
        })}
        </motion.g>
      </svg>
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
