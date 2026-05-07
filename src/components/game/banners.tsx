"use client";

import { motion, useMotionValue, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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

  // Drive the SVG transform attribute directly: subscribing to a MotionValue
  // on change and calling setAttribute("transform", `rotate(...)`) bypasses
  // framer-motion's CSS-transform pipeline entirely, so the pivot is SVG's
  // native (0, 0) of the parent coordinate system (= viewBox center here).
  const rotate = useMotionValue(0);
  const gRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const unsub = rotate.on("change", (v) => {
      gRef.current?.setAttribute("transform", `rotate(${v})`);
    });
    const controls = animate(rotate, rotKeyframes, {
      duration: rotDuration,
      repeat: Infinity,
      times: rotTimes,
      ease: "easeOut",
    });
    return () => {
      controls.stop();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* viewBox is shifted vertically so the hex sits slightly above card
          center — the gallery card's text overlay ("Hextris / Rotate the
          hex…") covers the bottom of the card, so raising the hex keeps
          it clear of the title. Raising y-min makes user-coord 0 render
          higher in the viewport. */}
      <svg
        viewBox="-60 -50 120 120"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Rotating canvas — the outer hex, inner hex, blocks, fillers and
            pop texts are all children so the whole board snaps 60° between
            drop cycles (matching the real game's rotate-between-moves).
            Uses the SVG transform attribute (driven by a MotionValue via
            setAttribute above) so the rotation pivot is the element's
            local (0, 0) = viewBox center, not the bbox center which
            shifts as blocks animate. */}
        <g ref={gRef} transform="rotate(0)">
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
        </g>
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
// Pixel-accurate match: #58a66c/#448563 checkerboard tile backs, salmon
// #bd8c84 face-up tiles, gray-200 outlines, colored clue cards from the
// COLORS array, actual voltorb.png sprite, connector bars between tiles.

// Upstream's `srcTile0` — the bomb tile face sprite (22×22, includes salmon
// background + voltorb body + dark border). Different from the parent-level
// voltorb.png (28×28) which is just the voltorb-body sprite for row/col
// indicator cards. Mirrored from samualtnorman/voltorb-flip's
// src/assets/tile/voltorb.png so its salmon (#bd8c84) matches the
// explode_*.png frames' salmon, eliminating the color-shift on transition.
const VOLTORB_SRC = "/games/super-voltorb-flip/sprites/upstream/tile/voltorb.png";
const EXPLODE_FRAMES = Array.from(
  { length: 9 },
  (_, i) => `/games/super-voltorb-flip/sprites/upstream/tile/explode_${i}.png`,
);

// Mirrors upstream's blowup logic (samualtnorman/voltorb-flip src/index.ts):
// 9 progressively-larger PNG frames (22×22 → 64×64 native). The artist
// baked the growth into the assets — each frame is a larger image with
// the voltorb portion at a consistent size and more debris around it.
// Matches super-voltorb-flip/effects/default.tsx (60ms per frame, 80ms hold
// after the last frame). Then a 200ms cross-fade so the explosion debris
// dissolves smoothly into the static voltorb behind (which is pixel-
// identical to the voltorb-tile portion baked into frame 8 — no snap).
const FRAME_DURATION_MS = 60;
const FRAME_HOLD_MS = 80;
const FADE_DURATION_MS = 200;
function ExplosionFrames({
  onFadeStart,
  onDone,
}: {
  onFadeStart: () => void;
  onDone: () => void;
}) {
  const [frame, setFrame] = useState(0);
  const [fading, setFading] = useState(false);
  // Stash the callbacks in refs so the frame-advance effect's deps don't
  // include them. Otherwise inline arrows from the parent would get a
  // new identity on every parent re-render, re-running this effect and
  // clearing the 60ms `setFrame` timer before it could fire — the frame
  // would stay stuck at 0 forever.
  const onFadeStartRef = useRef(onFadeStart);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onFadeStartRef.current = onFadeStart;
    onDoneRef.current = onDone;
  }, [onFadeStart, onDone]);
  useEffect(() => {
    if (frame === EXPLODE_FRAMES.length - 1) {
      const startFade = setTimeout(() => {
        setFading(true);
        onFadeStartRef.current();
      }, FRAME_HOLD_MS);
      const finish = setTimeout(() => onDoneRef.current(), FRAME_HOLD_MS + FADE_DURATION_MS);
      return () => {
        clearTimeout(startFade);
        clearTimeout(finish);
      };
    }
    const t = setTimeout(() => setFrame((f) => f + 1), FRAME_DURATION_MS);
    return () => clearTimeout(t);
  }, [frame]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={EXPLODE_FRAMES[frame]}
      alt=""
      style={{
        imageRendering: "pixelated",
        pointerEvents: "none",
        maxWidth: "none",
        maxHeight: "none",
        width: "auto",
        height: "auto",
        display: "block",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
      }}
    />
  );
}

