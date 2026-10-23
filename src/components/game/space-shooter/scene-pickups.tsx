import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type GameRefs, POWERUP_DEFS } from "./types";
import { glowTexture } from "./scene-textures";

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
  const glowTex = useMemo(() => glowTexture(), []);
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
            <sprite scale={1.4}>
              <spriteMaterial
                map={glowTex}
                color={def.color}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                transparent
                opacity={0.5}
              />
            </sprite>
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

export function Coins({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.coins ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 12, 10), []);
  const glowTex = useMemo(() => glowTexture(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  const trailRefs = useRef<Map<number, THREE.Sprite>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const c of g.coins) {
      const grp = refs.current.get(c.id);
      if (grp) {
        grp.position.set(c.x, c.y, c.z);
        grp.rotation.set(c.rx, c.ry, c.rz);
      }
      // Magnetised coins (non-zero lateral velocity) leave a short fading
      // streak behind them, pointing back from the direction of travel.
      const trail = trailRefs.current.get(c.id);
      if (trail) {
        const speed = Math.hypot(c.vx, c.vy);
        trail.visible = speed > 0.6;
        if (trail.visible) {
          // Magnet speeds sit around 0.6-2.5, so the streak is sized for that range and centred
          // behind the coin's halo; a short, faint one hid inside the halo.
          const len = Math.min(2.2, 0.9 + speed * 0.45);
          const back = (len * 0.5) / speed;
          trail.position.set(c.x - c.vx * back, c.y - c.vy * back, c.z);
          trail.scale.set(len, 0.38, 1);
          // Sprite rotation is screen-space (CCW, y up), so the long axis follows the travel direction.
          (trail.material as THREE.SpriteMaterial).rotation = Math.atan2(c.vy, c.vx);
          (trail.material as THREE.SpriteMaterial).opacity = Math.min(0.6, 0.25 + speed * 0.12);
        }
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
          <sprite scale={0.9}>
            <spriteMaterial
              map={glowTex}
              color="#fde047"
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              transparent
              opacity={0.5}
            />
          </sprite>
        </group>
      ))}
      {list.map((c) => (
        <sprite
          key={`trail-${c.id}`}
          visible={false}
          ref={(el) => {
            if (el) trailRefs.current.set(c.id, el);
            else trailRefs.current.delete(c.id);
          }}
        >
          <spriteMaterial
            map={glowTex}
            color="#fbbf24"
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            transparent
            opacity={0}
          />
        </sprite>
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
