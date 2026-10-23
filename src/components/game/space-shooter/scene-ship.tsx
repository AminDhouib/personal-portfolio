import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type Environment, type GameRefs, POWERUP_DURATION_MS, isPowerUpActive } from "./types";
import { glowTexture } from "./scene-textures";

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
  const glowTex = useMemo(() => glowTexture(), []);
  const lastHullHex = useRef("");
  const lastEngineHex = useRef("");

  useFrame(() => {
    const g = gameRefs.current;
    if (!g || !grpRef.current) return;
    const now = performance.now();
    grpRef.current.position.set(g.shipX, g.shipY, g.shipZ);
    grpRef.current.rotation.z = g.shipRotZ;
    // Apply equipped-hull tint to ALL hull parts (fuselage + wings +
    // nacelles). A slightly darker variant goes on the wing box so the
    // silhouette still reads as layered even with a solid cosmetic color.
    if (g.shipHullTint !== lastHullHex.current) {
      lastHullHex.current = g.shipHullTint;
      tintColor.set(g.shipHullTint);
    }
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
    if (g.shipEngineTint !== lastEngineHex.current) {
      lastEngineHex.current = g.shipEngineTint;
      engineColor.set(g.shipEngineTint);
    }
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
      <sprite position={[0, 0, 0.55]} scale={0.5}>
        <spriteMaterial
          map={glowTex}
          color={env.starColor}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
          opacity={0.6}
        />
      </sprite>
      {/* Bright inner core that pulses */}
      <mesh ref={engineCoreRef} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#fff7ed" />
      </mesh>
      {/* Long stretched plume — extra long during warp */}
      <mesh ref={engineTrailRef} position={[0, 0, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.7, 8, 1, true]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
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
              <spriteMaterial
                color={b.color}
                transparent
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
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
                <meshBasicMaterial
                  color={b.color}
                  transparent
                  opacity={0.35}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
              <mesh geometry={ringGeo} scale={b.size * 4} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial
                  color={b.color}
                  transparent
                  opacity={0.5}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
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
              <meshBasicMaterial
                color={b.color}
                transparent
                opacity={0.4}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
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
