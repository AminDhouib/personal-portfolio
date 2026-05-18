"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Rocket, Trophy, Shield, RotateCcw, Send,
  Volume2, VolumeX, Crosshair, Zap, Target,
  Maximize2, Minimize2, Pause, Play,
  ShoppingCart, Magnet, Coins as CoinsIcon, Timer, X as XIcon,
  Share2,
} from "lucide-react";
import {
  addCoins, addRunStats, incrementRunsPlayed, loadProfile, markFirstRunCompleted, saveProfile,
  setUpgradeLevel, spendCoins,
} from "./profile";
import { UPGRADES, upgradeById, SHIPS, shipById, CONSUMABLES, consumableById, COSMETICS, cosmeticById } from "./shop-data";
import { ShipPreview, UpgradePreview, ConsumablePreview, CosmeticPreview, type UpgradeIcon, type ConsumableIcon, type CosmeticSlotKind } from "./space-shooter/shop-previews";
import { PostFx } from "./post-fx";
import { ACHIEVEMENTS, checkAchievements, grantAchievements, type Achievement } from "./achievements";
import {
  type GameStatus, type PowerUpType, type ObstacleVariant, type BulletStyle,
  type Environment, type PowerUpDef, type Obstacle, type Bullet, type Coin,
  type Explosion, type SpeedLine, type PowerUp, type ActivePowerUp, type ScorePopup,
  type Debris, type BossId, type BossPhase, type SubEntity, type BossState,
  type BossProjectile, type TractorBeam, type BossWallSegment, type GameRefs, type Viewport,
  ARENA_W, ARENA_H, POWERUP_DURATION_MS,
  ENVIRONMENTS, INVERTED_ARMED_ENV, envForTime,
  POWERUP_DEFS, isPowerUpActive, tryDash,
} from "./space-shooter/types";
import { comboColor } from "./space-shooter/difficulty";
import { sounds } from "./space-shooter/sound-manager";
import {
  buildBossSchedule, BOSS_DISPLAY_NAMES,
  spawnBoss,
} from "./space-shooter/boss-behaviors";
import { runTick } from "./space-shooter/game-tick";
import { pickNextBiomeDistance, createRefs, startRun } from "./space-shooter/run-init";

// ---------- constants ----------

const HS_KEY = "space-shooter-hs";
const NAME_KEY = "space-shooter-name";
const SOUND_KEY = "space-shooter-sound";

// Module-level mutation helper — keeps eslint react-hooks/immutability happy
// when applying camera lerp inside useFrame
function applyCameraLerp(camera: THREE.Camera, tx: number, ty: number, tz: number, lookX: number, lookY: number) {
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.06);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.06);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, tz, 0.06);
  camera.lookAt(lookX, lookY, 0);
}

