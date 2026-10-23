import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type Environment, type ObstacleVariant, type GameRefs } from "./types";

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