// Bomb tile face — just renders the voltorb sprite at native size. The
// explosion plays in a separate overlay at the tile-outer level (see
// BombExplosionOverlay). maxWidth/maxHeight overrides are needed because
// Tailwind's preflight resets imgs to `max-width: 100%`, which would
// otherwise clamp the voltorb to the parent salmon div's width.
function BombFaceUp({ size }: { size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={VOLTORB_SRC}
      alt=""
      width={size}
      height={size}
      style={{
        imageRendering: "pixelated",
        pointerEvents: "none",
        maxWidth: "none",
        maxHeight: "none",
        display: "block",
      }}
    />
  );
}

// Sibling-of-tile-inner overlay rendered ON TOP of the tile (z=5 vs the
// tile-inner's z=1). Sized at the sprite's native ~40px so the voltorb
// portion of the sprite renders at the same scale as the static voltorb
// on a normally-sized tile, and the outer debris ring overflows past the
// tile boundary into the gap. After onDone fires, the overlay unmounts
// and the static voltorb in the tile-inner is visible again at full size.
// One-shot explosion overlay. The owning cell remounts this with a fresh
// `key` at each new cycle (or when its value flips to "bomb" again), so a
// single-fire timer is sufficient — no internal interval.
function BombExplosionOverlay({
  flipDelayMs,
  scale,
  onExplodingChange,
}: {
  flipDelayMs: number;
  scale: number;
  onExplodingChange: (e: boolean) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [exploding, setExploding] = useState(false);
  const onExplodingChangeRef = useRef(onExplodingChange);
  useEffect(() => {
    onExplodingChangeRef.current = onExplodingChange;
  }, [onExplodingChange]);
  useEffect(() => {
    onExplodingChangeRef.current(exploding);
  }, [exploding]);
  useEffect(() => {
    const initial = setTimeout(() => {
      setMounted(true);
      setExploding(true);
    }, flipDelayMs);
    return () => clearTimeout(initial);
  }, [flipDelayMs]);
  if (!mounted) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <ExplosionFrames
        onFadeStart={() => setExploding(false)}
        onDone={() => setMounted(false)}
      />
    </div>
  );
}

// 15% chance of bomb, 85% chance of number 1/2/3. With a 6×3 = 18 cell
// board this averages ~2.7 bombs visible at any given moment. Each cell
// rolls independently so the bomb positions wander as cycles tick.
function pickCellValue(): number | "bomb" {
  if (Math.random() < 0.15) return "bomb";
  return 1 + Math.floor(Math.random() * 3);
}