// Deterministic star spread (no Math.random during render)
function buildStarPoints(): Float32Array {
  const COUNT = 2400;
  const pts = new Float32Array(COUNT * 3);
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const r = 30 + ((i * 31) % 70);
    const y = 1 - (i / (COUNT - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts[i * 3 + 0] = r * radius * Math.cos(theta);
    pts[i * 3 + 1] = r * y;
    pts[i * 3 + 2] = r * radius * Math.sin(theta);
  }
  return pts;
}

// ---------- 3D components ----------

function Ship({ gameRefs, env, shipId }: { gameRefs: React.RefObject<GameRefs>; env: Environment; shipId: string }) {
  const grpRef = useRef<THREE.Group>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const engineRef = useRef<THREE.Mesh>(null);
  const engineCoreRef = useRef<THREE.Mesh>(null);
  const engineTrailRef = useRef<THREE.Mesh>(null);
  const warpAuraRef = useRef<THREE.Mesh>(null);
  const fuselageRef = useRef<THREE.Mesh>(null);
  const wingRef = useRef<THREE.Mesh>(null);
  const nacelleLRef = useRef<THREE.Mesh>(null);
  const nacelleRRef = useRef<THREE.Mesh>(null);
  const magnetRingRef = useRef<THREE.Mesh>(null);
  const magnetRingInnerRef = useRef<THREE.Mesh>(null);
  const tintColor = useMemo(() => new THREE.Color("#60a5fa"), []);
  const wingColor = useMemo(() => new THREE.Color("#60a5fa"), []);
  const engineColor = useMemo(() => new THREE.Color("#22d3ee"), []);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g || !grpRef.current) return;
    const now = performance.now();
    grpRef.current.position.set(g.shipX, g.shipY, g.shipZ);
    grpRef.current.rotation.z = g.shipRotZ;
    // Apply equipped-hull tint to ALL hull parts (fuselage + wings +
    // nacelles). A slightly darker variant goes on the wing box so the
    // silhouette still reads as layered even with a solid cosmetic color.
    tintColor.set(g.shipHullTint);
    if (fuselageRef.current) {
      (fuselageRef.current.material as THREE.MeshToonMaterial).color.copy(tintColor);
    }
    if (wingRef.current) {
      wingColor.copy(tintColor).multiplyScalar(0.72);
      (wingRef.current.material as THREE.MeshToonMaterial).color.copy(wingColor);
    }
    if (nacelleLRef.current) {
      (nacelleLRef.current.material as THREE.MeshToonMaterial).color.copy(tintColor);
    }
    if (nacelleRRef.current) {
      (nacelleRRef.current.material as THREE.MeshToonMaterial).color.copy(tintColor);
    }
    // Engine tint — apply cosmetic engine color to the trail, aura, and core
    engineColor.set(g.shipEngineTint);
    if (engineRef.current) {
      (engineRef.current.material as THREE.MeshBasicMaterial).color.copy(engineColor);
    }
    if (engineTrailRef.current) {
      (engineTrailRef.current.material as THREE.MeshBasicMaterial).color.copy(engineColor);
    }
    if (warpAuraRef.current) {
      (warpAuraRef.current.material as THREE.MeshBasicMaterial).color.copy(engineColor);
    }
    if (g.status === "dying") {
      grpRef.current.rotation.x += 0.05;
      grpRef.current.rotation.y += 0.07;
      grpRef.current.visible = (now - g.dyingAt) < 1500;
    } else {
      // Per-ship movement feel:
      //   juggernaut: heavy, slow-to-bank (0.11) with a low-freq bob
      //   phantom:    snappy, twitchy banks (0.28), fast lateral yaw
      //   scavenger:  stable cargo roll + gentle vertical float
      //   void:       drifts on a low-freq sine yaw
      //   falcon:     baseline
      const sid = g.shipId;
      const pitchLerp =
        sid === "juggernaut" ? 0.11 :
        sid === "phantom"    ? 0.28 :
        sid === "void"       ? 0.22 : 0.18;
      const targetPitch = THREE.MathUtils.clamp((g.targetY - g.shipY) * 0.18, -0.25, 0.25);
      grpRef.current.rotation.x = THREE.MathUtils.lerp(grpRef.current.rotation.x, targetPitch, pitchLerp);
      if (sid === "void") {
        grpRef.current.rotation.y = Math.sin(now * 0.0012) * 0.08;
      } else if (sid === "scavenger") {
        grpRef.current.rotation.y *= 0.9;
        grpRef.current.position.y += Math.sin(now * 0.0024) * 0.025;
      } else if (sid === "juggernaut") {
        grpRef.current.rotation.y *= 0.9;
        grpRef.current.position.y += Math.sin(now * 0.0015) * 0.015;
      } else {
        grpRef.current.rotation.y *= 0.9;
      }
      grpRef.current.visible = true;
    }

    // Warp = ghost-out the ship slightly + show aura
    const isWarping = isPowerUpActive(g, "warp");
    grpRef.current.children.forEach((child) => {
      if (child === warpAuraRef.current) return;
      const mat = (child as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && "opacity" in mat) {
        (mat as THREE.MeshBasicMaterial).opacity = isWarping ? 0.45 : 1;
        (mat as THREE.MeshBasicMaterial).transparent = isWarping || (mat as THREE.MeshBasicMaterial).transparent;
      }
    });

    // Engine flame — main ball pulses, trail elongates
    if (engineRef.current) {
      const mat = engineRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(now * 0.018) * 0.25;
    }
    if (engineCoreRef.current) {
      const pulse = 0.8 + Math.sin(now * 0.04) * 0.2;
      engineCoreRef.current.scale.setScalar(pulse);
    }
    if (engineTrailRef.current) {
      // Plume length is capped so it never reaches the camera plane.
      // Cone height = 0.7. Per-ship exhaust character:
      //   juggernaut: shorter, thicker (heavy twin-engine feel)
      //   phantom:    longer, thinner (needle stealth-drive)
      //   scavenger:  short, wide (cargo-thruster puffs)
      //   void:       jittery length with crackle
      const sid = g.shipId;
      const baseStretch = sid === "phantom" ? 2.2 : sid === "juggernaut" ? 1.2 : sid === "scavenger" ? 1.15 : 1.6;
      const baseWiden = sid === "juggernaut" ? 1.3 : sid === "scavenger" ? 1.2 : sid === "phantom" ? 0.55 : 0.9;
      const jitter = sid === "void" ? (Math.random() - 0.5) * 0.25 : 0;
      const stretch = isWarping ? 3.4 + Math.sin(now * 0.05) * 0.4 : baseStretch + Math.sin(now * 0.025) * 0.4 + jitter;
      const widen = isWarping ? 2.0 : baseWiden;
      engineTrailRef.current.scale.set(widen, widen, stretch);
      engineTrailRef.current.position.z = 0.55 + (0.7 * stretch * 0.5);
      const mat = engineTrailRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isWarping ? 0.95 : 0.5;
    }
    if (warpAuraRef.current) {
      warpAuraRef.current.visible = isWarping;
      if (isWarping) {
        const aurascale = 1 + Math.sin(now * 0.03) * 0.15;
        warpAuraRef.current.scale.setScalar(aurascale);
        warpAuraRef.current.rotation.z += 0.15;
      }
    }

    if (magnetRingRef.current) {
      const magnetOn = isPowerUpActive(g, "magnet");
      magnetRingRef.current.visible = magnetOn;
      if (magnetOn) {
        magnetRingRef.current.rotation.z += 0.035;
        const breathe = 1 + Math.sin(now * 0.008) * 0.08;
        magnetRingRef.current.scale.setScalar(breathe);
        const mat = magnetRingRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.55 + Math.sin(now * 0.012) * 0.15;
      }
      if (magnetRingInnerRef.current) {
        magnetRingInnerRef.current.visible = magnetOn;
        if (magnetOn) {
          magnetRingInnerRef.current.rotation.z -= 0.05;
          const mat2 = magnetRingInnerRef.current.material as THREE.MeshBasicMaterial;
          mat2.opacity = 0.3 + Math.sin(now * 0.018 + 1.2) * 0.12;
        }
      }
    }

    if (shieldRef.current) {
      const isShielded = isPowerUpActive(g, "shield") || now < g.invulnUntil;
      shieldRef.current.visible = isShielded;
      if (isShielded) {
        // Activation pop: brief expand from 0.2 → 1 in first 200ms after pickup
        const shield = g.activePowerUps.find((p) => p.type === "shield");
        const ageMs = shield ? POWERUP_DURATION_MS - (shield.expiresAt - now) : 0;
        const popT = Math.min(1, ageMs / 220);
        const pop = 0.2 + popT * 0.8;
        const pulse = pop + Math.sin(now * 0.01) * 0.06;
        shieldRef.current.scale.setScalar(pulse);
        const mat = shieldRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = isPowerUpActive(g, "shield") ? 0.42 : 0.25;
      }
    }
  });

  return (
    <group ref={grpRef}>
      {/* Hull + silhouette varies by ship. The fuselage / wing / nacelle refs
          attach to whichever ship is rendered — missing parts leave the ref
          null, which the useFrame tinter handles gracefully. */}
      {shipId === "juggernaut" ? (
        <>
          {/* Juggernaut: wide stubby hull, thick double wing, twin nacelle pairs */}
          <mesh ref={fuselageRef} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.28, 0.32, 1.05, 8]} />
            <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.45} />
          </mesh>
          <mesh ref={wingRef} position={[0, -0.05, 0.12]}>
            <boxGeometry args={[1.35, 0.12, 0.42]} />
            <meshToonMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.3} />
          </mesh>
          <mesh ref={nacelleRRef} position={[0.58, -0.04, 0.3]}>
            <boxGeometry args={[0.24, 0.08, 0.24]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
          </mesh>
          <mesh ref={nacelleLRef} position={[-0.58, -0.04, 0.3]}>
            <boxGeometry args={[0.24, 0.08, 0.24]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
          </mesh>
          {/* Secondary outer nacelles — purely visual, give twin-engine look */}
          <mesh position={[0.42, 0.02, 0.55]}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
            <meshBasicMaterial color={env.starColor} transparent opacity={0.7} />
          </mesh>
          <mesh position={[-0.42, 0.02, 0.55]}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
            <meshBasicMaterial color={env.starColor} transparent opacity={0.7} />
          </mesh>
          <mesh position={[0, 0.15, -0.22]} scale={[1.1, 0.8, 1.1]}>
            <sphereGeometry args={[0.15, 14, 12]} />
            <meshToonMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.7} />
          </mesh>
        </>
      ) : shipId === "phantom" ? (
        <>
          {/* Phantom: long needle fuselage + swept delta wing, no nacelles */}
          <mesh ref={fuselageRef} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.14, 1.35, 6]} />
            <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.55} />
          </mesh>
          <mesh ref={wingRef} position={[0, -0.02, 0.25]} rotation={[0, 0, 0]}>
            <coneGeometry args={[0.75, 0.05, 4]} />
            <meshToonMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, 0.08, -0.3]} scale={[1, 0.5, 1.2]}>
            <sphereGeometry args={[0.1, 14, 12]} />
            <meshToonMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} />
          </mesh>
        </>
      ) : shipId === "scavenger" ? (
        <>
          {/* Scavenger: octahedron cargo hull + side pods + wing racks */}
          <mesh ref={fuselageRef} rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.38, 0]} />
            <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.45} />
          </mesh>
          <mesh ref={wingRef} position={[0, -0.06, 0.12]}>
            <boxGeometry args={[1.0, 0.08, 0.22]} />
            <meshToonMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.3} />
          </mesh>
          <mesh ref={nacelleRRef} position={[0.48, 0.02, 0.25]}>
            <boxGeometry args={[0.2, 0.16, 0.3]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.4} />
          </mesh>
          <mesh ref={nacelleLRef} position={[-0.48, 0.02, 0.25]}>
            <boxGeometry args={[0.2, 0.16, 0.3]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.4} />
          </mesh>
          {/* Cargo-grabber arms poking forward */}
          <mesh position={[0.2, -0.08, -0.3]} rotation={[0, 0, -0.15]}>
            <cylinderGeometry args={[0.03, 0.03, 0.36, 6]} />
            <meshToonMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[-0.2, -0.08, -0.3]} rotation={[0, 0, 0.15]}>
            <cylinderGeometry args={[0.03, 0.03, 0.36, 6]} />
            <meshToonMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.4} />
          </mesh>
        </>
      ) : shipId === "void" ? (
        <>
          {/* Void Prototype: crystalline octahedron core + floating wing shards */}
          <mesh ref={fuselageRef}>
            <octahedronGeometry args={[0.32, 0]} />
            <meshToonMaterial color="#60a5fa" emissive="#4c1d95" emissiveIntensity={0.7} />
          </mesh>
          <mesh ref={wingRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.55, 0.035, 8, 20]} />
            <meshToonMaterial color="#1d4ed8" emissive="#7c3aed" emissiveIntensity={0.6} />
          </mesh>
          {/* Floating shard panels */}
          <mesh ref={nacelleRRef} position={[0.52, 0.04, 0.1]} rotation={[0, 0, 0.4]}>
            <tetrahedronGeometry args={[0.14, 0]} />
            <meshToonMaterial color="#dc2626" emissive="#7c3aed" emissiveIntensity={0.7} />
          </mesh>
          <mesh ref={nacelleLRef} position={[-0.52, 0.04, 0.1]} rotation={[0, 0, -0.4]}>
            <tetrahedronGeometry args={[0.14, 0]} />
            <meshToonMaterial color="#dc2626" emissive="#7c3aed" emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[0, 0.08, -0.05]}>
            <sphereGeometry args={[0.09, 14, 12]} />
            <meshBasicMaterial color="#f0abfc" transparent opacity={0.9} />
          </mesh>
        </>
      ) : (
        <>
          {/* Falcon (default): balanced wedge fighter */}
          <mesh ref={fuselageRef} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.22, 1.0, 8]} />
            <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.45} />
          </mesh>
          <mesh ref={wingRef} position={[0, -0.03, 0.15]}>
            <boxGeometry args={[1.1, 0.06, 0.32]} />
            <meshToonMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.3} />
          </mesh>
          <mesh ref={nacelleRRef} position={[0.55, -0.03, 0.28]}>
            <boxGeometry args={[0.18, 0.05, 0.16]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
          </mesh>
          <mesh ref={nacelleLRef} position={[-0.55, -0.03, 0.28]}>
            <boxGeometry args={[0.18, 0.05, 0.16]} />
            <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 0.1, -0.18]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.13, 14, 12]} />
            <meshToonMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.7} />
          </mesh>
        </>
      )}
      <mesh ref={engineRef} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.75} />
      </mesh>
      {/* Bright inner core that pulses */}
      <mesh ref={engineCoreRef} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#fff7ed" />
      </mesh>
      {/* Long stretched plume — extra long during warp */}
      <mesh ref={engineTrailRef} position={[0, 0, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.7, 8, 1, true]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* Warp aura — only visible when warp power-up is active */}
      <mesh ref={warpAuraRef} visible={false}>
        <torusGeometry args={[0.85, 0.04, 12, 28]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.36, -0.03, 0.36]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.65} />
      </mesh>
      <mesh position={[-0.36, -0.03, 0.36]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.65} />
      </mesh>
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[0.85, 22, 18]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.2} wireframe />
      </mesh>
      {/* Magnet power-up indicator — green ring rotating around the ship's XY plane */}
      <mesh ref={magnetRingRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.95, 0.045, 10, 40]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
      </mesh>
      <mesh ref={magnetRingInnerRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[0.68, 0.025, 8, 32]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.35} />
      </mesh>
      <pointLight position={[0, 0, 0.7]} color={env.starColor} intensity={0.9} distance={3} />
    </group>
  );
}

