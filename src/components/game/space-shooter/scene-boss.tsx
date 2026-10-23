import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type GameRefs } from "./types";

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
    const beam = boss.tractorBeam;
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
  const segs = boss.wallSegments ?? [];
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