// Deterministic per-cell seed for SSR — derives a stable pseudo-random
// number from grid coordinates so server and client render the same
// initial state. After mount the cell re-rolls via Math.random() in
// useEffect, where SSR/client divergence is expected and harmless.
function seededFromCoords(r: number, c: number): number {
  const h = ((r * 73856093) ^ (c * 19349663)) >>> 0;
  return (h % 1000) / 1000;
}
function pickCellValueSeeded(r: number, c: number): number | "bomb" {
  const a = seededFromCoords(r, c);
  if (a < 0.15) return "bomb";
  const b = seededFromCoords(c, r);
  return 1 + Math.floor(b * 3);
}

// Per-cell tile component. Maintains its own value state that re-rolls at
// each cell cycle (so bombs and numbers appear in different positions over
// time without forcing a global board reset). The flip animation runs
// continuously via motion.div's `repeat: Infinity` — values just swap at
// the cycle boundaries when the cell is face-down.
function BoardCell({
  r,
  c,
  ROWS,
  COLS,
  FLIP_CYCLE_S,
  TILE,
  GAP,
  ROW_COLORS,
  COL_COLORS,
  tileOuterStyle,
  tileInnerStyle,
}: {
  r: number;
  c: number;
  ROWS: number;
  COLS: number;
  FLIP_CYCLE_S: number;
  TILE: number;
  GAP: number;
  ROW_COLORS: string[];
  COL_COLORS: string[];
  tileOuterStyle: React.CSSProperties;
  tileInnerStyle: React.CSSProperties;
}) {
  // Stable per-cell flip delay — derived deterministically from (r,c) so
  // SSR matches client hydration. Re-roll happens in useEffect post-mount.
  const [flipDelay, setFlipDelay] = useState(
    () => seededFromCoords(r + 1, c + 1) * (FLIP_CYCLE_S - 1.5),
  );
  // cycleTick increments at the start of each cell cycle (face-down moment
  // between flip-down and the next flip-up). The BombExplosionOverlay's
  // React key includes cycleTick, so it remounts cleanly each cycle when
  // the value happens to be "bomb".
  const [cycleTick, setCycleTick] = useState(0);
  const [value, setValue] = useState<number | "bomb">(() => pickCellValueSeeded(r, c));
  // Post-hydration: replace deterministic seeds with real randomness so the
  // banner doesn't repeat the same starting pattern on every page load.
  useEffect(() => {
    setFlipDelay(Math.random() * (FLIP_CYCLE_S - 1.5));
    setValue(pickCellValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [exploding, setExploding] = useState(false);

  useEffect(() => {
    const cycleMs = FLIP_CYCLE_S * 1000;
    let interval: ReturnType<typeof setInterval> | null = null;
    const initial = setTimeout(() => {
      setCycleTick((n) => n + 1);
      setValue(pickCellValue());
      interval = setInterval(() => {
        setCycleTick((n) => n + 1);
        setValue(pickCellValue());
      }, cycleMs);
    }, (flipDelay + FLIP_CYCLE_S) * 1000);
    return () => {
      clearTimeout(initial);
      if (interval) clearInterval(interval);
    };
  }, [flipDelay, FLIP_CYCLE_S]);

  const isBomb = value === "bomb";
  // For cycle 0 the overlay mounts at t=0, so the explosion fires at
  // (flipDelay + 0.25*cycle) from mount. For later cycles the overlay
  // remounts at the cycle boundary so it just needs 0.25*cycle delay.
  const explosionDelayMs =
    cycleTick === 0
      ? (flipDelay + 0.25 * FLIP_CYCLE_S) * 1000
      : 0.25 * FLIP_CYCLE_S * 1000;

  const renderFaceUp = () =>
    isBomb ? (
      <div
        className="flex items-center justify-center w-full h-full"
        style={{ background: "#bd8c84", border: "2px solid #8a4236" }}
      >
        {!exploding && <BombFaceUp size={22} />}
      </div>
    ) : (
      <div
        className="flex items-center justify-center w-full h-full font-bold"
        style={{
          background: "#bd8c84",
          border: "2px solid #8a4236",
          color: "#1a1a1a",
          fontSize: TILE * 0.55,
          fontFamily: "ui-monospace, monospace",
          textShadow:
            "1px 0 #fff, -1px 0 #fff, 0 1px #fff, 0 -1px #fff",
        }}
      >
        {value}
      </div>
    );

  return (
    <div style={{ ...tileOuterStyle, gridRow: r + 1, gridColumn: c + 1 }}>
      {c < COLS - 1 && (
        <div
          style={{
            position: "absolute",
            right: -(GAP + 1),
            top: "50%",
            transform: "translateY(-50%)",
            width: GAP + 2,
            height: 6,
            backgroundColor: ROW_COLORS[r % ROW_COLORS.length],
            zIndex: 0,
            pointerEvents: "none",
            boxShadow: "0 1px 0 #e5e7eb, 0 -1px 0 #e5e7eb",
          }}
        />
      )}
      {r < ROWS - 1 && (
        <div
          style={{
            position: "absolute",
            bottom: -(GAP + 1),
            left: "50%",
            transform: "translateX(-50%)",
            height: GAP + 2,
            width: 6,
            backgroundColor: COL_COLORS[c % COL_COLORS.length],
            zIndex: 0,
            pointerEvents: "none",
            boxShadow: "1px 0 0 #e5e7eb, -1px 0 0 #e5e7eb",
          }}
        />
      )}
      {isBomb && (
        <BombExplosionOverlay
          key={`bomb-${cycleTick}`}
          flipDelayMs={explosionDelayMs}
          scale={1.0}
          onExplodingChange={setExploding}
        />
      )}
      <div style={{ ...tileInnerStyle, perspective: 600 }}>
        <motion.div
          style={{
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            position: "relative",
          }}
          animate={{ rotateY: [0, 0, 180, 180, 0] }}
          transition={{
            duration: FLIP_CYCLE_S,
            repeat: Infinity,
            delay: flipDelay,
            times: [0, 0.15, 0.25, 0.85, 0.95],
            ease: "easeInOut",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
            }}
          >
            <VoltorbBannerTileBack />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            {renderFaceUp()}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function VoltorbBannerTileBack() {
  return (
    <svg
      viewBox="0 0 3 3"
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={(r + c) % 2 === 0 ? "#448563" : "#58a66c"} />
        )),
      )}
    </svg>
  );
}

function SuperVoltorbFlipBanner() {
  const TILE = 28;
  const GAP = 12;
  const OUTLINE = 3;
  const FLIP_CYCLE_S = 6;
  const ROWS = 3;
  const COLS = 6;
  const ROW_COLORS = ["#e77352", "#5eae43", "#efa539"];
  const COL_COLORS = ["#5eae43", "#efa539", "#3194ff", "#c872e7", "#e77352", "#3194ff"];

  const tileOuterStyle: React.CSSProperties = {
    width: TILE,
    height: TILE,
    position: "relative",
  };
  const tileInnerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    border: "2px solid #374151",
    outline: `${OUTLINE}px solid #e5e7eb`,
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden flex items-center justify-center"
      style={{ background: "linear-gradient(160deg, #5ab859 0%, #4a9a4a 40%, #3f8a3f 100%)" }}
    >
      {/* Board container: 3x3 tiles + row clues right + col clues bottom */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${TILE}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${TILE}px)`,
          gap: GAP,
          position: "relative",
        }}
      >
        {Array.from({ length: ROWS }).flatMap((_, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <BoardCell
              key={`${r}-${c}`}
              r={r}
              c={c}
              ROWS={ROWS}
              COLS={COLS}
              FLIP_CYCLE_S={FLIP_CYCLE_S}
              TILE={TILE}
              GAP={GAP}
              ROW_COLORS={ROW_COLORS}
              COL_COLORS={COL_COLORS}
              tileOuterStyle={tileOuterStyle}
              tileInnerStyle={tileInnerStyle}
            />
          )),
        )}
      </div>
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