function Obstacles({ gameRefs, env, tick }: { gameRefs: React.RefObject<GameRefs>; env: Environment; tick: number }) {
  const obstacles = gameRefs.current?.obstacles ?? [];
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const geos = useMemo(() => [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.OctahedronGeometry(1, 0),
  ], []);
  const baseMat = useMemo(() => new THREE.MeshToonMaterial({
    color: env.asteroidColor,
    emissive: env.asteroidEmissive,
    emissiveIntensity: 0.45,
  }), [env]);
  const heavyMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#475569",
    emissive: env.asteroidEmissive,
    emissiveIntensity: 0.3,
  }), [env]);

  // Smooth biome lerp — base + heavy materials inherit env target each frame.
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    baseMat.color.copy(g.asteroidColor);
    baseMat.emissive.copy(g.asteroidEmissive);
    heavyMat.emissive.copy(g.asteroidEmissive);
  });
  const speederMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#fbbf24",
    emissive: "#92400e",
    emissiveIntensity: 0.55,
  }), []);
  const wallMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#991b1b",          // deep crimson — reads as "hazard / do not shoot"
    emissive: "#dc2626",
    emissiveIntensity: 0.6,
  }), []);
  const shooterMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#f59e0b",          // amber — "this one shoots back"
    emissive: "#b45309",
    emissiveIntensity: 0.7,
  }), []);
  const zapperMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#06b6d4",          // cyan — "electric"
    emissive: "#0e7490",
    emissiveIntensity: 0.8,
  }), []);
  const droneMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#ec4899",          // hot pink — persistent hostile
    emissive: "#831843",
    emissiveIntensity: 0.7,
  }), []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useEffect(() => () => baseMat.dispose(), [baseMat]);
  useEffect(() => () => heavyMat.dispose(), [heavyMat]);
  useEffect(() => () => speederMat.dispose(), [speederMat]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);
  useEffect(() => () => shooterMat.dispose(), [shooterMat]);
  useEffect(() => () => zapperMat.dispose(), [zapperMat]);
  useEffect(() => () => droneMat.dispose(), [droneMat]);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const o of g.obstacles) {
      const m = meshRefs.current.get(o.id);
      if (m) {
        m.position.set(o.x, o.y, o.z);
        m.rotation.set(o.rx, o.ry, o.rz);
        m.scale.setScalar(o.size);
      }
    }
  });

  const matFor = (v: ObstacleVariant) =>
    v === "heavy" ? heavyMat
    : v === "speeder" ? speederMat
    : v === "wall" ? wallMat
    : v === "shooter" ? shooterMat
    : v === "zapper" ? zapperMat
    : v === "drone" ? droneMat
    : baseMat;

  return (
    <group>
      {obstacles.map((o) => (
        <mesh
          key={o.id}
          ref={(el) => {
            if (el) meshRefs.current.set(o.id, el);
            else meshRefs.current.delete(o.id);
          }}
          geometry={geos[o.shape]}
          material={matFor(o.variant)}
        />
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Bullets({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const bullets = gameRefs.current?.bullets ?? [];
  const cylGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  const sphGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 10), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.6, 1, 16), []);
  useEffect(() => () => { cylGeo.dispose(); sphGeo.dispose(); ringGeo.dispose(); }, [cylGeo, sphGeo, ringGeo]);

  const refs = useRef<Map<number, THREE.Object3D>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const b of g.bullets) {
      const o = refs.current.get(b.id);
      if (o) o.position.set(b.x, b.y, b.z);
    }
  });

  return (
    <group>
      {bullets.map((b) => {
        const setRef = (el: THREE.Object3D | null) => {
          if (el) refs.current.set(b.id, el);
          else refs.current.delete(b.id);
        };
        if (b.style === "sprite") {
          const w = b.size * 1.6;
          const h = b.size * 5;
          return (
            <sprite key={b.id} ref={setRef} scale={[w, h, 1]}>
              <spriteMaterial color={b.color} transparent opacity={0.95} />
            </sprite>
          );
        }
        if (b.style === "plasma") {
          return (
            <group key={b.id} ref={setRef}>
              <mesh geometry={sphGeo} scale={b.size * 1.8}>
                <meshBasicMaterial color={b.color} toneMapped={false} />
              </mesh>
              <mesh geometry={sphGeo} scale={b.size * 3}>
                <meshBasicMaterial color={b.color} transparent opacity={0.35} />
              </mesh>
              <mesh geometry={ringGeo} scale={b.size * 4} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color={b.color} transparent opacity={0.5} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        }
        return (
          <group key={b.id} ref={setRef}>
            <mesh geometry={sphGeo} scale={b.size * 1.35}>
              <meshBasicMaterial color={b.color} toneMapped={false} />
            </mesh>
            <mesh geometry={sphGeo} scale={b.size * 2.4}>
              <meshBasicMaterial color={b.color} transparent opacity={0.4} />
            </mesh>
          </group>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function PowerUps({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.powerUps ?? [];
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const octaGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const torusKnotGeo = useMemo(() => new THREE.TorusKnotGeometry(0.6, 0.18, 32, 6), []);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.5, 1, 6), []);
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  useEffect(() => () => {
    sphereGeo.dispose();
    octaGeo.dispose();
    torusKnotGeo.dispose();
    coneGeo.dispose();
  }, [sphereGeo, octaGeo, torusKnotGeo, coneGeo]);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const p of g.powerUps) {
      const grp = refs.current.get(p.id);
      if (grp) {
        grp.position.set(p.x, p.y, p.z);
        grp.rotation.set(p.rx, p.ry, p.rz);
      }
    }
  });

  return (
    <group>
      {list.map((p) => {
        const def = POWERUP_DEFS[p.type];
        return (
          <group
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
          >
            {/* Per-type 3D model so the player can recognize the pickup */}
            {p.type === "shield" && (
              <>
                {/* Wireframe shield bubble */}
                <mesh geometry={sphereGeo} scale={0.4}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.45} wireframe />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.28}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.8} />
                </mesh>
              </>
            )}
            {p.type === "triple" && (
              <>
                {/* Three small orbs in a triangle */}
                <mesh geometry={sphereGeo} scale={0.13} position={[0, 0.22, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[-0.22, -0.13, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[0.22, -0.13, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
              </>
            )}
            {p.type === "rapid" && (
              <mesh geometry={torusKnotGeo} scale={0.45}>
                <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.8} />
              </mesh>
            )}
            {p.type === "mega" && (
              <>
                {/* Big crystal core + halo */}
                <mesh geometry={octaGeo} scale={0.42}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.85} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.65}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.15} />
                </mesh>
              </>
            )}
            {p.type === "warp" && (
              <>
                {/* Forward-pointing chevron + halo ring suggesting speed */}
                <mesh geometry={coneGeo} scale={[0.35, 0.55, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.85} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.5}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.15} wireframe />
                </mesh>
              </>
            )}
            {p.type === "magnet" && (
              <>
                {/* Horseshoe magnet: half-torus body + two red pole caps + two white pole tips */}
                <mesh rotation={[0, 0, Math.PI]}>
                  <torusGeometry args={[0.28, 0.08, 10, 20, Math.PI]} />
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.8} />
                </mesh>
                {/* Left pole — red */}
                <mesh position={[-0.28, -0.06, 0]}>
                  <boxGeometry args={[0.12, 0.12, 0.12]} />
                  <meshToonMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
                </mesh>
                {/* Right pole — red */}
                <mesh position={[0.28, -0.06, 0]}>
                  <boxGeometry args={[0.12, 0.12, 0.12]} />
                  <meshToonMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
                </mesh>
                {/* White tips */}
                <mesh position={[-0.28, -0.14, 0]}>
                  <boxGeometry args={[0.14, 0.05, 0.14]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <mesh position={[0.28, -0.14, 0]}>
                  <boxGeometry args={[0.14, 0.05, 0.14]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              </>
            )}
            <pointLight color={def.color} intensity={0.8} distance={3.5} />
          </group>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function DashAfterimages({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.dashAfterimages ?? [];
  const now = gameRefs.current?.now ?? 0;
  return (
    <group>
      {list.map((a, i) => {
        const age = now - a.createdAt;
        const fade = Math.max(0, 1 - age / 400);
        return (
          <mesh key={`ai-${i}-${a.createdAt}`} position={a.pos}>
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={fade * 0.5} />
          </mesh>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function ZapperBeams({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const warnRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    const CYCLE_MS = 2500;
    const BEAM_MS = 1100;
    const WARN_MS = 350;    // pre-beam telegraph duration
    const RAMP_IN = 140;    // beam fade-in ms
    const RAMP_OUT = 220;   // beam fade-out ms
    for (const o of g.obstacles) {
      if (o.variant !== "zapper") continue;
      const mesh = meshRefs.current.get(o.id);
      const warn = warnRefs.current.get(o.id);
      const cycleAge = ((now - g.startedAt) + o.id * 317) % CYCLE_MS;
      const beamOn = cycleAge < BEAM_MS;
      const inVisZ = o.z > -25 && o.z < 2;

      // Main beam: smooth ramp-in and ramp-out with flicker on top
      if (mesh) {
        mesh.visible = beamOn && inVisZ;
        if (mesh.visible) {
          mesh.position.set(o.x, o.y, o.z);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          const ramp = cycleAge < RAMP_IN
            ? cycleAge / RAMP_IN
            : cycleAge > BEAM_MS - RAMP_OUT
              ? (BEAM_MS - cycleAge) / RAMP_OUT
              : 1;
          const flicker = 0.75 + Math.sin(now * 0.05) * 0.18 + (Math.random() - 0.5) * 0.08;
          const smoothed = Math.max(0, Math.min(1, ramp)) * flicker;
          mat.opacity = Math.max(0.05, Math.min(1, smoothed));
          // Scale X/Z in as beam ramps so it "blooms" open
          const widthT = Math.max(0.2, Math.min(1, ramp));
          mesh.scale.set(widthT, 1, widthT);
        }
      }

      // Pre-beam warning: dim cyan pulse in the last WARN_MS of the off-phase
      if (warn) {
        const offRemaining = CYCLE_MS - cycleAge; // ms until next beam-on
        const warning = !beamOn && offRemaining < WARN_MS && inVisZ;
        warn.visible = warning;
        if (warning) {
          warn.position.set(o.x, o.y, o.z);
          const mat = warn.material as THREE.MeshBasicMaterial;
          const t = 1 - offRemaining / WARN_MS; // 0→1 as beam approaches
          // Fast pulse that accelerates to cue the strike
          const pulse = 0.5 + 0.5 * Math.sin(now * (0.015 + t * 0.03));
          mat.opacity = 0.08 + pulse * 0.18 * (0.4 + t * 0.6);
          const wScale = 0.4 + t * 0.4;
          warn.scale.set(wScale, 1, wScale);
        }
      }
    }
  });
  const zappers = (gameRefs.current?.obstacles ?? []).filter((o) => o.variant === "zapper");
  return (
    <group ref={groupRef}>
      {zappers.map((o) => (
        <group key={`zap-${o.id}`}>
          {/* Warning telegraph column — wider, dim, pulses before the real beam */}
          <mesh
            ref={(el) => {
              if (el) warnRefs.current.set(o.id, el);
              else warnRefs.current.delete(o.id);
            }}
            visible={false}
          >
            <boxGeometry args={[0.7, 6, 0.7]} />
            <meshBasicMaterial color="#67e8f9" transparent opacity={0} />
          </mesh>
          <mesh
            ref={(el) => {
              if (el) meshRefs.current.set(o.id, el);
              else meshRefs.current.delete(o.id);
            }}
            visible={false}
          >
            <boxGeometry args={[0.45, 6, 0.45]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function SettingsToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-slate-200 cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
        aria-pressed={checked}
      >
        <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function BossMesh({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const b = gameRefs.current?.boss;
    if (!groupRef.current || !b) return;
    groupRef.current.position.set(b.position[0], b.position[1], b.position[2]);
    groupRef.current.rotation.y += b.phase === "dying" ? 0.2 : 0.02;
    if (b.phase === "dying") {
      const t = Math.min(1, (performance.now() - b.phaseStartAt) / 1200);
      groupRef.current.scale.setScalar(Math.max(0, 1 - t));
    } else {
      groupRef.current.scale.setScalar(1);
    }
  });
  const boss = gameRefs.current?.boss;
  if (!boss || boss.phase === "defeated") return null;
  if (boss.id === "sentinel") {
    return (
      <group ref={groupRef}>
        <mesh>
          <cylinderGeometry args={[1.2, 1.2, 0.4, 6]} />
          <meshStandardMaterial color="#1e293b" emissive="#ef4444" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.3]}>
          <torusGeometry args={[0.8, 0.15, 8, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "drifter") {
    return (
      <group ref={groupRef}>
        <mesh>
          <octahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.5} flatShading />
        </mesh>
        <mesh scale={[0.6, 0.6, 0.6]}>
          <octahedronGeometry args={[1.4, 0]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.4} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "swarm-mother") {
    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[1.6, 16, 12]} />
          <meshStandardMaterial color="#86198f" emissive="#a21caf" emissiveIntensity={0.4} />
        </mesh>
        <mesh scale={[1.2, 0.6, 1.2]}>
          <torusKnotGeometry args={[0.9, 0.2, 32, 8]} />
          <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "mirror") {
    return (
      <group ref={groupRef}>
        <mesh>
          <cylinderGeometry args={[1.4, 1.4, 0.2, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.15]}>
          <ringGeometry args={[1.0, 1.3, 32]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "pulsar") {
    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[1.2, 32, 24]} />
          <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={1.5} />
        </mesh>
        <pointLight intensity={3} distance={20} color="#fef08a" />
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "harvester") {
    const beam = (boss as unknown as { tractorBeam?: { active: boolean } }).tractorBeam;
    return (
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[2.5, 1.2, 2.5]} />
          <meshStandardMaterial color="#292524" emissive="#78350f" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, -0.8, 0]}>
          <coneGeometry args={[1.0, 0.8, 4]} />
          <meshStandardMaterial color="#44403c" metalness={0.8} roughness={0.2} />
        </mesh>
        {beam?.active && (
          <mesh position={[0, -5, 0]}>
            <boxGeometry args={[1.6, 10, 5]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.3} />
          </mesh>
        )}
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "warden") {
    return (
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[3.5, 2.5, 1]} />
          <meshStandardMaterial color="#dc2626" emissive="#991b1b" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.51]}>
          <ringGeometry args={[0.6, 0.9, 4]} />
          <meshBasicMaterial color="#fca5a5" side={THREE.DoubleSide} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "void-tyrant") {
    const hpPct = boss.hp / boss.hpMax;
    const color = hpPct > 0.66 ? "#581c87" : hpPct > 0.33 ? "#be185d" : "#f59e0b";
    return (
      <group ref={groupRef}>
        <mesh>
          <icosahedronGeometry args={[2.2, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} wireframe />
        </mesh>
        <mesh scale={[0.7, 0.7, 0.7]}>
          <icosahedronGeometry args={[2.2, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
        <pointLight intensity={2} distance={30} color={color} />
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  // Fallback placeholder for other bosses until their meshes ship
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.3, 0]} />
        <meshStandardMaterial color="#475569" emissive="#ef4444" emissiveIntensity={0.35} wireframe />
      </mesh>
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossWalls({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const boss = gameRefs.current?.boss;
  if (!boss || boss.id !== "warden") return null;
  const segs = (boss as unknown as { wallSegments?: BossWallSegment[] }).wallSegments ?? [];
  return (
    <group>
      {segs.map((s) =>
        s.isGap ? null : (
          <mesh
            key={`wall-${s.wallGroupId}-${s.gridIndex}`}
            position={s.position}
          >
            <boxGeometry args={[1.8, 1.8, 0.3]} />
            <meshStandardMaterial color="#991b1b" emissive="#ef4444" emissiveIntensity={0.3} />
          </mesh>
        )
      )}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossSubEntities({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const boss = gameRefs.current?.boss;
  const list = boss?.subEntities ?? [];
  useFrame(() => {
    // Position updates already in refs — JSX binds position directly
  });
  if (!boss) return null;
  return (
    <group>
      {list.map((d, idx) =>
        d.type === "drone" ? (
          <mesh key={`drone-${idx}-${d.createdAt}`} position={d.position}>
            <tetrahedronGeometry args={[0.35]} />
            <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
          </mesh>
        ) : null
      )}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossProjectiles({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.bossProjectiles ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const p of g.bossProjectiles) {
      const m = refs.current.get(p.id);
      if (m) {
        m.position.set(p.position[0], p.position[1], p.position[2]);
        m.scale.setScalar(p.radius);
      }
    }
  });
  return (
    <group>
      {list.map((p) => (
        <mesh
          key={p.id}
          geometry={geo}
          ref={(el) => {
            if (el) refs.current.set(p.id, el);
            else refs.current.delete(p.id);
          }}
        >
          <meshBasicMaterial color={p.color} toneMapped={false} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Coins({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.coins ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 12, 10), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Group>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const c of g.coins) {
      const grp = refs.current.get(c.id);
      if (grp) {
        grp.position.set(c.x, c.y, c.z);
        grp.rotation.set(c.rx, c.ry, c.rz);
      }
    }
  });

  return (
    <group>
      {list.map((c) => (
        <group
          key={c.id}
          ref={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
        >
          <mesh geometry={geo} scale={1.2}>
            <meshToonMaterial color="#fde047" emissive="#ca8a04" emissiveIntensity={0.6} />
          </mesh>
          <pointLight color="#fde047" intensity={0.4} distance={1.5} />
        </group>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Explosions({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const explosions = gameRefs.current?.explosions ?? [];
  const sphGeo = useMemo(() => new THREE.SphereGeometry(0.5, 12, 10), []);
  useEffect(() => () => sphGeo.dispose(), [sphGeo]);

  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const e of g.explosions) {
      const m = refs.current.get(e.id);
      if (m) {
        m.position.set(e.x, e.y, e.z);
        m.scale.setScalar(e.scale);
        (m.material as THREE.MeshBasicMaterial).opacity = e.opacity;
      }
    }
  });

  return (
    <group>
      {explosions.map((e) => (
        <mesh
          key={e.id}
          ref={(el) => {
            if (el) refs.current.set(e.id, el);
            else refs.current.delete(e.id);
          }}
          geometry={sphGeo}
        >
          <meshBasicMaterial color={e.color} transparent opacity={e.opacity} toneMapped={false} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

// Cache for canvas-rendered "+N" textures so each unique amount only creates
// one texture even if popups spawn frequently.
const SCORE_TEXTURE_CACHE = new Map<number, THREE.CanvasTexture>();
function scoreTexture(amount: number): THREE.CanvasTexture {
  const cached = SCORE_TEXTURE_CACHE.get(amount);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 64px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#fde047";
  const txt = `+${amount}`;
  ctx.strokeText(txt, c.width / 2, c.height / 2);
  ctx.fillText(txt, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  SCORE_TEXTURE_CACHE.set(amount, tex);
  return tex;
}

function ScorePopups({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const popups = gameRefs.current?.scorePopups ?? [];
  const refs = useRef<Map<number, THREE.Sprite>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const p of g.scorePopups) {
      const s = refs.current.get(p.id);
      if (s) {
        s.position.set(p.x, p.y, p.z);
        const age = (now - p.spawnedAt) / p.ttl;
        const mat = s.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, 1 - age);
        const scale = 0.9 + age * 0.7;
        s.scale.set(scale * 1.6, scale * 0.6, 1);
      }
    }
  });

  return (
    <group>
      {popups.map((p) => {
        const tex = scoreTexture(p.amount);
        return (
          <sprite
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            scale={[1.4, 0.55, 1]}
          >
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function DebrisField({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.debris ?? [];
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const d of g.debris) {
      const m = refs.current.get(d.id);
      if (m) {
        m.position.set(d.x, d.y, d.z);
        m.rotation.set(d.rx, d.ry, d.rz);
        const age = (now - d.spawnedAt) / d.ttl;
        const fade = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.4);
        const mat = m.material as THREE.MeshToonMaterial;
        mat.opacity = fade;
        mat.transparent = true;
      }
    }
  });
  return (
    <group>
      {list.map((d) => (
        <mesh
          key={d.id}
          ref={(el) => {
            if (el) refs.current.set(d.id, el);
            else refs.current.delete(d.id);
          }}
        >
          <boxGeometry args={d.size} />
          <meshToonMaterial color={d.color} emissive={d.color} emissiveIntensity={0.4} transparent />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function SpeedLines({ gameRefs, env, tick }: { gameRefs: React.RefObject<GameRefs>; env: Environment; tick: number }) {
  const lines = gameRefs.current?.speedLines ?? [];
  const geo = useMemo(() => new THREE.CylinderGeometry(0.014, 0.014, 1, 4), []);
  useEffect(() => () => geo.dispose(), [geo]);

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    // Dark-on-light (invertedArmed) needs higher opacity to register vs.
    // light-on-dark which can stay subtle.
    const opacityScale = g.invertedArmed ? 1.0 : 0.7;
    for (let i = 0; i < g.speedLines.length; i++) {
      const m = refs.current[i];
      const l = g.speedLines[i];
      if (m && l) {
        m.position.set(l.x, l.y, l.z);
        m.scale.set(1, l.length, 1);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = l.life * opacityScale;
        // Follow the lerped star color so speed lines stay visible against
        // the current background — dark lines in light mode, light lines
        // in dark mode.
        mat.color.copy(g.starColor);
      }
    }
  });

  return (
    <group>
      {lines.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={geo}
        >
          <meshBasicMaterial color={env.starColor} transparent opacity={0} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Starfield({ env }: { env: Environment }) {
  const points = useMemo(() => buildStarPoints(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial color={env.starColor} size={0.18} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}

function CameraRig({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { camera } = useThree();
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    applyCameraLerp(camera, g.cameraTargetX, g.cameraTargetY, g.cameraTargetZ, g.shipX * 0.4, g.shipY * 0.4);
  });
  return null;
}

// Pulls the camera back + widens FOV on portrait canvases so the playable
// arena fills the screen and the ship feels the same size relative to
// asteroids regardless of orientation. Eslint react-hooks/immutability flags
// `camera.fov = ...` directly so we route it through a module-level helper.
function configureCameraForOrientation(camera: THREE.Camera, portrait: boolean) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  camera.fov = portrait ? 75 : 60;
  // Z position only nudged here on first setup — runtime cameraTarget still
  // controls per-frame movement.
  camera.position.z = portrait ? 7.5 : 5;
  camera.updateProjectionMatrix();
}

function CameraConfigurator() {
  const { camera, size } = useThree();
  useEffect(() => {
    const portrait = size.height > size.width;
    configureCameraForOrientation(camera, portrait);
  }, [camera, size]);
  return null;
}

function GameLoop({
  gameRefs, onDeath, onUiSync,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
}) {
  const { viewport } = useThree();
  useFrame((_, dt) => {
    const g = gameRefs.current;
    if (!g) return;
    runTick(g, dt, viewport, onDeath, onUiSync);
  });
  return null;
}

// Module-level helpers — eslint react-hooks/immutability flags direct
// `scene.background = ...` writes inside hooks, but pushing them through a
// plain function it can't trace satisfies the rule.
function attachSceneBackground(scene: THREE.Scene, fallback: string) {
  if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(fallback);
  if (!scene.fog) scene.fog = new THREE.Fog(fallback, 18, 42);
}
function detachSceneBackground(scene: THREE.Scene) {
  scene.background = null;
  scene.fog = null;
}

// Imperatively syncs the scene background + fog colors to the lerped values
// in gameRefs each frame, so biome changes look like a smooth dissolve.
function BiomeBlender({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { scene } = useThree();
  useEffect(() => {
    attachSceneBackground(scene, "#0a0a1a");
    return () => detachSceneBackground(scene);
  }, [scene]);
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    if (scene.background instanceof THREE.Color) scene.background.copy(g.fogColor);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(g.fogColor);
  });
  return null;
}

function Scene({
  gameRefs, onDeath, onUiSync, env, tick, shipId,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
  env: Environment;
  tick: number;
  shipId: string;
}) {
  const bossFighting = gameRefs.current?.boss && gameRefs.current.boss.phase !== "defeated";
  const voidFight = bossFighting && gameRefs.current?.boss?.id === "void-tyrant";
  const ambientI = voidFight ? 0.05 : bossFighting ? 0.18 : 0.5;
  const dirI = voidFight ? 0.15 : bossFighting ? 0.35 : 0.7;
  return (
    <>
      <BiomeBlender gameRefs={gameRefs} />
      <ambientLight intensity={ambientI} color={bossFighting ? "#7f1d1d" : env.ambient} />
      <directionalLight position={[5, 6, 4]} intensity={dirI} />
      <Starfield env={env} />
      <SpeedLines gameRefs={gameRefs} env={env} tick={tick} />
      <Ship gameRefs={gameRefs} env={env} shipId={shipId} />
      <Obstacles gameRefs={gameRefs} env={env} tick={tick} />
      <ZapperBeams gameRefs={gameRefs} tick={tick} />
      <PowerUps gameRefs={gameRefs} tick={tick} />
      <Coins gameRefs={gameRefs} tick={tick} />
      <BossMesh gameRefs={gameRefs} tick={tick} />
      <BossProjectiles gameRefs={gameRefs} tick={tick} />
      <BossSubEntities gameRefs={gameRefs} tick={tick} />
      <BossWalls gameRefs={gameRefs} tick={tick} />
      <DashAfterimages gameRefs={gameRefs} tick={tick} />
      <Bullets gameRefs={gameRefs} tick={tick} />
      <Explosions gameRefs={gameRefs} tick={tick} />
      <ScorePopups gameRefs={gameRefs} tick={tick} />
      <DebrisField gameRefs={gameRefs} tick={tick} />
      <CameraConfigurator />
      <CameraRig gameRefs={gameRefs} />
      <GameLoop gameRefs={gameRefs} onDeath={onDeath} onUiSync={onUiSync} />
    </>
  );
}

// ---------- leaderboard helpers ----------

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number; // legacy from levelled mode — kept so old data still parses
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
  createdAt: string;
}

interface SubmitParams {
  name: string;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  region: string;
}

interface SubmitResult {
  ok: boolean;
  rank?: number;
}

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetch("/api/leaderboard", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
    .then((data) => (Array.isArray(data?.entries) ? (data.entries as LeaderboardEntry[]) : []))
    .catch(() => []);
}

async function submitScore(params: SubmitParams): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        score: params.score,
        // keep legacy shape on `level` so the route validates the old field
        level: 1,
        seconds: params.seconds,
        kills: params.kills,
        distance: params.distance,
        region: params.region,
      }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, rank: typeof data?.rank === "number" ? data.rank : undefined };
  } catch {
    return { ok: false };
  }
}

// Detect the player's country/region for the leaderboard. Free, no API key
// required. Falls back to "" silently if blocked.
async function detectRegion(): Promise<string> {
  try {
    const r = await fetch("https://ipapi.co/json/", { cache: "force-cache" });
    if (!r.ok) return "";
    const j = await r.json();
    if (typeof j?.country_name === "string" && j.country_name) return j.country_name;
    if (typeof j?.country_code === "string") return j.country_code;
  } catch {
    // ignored
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
    active: g.activePowerUps.map((p) => ({ type: p.type, remainingMs: Math.max(0, p.expiresAt - now) })),
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
      if (raw) return { ...prefs, ...(JSON.parse(raw) as Partial<SpaceShooterPrefs>) };

      const osReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (osReduced) return { ...prefs, reducedMotion: true };
    }
  } catch {
    // Keep defaults when profile/localStorage is unavailable.
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
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    // Sound is ON by default — but localStorage "0" persists explicit mute.
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  });
  useEffect(() => () => { sounds.destroy(); }, []);
  const [showInstructions, setShowInstructions] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [shopTab, setShopTab] = useState<"upgrades" | "consumables" | "ships" | "cosmetics" | "missions" | "achievements">("upgrades");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<SpaceShooterPrefs>(loadInitialPrefs);
  const [achievementToasts, setAchievementToasts] = useState<(Achievement & { firedAt: number })[]>([]);
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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        setRecordingBlob(new Blob(chunksRef.current, { type: "video/webm" }));
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingBlob(null);
    } catch (err) {
      console.warn("Recording failed to start:", err);
    }
  }, []);
  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    setIsRecording(false);
  }, []);
  const captureShareImage = useCallback(async (stats: { score: number; distance: number; kills: number }): Promise<Blob | null> => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return null;
    const w = 1200, h = 630;
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
  }, []);
  const [gyroSupported] = useState(detectGyroSupported);
  const [gyroPermission, setGyroPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const requestGyroPermission = useCallback(async (): Promise<boolean> => {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        setGyroPermission(result === "granted" ? "granted" : "denied");
        return result === "granted";
      } catch {
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
      if (e.gamma == null || e.beta == null) return;
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
      try { localStorage.setItem("orbital-dodge-prefs", JSON.stringify(prefs)); } catch { /* noop */ }
    }
    gameRefs.current.prefs = { ...prefs };
  }, [prefs]);
  // Persist "first boss seen" flag when boss enters fighting phase
  useEffect(() => {
    if (firstBossSeen) return;
    if (ui.boss?.phase === "fighting") {
      try {
        window.localStorage.setItem("orbital-dodge-first-boss-seen", "1");
      } catch { /* noop */ }
      const id = window.setTimeout(() => setFirstBossSeen(true), 0);
      return () => window.clearTimeout(id);
    }
  }, [ui.boss?.phase, firstBossSeen]);
  const buyUpgrade = useCallback((id: string) => {
    const def = upgradeById(id as "coin-magnet" | "coin-value" | "score-multiplier" | "combo-window" | "shield-duration");
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
  }, [profile, refreshProfile]);

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
      el.requestFullscreen?.().catch(() => { /* user denied or unsupported */ });
    } else {
      document.exitFullscreen?.();
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
      const dt = t - last; last = t;
      if (dt > 0) ema = ema * 0.92 + (1000 / dt) * 0.08;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const poll = setInterval(() => setDevFps(Math.round(ema)), 500);
    return () => { cancelAnimationFrame(raf); clearInterval(poll); };
  }, []);
  // Screen wake lock while actively playing (mobile); release when not
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    type WakeLockSentinel = { release: () => Promise<void> };
    type WakeLockAPI = { request: (t: "screen") => Promise<WakeLockSentinel> };
    const nav = navigator as Navigator & { wakeLock?: WakeLockAPI };
    if (!nav.wakeLock || ui.status !== "playing") return;
    let lock: WakeLockSentinel | null = null;
    (async () => {
      try { lock = await nav.wakeLock!.request("screen"); } catch { /* ignore */ }
    })();
    return () => { try { lock?.release(); } catch { /* ignore */ } };
  }, [ui.status]);
  // Haptic feedback on damage / boss defeat
  useEffect(() => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (prefs.reducedMotion) return;
    if (ui.status === "dying") (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate([60, 30, 60]);
  }, [ui.status, prefs.reducedMotion]);

  const env = useMemo(() => envForTime(ui.seconds), [ui.seconds]);

  const onUiSync = useCallback(() => {
    const g = gameRefs.current;
    const now = performance.now();
    setUi(createUiStateFromGame(g, now));
    setTick((t) => (t + 1) % 1_000_000);
  }, []);

  const onDeath = useCallback(() => {
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
        setAchievementToasts((t) => [...t, ...earned.map((a) => ({ ...a, firedAt: Date.now() }))]);
      }
    } catch { /* noop */ }
    // Update mission progress using this run's stats (max-of so multi-run peaks count)
    try {
      const p = loadProfile();
      const seconds = Math.floor(((g.dyingAt || performance.now()) - g.startedAt) / 1000);
      for (const m of p.missionsToday) {
        if (m.claimed) continue;
        // Bump by the greater of existing progress and this run's stat
        const nextVal =
          m.id === "kill-20-heavies" ? Math.max(m.progress, g.kills)
          : m.id === "kill-50" ? Math.max(m.progress, g.kills)
          : m.id === "reach-2km" ? Math.max(m.progress, Math.floor(g.distance))
          : m.id === "reach-5km" ? Math.max(m.progress, Math.floor(g.distance))
          : m.id === "score-5k" ? Math.max(m.progress, Math.floor(g.score))
          : m.id === "score-10k" ? Math.max(m.progress, Math.floor(g.score))
          : m.id === "survive-180-clean" ? Math.max(m.progress, seconds)
          : m.progress;
        m.progress = nextVal;
      }
      saveProfile(p);
    } catch { /* noop */ }
    const final = Math.floor(g.score * g.scoreMultiplier);
    // Compare against the current state value synchronously so the celebration
    // flag is correct in the same render cycle.
    const isPersonalBest = final > highScore && final > 0;
    if (isPersonalBest) {
      window.localStorage.setItem(HS_KEY, String(final));
      setHighScore(final);
    }
    setUi((u) => ({ ...u, status: "dead", score: final, kills: g.kills, distance: Math.floor(g.distance) }));
    setSubmitted(false);
    setCelebration(isPersonalBest ? "personal" : null);
    fetchLeaderboard().then(setLeaderboard);
    refreshProfile();
  }, [highScore, refreshProfile]);

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
    window.localStorage.setItem(NAME_KEY, trimmed);
    const result = await submitScore({
      name: trimmed,
      score: ui.score,
      seconds: Math.floor(ui.seconds),
      kills: ui.kills,
      distance: ui.distance,
      region,
    });
    if (result.ok) {
      setSubmitted(true);
      const fresh = await fetchLeaderboard();
      setLeaderboard(fresh);
      // World record overrides personal best celebration
      if (result.rank === 1 && ui.score > 0) {
        setCelebration("world");
      }
    }
  }, [name, ui.score, ui.seconds, ui.kills, ui.distance, region]);

  // Initial leaderboard load + region detection
  useEffect(() => {
    fetchLeaderboard().then(setLeaderboard);
    detectRegion().then(setRegion);
  }, []);

  // Sound toggle persistence
  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      // Persist explicit choice; "1" = on, "0" = off (default-on if missing)
      window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
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
      if (e.touches.length > 0) {
        e.preventDefault();
        ensureAudio();
        tryUnpause();
        updateTarget(e.touches[0].clientX, e.touches[0].clientY);
      }
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
          "sentinel", "drifter", "swarm-mother", "mirror",
          "pulsar", "harvester", "warden", "void-tyrant",
        ];
        const g = gameRefs.current;
        const currentIdx = g.boss ? bossIds.indexOf(g.boss.id) : -1;
        const nextIdx = (currentIdx + 1) % bossIds.length;
        g.boss = null;
        g.bossProjectiles.length = 0;
        spawnBoss(g, bossIds[nextIdx], 0);
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
        className={`relative rounded-xl border border-(--border) overflow-hidden mx-auto ${
          (ui.status === "playing" || ui.status === "armed" || ui.status === "paused") ? "touch-none" : "touch-auto"
        } ${
          isFullscreen
            ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-0"
            : "w-full aspect-3/4 sm:aspect-auto sm:h-115"
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
          <PostFx
            enabled={prefs.bloomEnabled}
            intensity={prefs.reducedMotion ? 0.5 : 1.0}
          />
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
                  className="absolute inset-0 flex flex-col bg-black/80 backdrop-blur-md z-10"
                >
                  {/* Sticky header + tabs — always visible so the player can
                      navigate between sub-sections without being forced to
                      close the shop. */}
                  <div className="sticky top-0 z-20 bg-black/85 backdrop-blur-md border-b border-white/10 px-4 pt-4 pb-2">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <ShoppingCart className="h-5 w-5 text-accent-amber" />
                        <h3 className="text-lg font-bold text-white">Shop</h3>
                        <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/20 border border-accent-amber/40 px-2 py-1 text-sm font-mono text-accent-amber">
                          <CoinsIcon className="h-3.5 w-3.5" />
                          {profile.walletCoins}
                        </div>
                      </div>
                      <button
                        onClick={() => setShopOpen(false)}
                        className="rounded-lg bg-white/10 border border-white/20 p-1.5 text-white hover:bg-white/20 transition-colors"
                        aria-label="Close shop"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 max-w-3xl mx-auto w-full overflow-x-auto">
                    {(["upgrades", "consumables", "ships", "cosmetics"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setShopTab(t)}
                        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide rounded border ${
                          shopTab === t ? "bg-accent-blue/25 border-accent-blue/60 text-white" : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
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
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-semibold text-white flex-1 truncate">{u.label}</span>
                              <div className="flex items-center gap-0.5" aria-label={`Level ${level} of ${u.maxLevel}`}>
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
                            <div className="flex items-center gap-1.5 mt-1 text-xs font-mono">
                              {maxed ? (
                                <span className="text-emerald-400">MAXED</span>
                              ) : (
                                <>
                                  <CoinsIcon className="h-3 w-3 text-accent-amber" />
                                  <span className={affordable ? "text-accent-amber" : "text-white/40"}>{nextCost}</span>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
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
                              <div className="font-semibold text-white text-sm">{c.label} <span className="text-xs text-slate-400">x{owned}</span></div>
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
                                  p.consumableInventory[c.id] = (p.consumableInventory[c.id] ?? 0) + 1;
                                  saveProfile(p);
                                  sounds.play("purchase");
                                  refreshProfile();
                                }
                              }}
                              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wide ${affordable ? "bg-accent-amber/20 border border-accent-amber/50 text-accent-amber" : "bg-white/5 border border-white/10 text-slate-500"}`}
                            >
                              Buy · {c.cost}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {shopTab === "ships" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
                      {SHIPS.map((s) => {
                        const owned = s.id === "falcon" || profile.ownedCosmetics.includes(`ship:${s.id}`);
                        const equipped = profile.equippedShip === s.id;
                        const affordable = profile.walletCoins >= s.unlockCost;
                        return (
                          <div
                            key={s.id}
                            className={`flex gap-3 rounded-lg border p-3 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                          >
                            <ShipPreview color={s.hullTint} shipId={s.id} />
                            <div className="flex flex-col gap-1 flex-1 min-w-0"><div className="flex items-center justify-between">
                              <span className="font-semibold text-white text-sm">{s.label}</span>
                              <span className="inline-block w-4 h-4 rounded border border-white/20" style={{ background: s.hullTint }} />
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
                                  className={`px-3 py-1 rounded text-xs font-bold uppercase ${equipped ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300" : "bg-accent-blue/20 border border-accent-blue/40 text-accent-blue"}`}
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
                                      if (!p.ownedCosmetics.includes(key)) p.ownedCosmetics.push(key);
                                      saveProfile(p);
                                      sounds.play("purchase");
                                      refreshProfile();
                                    }
                                  }}
                                  className={`px-3 py-1 rounded text-xs font-bold uppercase ${affordable ? "bg-accent-amber/20 border border-accent-amber/50 text-accent-amber" : "bg-white/5 border border-white/10 text-slate-500"}`}
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-3xl mx-auto w-full">
                      {COSMETICS.map((c) => {
                        const owned = profile.ownedCosmetics.includes(c.id);
                        const cond = c.unlockCondition;
                        let locked = false;
                        if (cond && cond !== "always") {
                          const val = cond.stat === "totalAsteroidsDestroyed" ? profile.totalAsteroidsDestroyed
                                    : cond.stat === "totalDistance" ? profile.totalDistance
                                    : profile.totalRunsPlayed;
                          locked = val < cond.atLeast;
                        }
                        const equippedId = c.slot === "hull" ? profile.equippedHull
                                         : c.slot === "engine" ? profile.equippedEngine
                                         : profile.equippedDeathFx;
                        const equipped = equippedId === c.id;
                        const affordable = profile.walletCoins >= c.cost;
                        return (
                          <div
                            key={c.id}
                            className={`flex flex-col items-start gap-1 rounded-lg border p-2 ${equipped ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/10 bg-white/5"} ${locked ? "opacity-60" : ""}`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <CosmeticPreview slot={c.slot} value={c.value} />
                              <span className="text-xs text-white font-semibold flex-1 truncate">{c.label}</span>
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
                                  else if (c.slot === "engine") p.equippedEngine = equipped ? null : c.id;
                                  else p.equippedDeathFx = equipped ? null : c.id;
                                  saveProfile(p);
                                  refreshProfile();
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${equipped ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300" : "bg-accent-blue/20 border border-accent-blue/40 text-accent-blue"}`}
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
                                    if (!p.ownedCosmetics.includes(c.id)) p.ownedCosmetics.push(c.id);
                                    saveProfile(p);
                                    sounds.play("purchase");
                                    refreshProfile();
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${affordable ? "bg-accent-amber/20 border border-accent-amber/50 text-accent-amber" : "bg-white/5 border border-white/10 text-slate-500"}`}
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
                  className="absolute inset-0 flex flex-col bg-black/80 backdrop-blur-md z-10"
                >
                  <div className="sticky top-0 z-20 bg-black/85 backdrop-blur-md border-b border-white/10 px-4 pt-4 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-accent-amber" />
                      <h3 className="text-lg font-bold text-white">Trophies</h3>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/50 font-bold">
                        {profile.unlockedAchievements.length} / {ACHIEVEMENTS.length}
                      </div>
                    </div>
                    <button
                      onClick={() => setAchievementsOpen(false)}
                      className="rounded-lg bg-white/10 border border-white/20 p-1.5 text-white hover:bg-white/20 transition-colors"
                      aria-label="Close trophies"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
                      {ACHIEVEMENTS.map((a) => {
                        const owned = profile.unlockedAchievements.includes(a.id);
                        return (
                          <div
                            key={a.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 ${
                              owned ? "border-amber-500/50 bg-amber-900/20" : "border-white/10 bg-white/5 opacity-70"
                            }`}
                          >
                            <div className={`flex items-center justify-center w-9 h-9 rounded font-black text-xs shrink-0 ${
                              owned ? "bg-amber-400 text-amber-900" : "bg-slate-700 text-slate-500"
                            }`}>
                              {a.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-bold text-sm ${owned ? "text-white" : "text-slate-400"}`}>
                                {a.name}
                              </div>
                              <div className="text-xs text-slate-400">{a.description}</div>
                              {a.unlocksCosmeticId && owned && (
                                <div className="text-[10px] text-emerald-400 mt-1">Unlocked cosmetic: {a.unlocksCosmeticId}</div>
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

            <div className="pointer-events-none absolute top-3 left-3 right-3 sm:right-auto flex flex-col gap-1.5 text-[10px] sm:text-sm">
              <div className="flex items-center gap-2 sm:gap-4 rounded-lg bg-black/50 backdrop-blur-sm px-2.5 sm:px-3 py-1.5 border border-white/10 flex-wrap">
                <span className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-accent-blue">
                  <Rocket className="h-3.5 w-3.5" />
                  {ui.score}
                </span>
                <span className="font-mono tabular-nums text-white/80">{ui.distance}m</span>
                <span className="font-mono tabular-nums text-white/80">{ui.kills} kills</span>
                {ui.combo > 1 && (
                  <motion.span
                    key={ui.combo}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="font-mono font-bold tabular-nums"
                    style={{ color: comboColor(ui.combo) }}
                  >
                    {"\u00d7"}{ui.combo}
                  </motion.span>
                )}
                <span className="font-mono tabular-nums text-white/50">{ui.seconds.toFixed(0)}s</span>
              </div>
              {/* Active power-ups */}
              {ui.active.length > 0 && (
                <div className="flex items-center gap-2">
                  {ui.active.map((a) => {
                    const def = POWERUP_DEFS[a.type];
                    const Icon = a.type === "shield" ? Shield : a.type === "triple" ? Crosshair : a.type === "rapid" ? Zap : a.type === "warp" ? Rocket : a.type === "magnet" ? Magnet : Target;
                    const pct = Math.min(100, (a.remainingMs / POWERUP_DURATION_MS) * 100);
                    return (
                      <div key={a.type} className="flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-sm px-2 py-1 border border-white/10" style={{ borderColor: `${def.color}55` }}>
                        <Icon className="h-3 w-3" style={{ color: def.color }} />
                        <div className="h-1 w-10 rounded-full bg-white/15 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: def.color }} />
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
                <div className="pointer-events-none flex items-center gap-1 rounded-lg bg-black/50 backdrop-blur-sm px-2.5 py-1.5 border border-white/10 text-xs font-mono tabular-nums text-accent-amber">
                  <Trophy className="h-3 w-3" />
                  {highScore}
                </div>
              )}
              <button
                onClick={togglePause}
                aria-label={ui.status === "paused" ? "Resume" : "Pause"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {ui.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={toggleSound}
                aria-label={soundEnabled ? "Mute" : "Unmute"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Biome label — bottom center */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/40">
              <span className="h-1 w-1 rounded-full bg-accent-blue/60 animate-pulse" />
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
              <div className="text-xs uppercase tracking-[0.3em] text-white/60 font-bold">
                Paused
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePause}
                className="rounded-xl bg-white/10 border border-white/20 backdrop-blur-md px-6 py-2.5 text-sm font-semibold text-white"
              >
                Resume
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Achievement toasts */}
        {achievementToasts.length > 0 && (
          <div className="absolute top-14 right-4 flex flex-col gap-2 z-40 pointer-events-none">
            {achievementToasts.map((a) => (
              <div
                key={`${a.id}-${a.firedAt}`}
                className="flex items-center gap-3 bg-amber-900/80 backdrop-blur-sm border border-amber-400/60 rounded-lg px-4 py-2 min-w-[220px]"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded bg-amber-400 text-amber-900 font-black text-xs">
                  {a.icon}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-amber-200 tracking-wide">ACHIEVEMENT</div>
                  <div className="font-bold text-white text-sm">{a.name}</div>
                  <div className="text-xs text-amber-100">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dev-only FPS + object counts */}
        {process.env.NODE_ENV !== "production" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 text-[10px] font-mono text-white z-30 rounded">
            {devFps} fps · obs {ui.objectCounts.obstacles} · proj {ui.objectCounts.bossProjectiles} · exp {ui.objectCounts.explosions}
          </div>
        )}

        {/* Dash cooldown indicator (playing only) */}
        {ui.status === "playing" && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 z-20 pointer-events-none">
            <div className="text-[10px] tracking-[0.2em] text-slate-400">DASH</div>
            <div className="w-16 h-1.5 bg-black/40 rounded overflow-hidden">
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
            className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/50 border border-white/20 text-xs text-white hover:bg-black/70 z-30"
            type="button"
          >
            <span className={`inline-block w-2 h-2 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-white/50"}`} />
            {isRecording ? "Stop" : "Record"}
          </button>
        )}
        {/* Settings gear (idle or dead only) */}
        {(ui.status === "armed" || ui.status === "dead") && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-3 right-3 p-2 rounded bg-black/40 border border-white/20 hover:bg-black/60 transition z-30 text-white"
            aria-label="Settings"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        {settingsOpen && (
          <div
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-40"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="bg-slate-900 border border-white/20 rounded-lg p-5 min-w-[260px] max-w-[90%]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
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
                <SettingsToggle label="Reduced motion" checked={prefs.reducedMotion} onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))} />
                <SettingsToggle label="Bloom / glow" checked={prefs.bloomEnabled} onChange={(v) => setPrefs((p) => ({ ...p, bloomEnabled: v }))} />
                <SettingsToggle label="Music" checked={prefs.musicEnabled} onChange={(v) => setPrefs((p) => ({ ...p, musicEnabled: v }))} />
                <SettingsToggle label="SFX" checked={prefs.sfxEnabled} onChange={(v) => setPrefs((p) => ({ ...p, sfxEnabled: v }))} />
                {gyroSupported && (
                  <div>
                    <SettingsToggle
                      label="Gyro controls"
                      checked={prefs.gyroEnabled}
                      onChange={async (v) => {
                        if (v && gyroPermission !== "granted") {
                          const ok = await requestGyroPermission();
                          if (!ok) return;
                        }
                        setPrefs((p) => ({ ...p, gyroEnabled: v }));
                      }}
                    />
                    {gyroPermission === "denied" && (
                      <div className="text-[10px] text-red-400 mt-1">
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
          <div className="absolute inset-x-0 top-[18%] flex flex-col items-center pointer-events-none z-30">
            <div className="text-xs tracking-[0.4em] text-red-400 animate-pulse">INCOMING</div>
            <div className="text-3xl sm:text-5xl font-black text-white drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">
              {BOSS_DISPLAY_NAMES[ui.boss.id]}
            </div>
            {!firstBossSeen && (
              <div className="mt-2 text-xs text-slate-300 max-w-xs text-center">
                Bosses interrupt normal flight. Shoot them to progress. Dodge their attacks.
              </div>
            )}
          </div>
        )}
        {/* Boss HP bar */}
        {ui.boss?.phase === "fighting" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-30">
            <div className="text-[10px] tracking-[0.3em] text-red-300">
              {BOSS_DISPLAY_NAMES[ui.boss.id]}
            </div>
            <div className="w-48 sm:w-64 h-2 bg-black/60 border border-red-500/50 overflow-hidden rounded-sm">
              <div
                className="h-full bg-linear-to-r from-red-600 to-red-400 transition-[width] duration-100"
                style={{ width: `${ui.boss.hpPct}%` }}
              />
            </div>
            {ui.boss.id === "swarm-mother" &&
              ui.boss.hasDrone && (
                <div className="text-[10px] tracking-[0.3em] text-fuchsia-300 animate-pulse">
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
                className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-10 py-3 text-lg font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-blue/30"
                type="button"
              >
                Play
              </motion.button>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
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
              <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/15 border border-accent-amber/40 px-2.5 py-1 text-xs font-mono text-accent-amber">
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
                  className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-7 py-3 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-blue/30"
                >
                  Play
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShopOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-5 py-3 text-sm font-bold uppercase tracking-wider text-accent-amber"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Shop
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setAchievementsOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white/80"
                >
                  <Trophy className="h-4 w-4" />
                  Trophies
                </motion.button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                {isTouch ? "Drag to steer · cannons auto-fire" : "Mouse or WASD to steer · cannons auto-fire"}
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
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
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
                        transition={{ duration: celebration === "world" ? 1.8 : 1.3, ease: "easeOut", delay: c.id * 0.012 }}
                        style={{ background: c.color }}
                      />
                    ))}
                  </>
                )}
                <div className="text-xs uppercase tracking-[0.3em] text-red-400 font-bold">
                  Ship destroyed
                </div>
                <div className="mt-1 text-4xl sm:text-5xl font-black font-display text-white tabular-nums">
                  {ui.score}
                </div>
                {celebration === "world" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-linear-to-br from-accent-amber via-accent-pink to-accent-blue px-4 py-1.5 text-sm font-black uppercase tracking-widest text-black"
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
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-amber/20 border border-accent-amber/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent-amber"
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
                    className="mt-2 flex items-center justify-center gap-1.5 text-accent-amber font-mono text-sm"
                  >
                    <CoinsIcon className="h-4 w-4" />
                    +{ui.coinsThisRun} coins
                  </motion.div>
                )}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-white/75 max-w-md mx-auto px-2">
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Survived</div>
                    <div className="font-mono text-white tabular-nums">{ui.seconds.toFixed(0)}s</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Distance</div>
                    <div className="font-mono text-white tabular-nums">{ui.distance}m</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Kills</div>
                    <div className="font-mono text-white tabular-nums">{ui.kills}</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Peak Combo</div>
                    <div className="font-mono text-white tabular-nums" style={{ color: comboColor(ui.comboPeak) }}>{"\u00d7"}{ui.comboPeak}</div>
                  </div>
                </div>
                {ui.bossesDefeatedThisRun > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-red-300 font-mono text-sm">
                    <span>Bosses Defeated:</span>
                    <span className="text-white font-bold">{ui.bossesDefeatedThisRun}</span>
                  </div>
                )}
              </motion.div>

              <div className="w-full max-w-md flex items-center gap-2">
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
                  onClick={submit}
                  disabled={submitted}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitted ? "Submitted" : "Submit"}
                </motion.button>
              </div>

              {leaderboard.length > 0 && (
                <div className="w-full max-w-md rounded-lg border border-white/15 bg-white/5 p-3 text-sm">
                  <div className="text-xs uppercase tracking-widest text-white/60 mb-2 font-bold">
                    Top pilots
                  </div>
                  <ol className="space-y-1">
                    {leaderboard.slice(0, 8).map((e, i) => (
                      <li key={`${e.name}-${e.createdAt}-${i}`} className="flex items-center gap-2 text-white/85">
                        <span className="text-white/40 w-5 tabular-nums">{i + 1}.</span>
                        <span className="flex-1 truncate">
                          {e.name}
                          {e.region && <span className="ml-1.5 text-white/40 text-xs">{e.region}</span>}
                        </span>
                        {typeof e.seconds === "number" && (
                          <span className="text-white/45 text-xs tabular-nums">{e.seconds}s</span>
                        )}
                        <span className="font-mono tabular-nums">{e.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={launch}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-blue/20 border border-accent-blue/50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-accent-blue"
                >
                  <RotateCcw className="h-4 w-4" />
                  Fly again
                </motion.button>
                {isReturningPlayer && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShopOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-accent-amber"
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
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-400/50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300"
                  >
                    Download Replay
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={async () => {
                    const blob = await captureShareImage({
                      score: ui.score,
                      distance: ui.distance,
                      kills: ui.kills,
                    });
                    if (!blob) return;
                    const file = new File([blob], `orbital-dodge-${Date.now()}.png`, { type: "image/png" });
                    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void> };
                    if (nav.canShare?.({ files: [file] }) && nav.share) {
                      try {
                        await nav.share({ title: "Orbital Dodge", text: `Score: ${ui.score}`, files: [file] });
                        return;
                      } catch { /* fall through to download */ }
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = file.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-300"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-xs text-(--muted)">
        Endless run. Pick up power-ups for temporary firepower or shield. Biome shifts every 35s — and the asteroids get meaner the longer you survive.
      </p>
    </div>
  );
}
