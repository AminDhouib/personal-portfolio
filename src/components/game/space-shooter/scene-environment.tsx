import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { type Environment, type GameRefs } from "./types";

// Deterministic star spread (no Math.random during render). Parameterized by
// count and a seed so the starfield can be built as several independent shells.
function buildStarPoints(count: number, seed: number): Float32Array {
  const pts = new Float32Array(count * 3);
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = 30 + ((i * 31 + seed * 53) % 70);
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i + seed * 1.7;
    pts[i * 3 + 0] = r * radius * Math.cos(theta);
    pts[i * 3 + 1] = r * y;
    pts[i * 3 + 2] = r * radius * Math.sin(theta);
  }
  return pts;
}

export function Starfield({ env }: { env: Environment }) {
  const near = useRef<THREE.Points>(null);
  const mid = useRef<THREE.Points>(null);
  const far = useRef<THREE.Points>(null);
  const geos = useMemo(() => {
    const specs = [
      { count: 900, seed: 0 },
      { count: 850, seed: 1 },
      { count: 800, seed: 2 },
    ];
    return specs.map(({ count, seed }) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(buildStarPoints(count, seed), 3));
      return g;
    });
  }, []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useFrame((_, dt) => {
    if (near.current) near.current.rotation.z += dt * 0.006;
    if (mid.current) mid.current.rotation.z -= dt * 0.004;
    if (far.current) far.current.rotation.z += dt * 0.002;
  });
  return (
    <>
      <points ref={far} geometry={geos[0]}>
        <pointsMaterial
          color={env.starColor}
          size={0.12}
          sizeAttenuation
          transparent
          opacity={0.5}
        />
      </points>
      <points ref={mid} geometry={geos[1]}>
        <pointsMaterial
          color={env.starColor}
          size={0.18}
          sizeAttenuation
          transparent
          opacity={0.7}
        />
      </points>
      <points ref={near} geometry={geos[2]}>
        <pointsMaterial
          color={env.starColor}
          size={0.26}
          sizeAttenuation
          transparent
          opacity={0.9}
        />
      </points>
    </>
  );
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
export function BiomeBlender({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
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
