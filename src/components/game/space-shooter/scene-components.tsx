import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  type Environment,
  type ObstacleVariant,
  type BossWallSegment,
  type GameRefs,
  POWERUP_DURATION_MS,
  POWERUP_DEFS,
  isPowerUpActive,
} from "./types";
import { runTick } from "./game-tick";

// ---------- helpers ----------

// Module-level mutation helper — keeps eslint react-hooks/immutability happy
// when applying camera lerp inside useFrame
function applyCameraLerp(
  camera: THREE.Camera,
  tx: number,
  ty: number,
  tz: number,
  lookX: number,
  lookY: number,
) {
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

export function Ship({
  gameRefs,
  env,
  shipId,
}: {
  gameRefs: React.RefObject<GameRefs>;
  env: Environment;
  shipId: string;
}) {
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
      grpRef.current.visible = now - g.dyingAt < 1500;
    } else {
      // Per-ship movement feel:
      //   juggernaut: heavy, slow-to-bank (0.11) with a low-freq bob
      //   phantom:    snappy, twitchy banks (0.28), fast lateral yaw
      //   scavenger:  stable cargo roll + gentle vertical float
      //   void:       drifts on a low-freq sine yaw
      //   falcon:     baseline
      const sid = g.shipId;
      const pitchLerp =
        sid === "juggernaut" ? 0.11 : sid === "phantom" ? 0.28 : sid === "void" ? 0.22 : 0.18;
      const targetPitch = THREE.MathUtils.clamp((g.targetY - g.shipY) * 0.18, -0.25, 0.25);
      grpRef.current.rotation.x = THREE.MathUtils.lerp(
        grpRef.current.rotation.x,
        targetPitch,
        pitchLerp,
      );
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
        (mat as THREE.MeshBasicMaterial).transparent =
          isWarping || (mat as THREE.MeshBasicMaterial).transparent;
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
      const baseStretch =
        sid === "phantom" ? 2.2 : sid === "juggernaut" ? 1.2 : sid === "scavenger" ? 1.15 : 1.6;
      const baseWiden =
        sid === "juggernaut" ? 1.3 : sid === "scavenger" ? 1.2 : sid === "phantom" ? 0.55 : 0.9;
      const jitter = sid === "void" ? (Math.random() - 0.5) * 0.25 : 0;
      const stretch = isWarping
        ? 3.4 + Math.sin(now * 0.05) * 0.4
        : baseStretch + Math.sin(now * 0.025) * 0.4 + jitter;
      const widen = isWarping ? 2.0 : baseWiden;
      engineTrailRef.current.scale.set(widen, widen, stretch);
      engineTrailRef.current.position.z = 0.55 + 0.7 * stretch * 0.5;
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

export function Obstacles({
  gameRefs,
  env,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  env: Environment;
  tick: number;
}) {
  const obstacles = gameRefs.current?.obstacles ?? [];
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const geos = useMemo(
    () => [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
    ],
    [],
  );
  const baseMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: env.asteroidColor,
        emissive: env.asteroidEmissive,
        emissiveIntensity: 0.45,
      }),
    [env],
  );
  const heavyMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#475569",
        emissive: env.asteroidEmissive,
        emissiveIntensity: 0.3,
      }),
    [env],
  );

  // Smooth biome lerp — base + heavy materials inherit env target each frame.
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    baseMat.color.copy(g.asteroidColor);
    baseMat.emissive.copy(g.asteroidEmissive);
    heavyMat.emissive.copy(g.asteroidEmissive);
  });
  const speederMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#fbbf24",
        emissive: "#92400e",
        emissiveIntensity: 0.55,
      }),
    [],
  );
  const wallMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#991b1b", // deep crimson — reads as "hazard / do not shoot"
        emissive: "#dc2626",
        emissiveIntensity: 0.6,
      }),
    [],
  );
  const shooterMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#f59e0b", // amber — "this one shoots back"
        emissive: "#b45309",
        emissiveIntensity: 0.7,
      }),
    [],
  );
  const zapperMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#06b6d4", // cyan — "electric"
        emissive: "#0e7490",
        emissiveIntensity: 0.8,
      }),
    [],
  );
  const droneMat = useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color: "#ec4899", // hot pink — persistent hostile
        emissive: "#831843",
        emissiveIntensity: 0.7,
      }),
    [],
  );
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
    v === "heavy"
      ? heavyMat
      : v === "speeder"
        ? speederMat
        : v === "wall"
          ? wallMat
          : v === "shooter"
            ? shooterMat
            : v === "zapper"
              ? zapperMat
              : v === "drone"
                ? droneMat
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function Bullets({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const bullets = gameRefs.current?.bullets ?? [];
  const cylGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  const sphGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 10), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.6, 1, 16), []);
  useEffect(
    () => () => {
      cylGeo.dispose();
      sphGeo.dispose();
      ringGeo.dispose();
    },
    [cylGeo, sphGeo, ringGeo],
  );

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
                <meshBasicMaterial
                  color={b.color}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                />
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function PowerUps({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const list = gameRefs.current?.powerUps ?? [];
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const octaGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const torusKnotGeo = useMemo(() => new THREE.TorusKnotGeometry(0.6, 0.18, 32, 6), []);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.5, 1, 6), []);
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  useEffect(
    () => () => {
      sphereGeo.dispose();
      octaGeo.dispose();
      torusKnotGeo.dispose();
      coneGeo.dispose();
    },
    [sphereGeo, octaGeo, torusKnotGeo, coneGeo],
  );

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
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.8}
                  />
                </mesh>
              </>
            )}
            {p.type === "triple" && (
              <>
                {/* Three small orbs in a triangle */}
                <mesh geometry={sphereGeo} scale={0.13} position={[0, 0.22, 0]}>
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.7}
                  />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[-0.22, -0.13, 0]}>
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.7}
                  />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[0.22, -0.13, 0]}>
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.7}
                  />
                </mesh>
              </>
            )}
            {p.type === "rapid" && (
              <mesh geometry={torusKnotGeo} scale={0.45}>
                <meshToonMaterial
                  color={def.color}
                  emissive={def.emissive}
                  emissiveIntensity={0.8}
                />
              </mesh>
            )}
            {p.type === "mega" && (
              <>
                {/* Big crystal core + halo */}
                <mesh geometry={octaGeo} scale={0.42}>
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.85}
                  />
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
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.85}
                  />
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
                  <meshToonMaterial
                    color={def.color}
                    emissive={def.emissive}
                    emissiveIntensity={0.8}
                  />
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function DashAfterimages({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function ZapperBeams({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const warnRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    const CYCLE_MS = 2500;
    const BEAM_MS = 1100;
    const WARN_MS = 350; // pre-beam telegraph duration
    const RAMP_IN = 140; // beam fade-in ms
    const RAMP_OUT = 220; // beam fade-out ms
    for (const o of g.obstacles) {
      if (o.variant !== "zapper") continue;
      const mesh = meshRefs.current.get(o.id);
      const warn = warnRefs.current.get(o.id);
      const cycleAge = (now - g.startedAt + o.id * 317) % CYCLE_MS;
      const beamOn = cycleAge < BEAM_MS;
      const inVisZ = o.z > -25 && o.z < 2;

      // Main beam: smooth ramp-in and ramp-out with flicker on top
      if (mesh) {
        mesh.visible = beamOn && inVisZ;
        if (mesh.visible) {
          mesh.position.set(o.x, o.y, o.z);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          const ramp =
            cycleAge < RAMP_IN
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function BossMesh({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </group>
    );
  }
  if (boss.id === "drifter") {
    return (
      <group ref={groupRef}>
        <mesh>
          <octahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive="#0284c7"
            emissiveIntensity={0.5}
            flatShading
          />
        </mesh>
        <mesh scale={[0.6, 0.6, 0.6]}>
          <octahedronGeometry args={[1.4, 0]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.4} />
        </mesh>
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
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
        <group visible={false}>
          <mesh>
            <boxGeometry args={[0, 0, tick * 0]} />
            <meshBasicMaterial />
          </mesh>
        </group>
      </group>
    );
  }
  // Fallback placeholder for other bosses until their meshes ship
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.3, 0]} />
        <meshStandardMaterial
          color="#475569"
          emissive="#ef4444"
          emissiveIntensity={0.35}
          wireframe
        />
      </mesh>
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function BossWalls({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const boss = gameRefs.current?.boss;
  if (!boss || boss.id !== "warden") return null;
  const segs = (boss as unknown as { wallSegments?: BossWallSegment[] }).wallSegments ?? [];
  return (
    <group>
      {segs.map((s) =>
        s.isGap ? null : (
          <mesh key={`wall-${s.wallGroupId}-${s.gridIndex}`} position={s.position}>
            <boxGeometry args={[1.8, 1.8, 0.3]} />
            <meshStandardMaterial color="#991b1b" emissive="#ef4444" emissiveIntensity={0.3} />
          </mesh>
        ),
      )}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function BossSubEntities({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
        ) : null,
      )}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function BossProjectiles({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function Coins({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function Explosions({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
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

export function ScorePopups({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function DebrisField({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
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
          <meshToonMaterial
            color={d.color}
            emissive={d.color}
            emissiveIntensity={0.4}
            transparent
          />
        </mesh>
      ))}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function SpeedLines({
  gameRefs,
  env,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  env: Environment;
  tick: number;
}) {
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
          ref={(el) => {
            refs.current[i] = el;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={geo}
        >
          <meshBasicMaterial color={env.starColor} transparent opacity={0} />
        </mesh>
      ))}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
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
      <pointsMaterial
        color={env.starColor}
        size={0.18}
        sizeAttenuation
        transparent
        opacity={0.85}
      />
    </points>
  );
}

function CameraRig({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { camera } = useThree();
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    applyCameraLerp(
      camera,
      g.cameraTargetX,
      g.cameraTargetY,
      g.cameraTargetZ,
      g.shipX * 0.4,
      g.shipY * 0.4,
    );
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
  gameRefs,
  onDeath,
  onUiSync,
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

export function Scene({
  gameRefs,
  onDeath,
  onUiSync,
  env,
  tick,
  shipId,
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
