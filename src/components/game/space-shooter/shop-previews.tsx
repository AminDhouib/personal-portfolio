"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function SpinningPreviewMesh({ color, shipId }: { color: string; shipId: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 1.2;
      ref.current.rotation.x = Math.sin(performance.now() * 0.0008) * 0.2;
    }
  });
  const darker = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.72);
    return `#${c.getHexString()}`;
  }, [color]);
  if (shipId === "juggernaut") {
    return (
      <group ref={ref}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 1.1, 8]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, -0.08, 0.12]}>
          <boxGeometry args={[1.4, 0.14, 0.4]} />
          <meshStandardMaterial
            color={darker}
            emissive={darker}
            emissiveIntensity={0.35}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0.45, -0.02, 0.55]}>
          <cylinderGeometry args={[0.09, 0.09, 0.32, 8]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.9} />
        </mesh>
        <mesh position={[-0.45, -0.02, 0.55]}>
          <cylinderGeometry args={[0.09, 0.09, 0.32, 8]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.9} />
        </mesh>
      </group>
    );
  }
  if (shipId === "phantom") {
    return (
      <group ref={ref}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 1.4, 6]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.6}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, -0.02, 0.25]}>
          <coneGeometry args={[0.75, 0.06, 4]} />
          <meshStandardMaterial
            color={darker}
            emissive={darker}
            emissiveIntensity={0.4}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, -0.02, 0.68]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.95} />
        </mesh>
      </group>
    );
  }
  if (shipId === "scavenger") {
    return (
      <group ref={ref}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, -0.08, 0.1]}>
          <boxGeometry args={[1.0, 0.09, 0.22]} />
          <meshStandardMaterial
            color={darker}
            emissive={darker}
            emissiveIntensity={0.35}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0.22, -0.1, -0.32]} rotation={[0, 0, -0.15]}>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 6]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[-0.22, -0.1, -0.32]} rotation={[0, 0, 0.15]}>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 6]} />
          <meshStandardMaterial color="#fbbf24" emissive="#d97706" emissiveIntensity={0.4} />
        </mesh>
      </group>
    );
  }
  if (shipId === "void") {
    return (
      <group ref={ref}>
        <mesh>
          <octahedronGeometry args={[0.36, 0]} />
          <meshStandardMaterial
            color={color}
            emissive="#7c3aed"
            emissiveIntensity={0.8}
            roughness={0.2}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.58, 0.04, 8, 20]} />
          <meshStandardMaterial
            color="#a78bfa"
            emissive="#7c3aed"
            emissiveIntensity={0.7}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshBasicMaterial color="#f0abfc" transparent opacity={0.9} />
        </mesh>
      </group>
    );
  }
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.28, 1.0, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, -0.05, 0.1]}>
        <boxGeometry args={[1.1, 0.09, 0.3]} />
        <meshStandardMaterial
          color={darker}
          emissive={darker}
          emissiveIntensity={0.35}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, -0.05, 0.55]}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

export function ShipPreview({ color, shipId }: { color: string; shipId: string }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
      <Canvas camera={{ position: [0, 0.3, 2], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={0.6} />
        <SpinningPreviewMesh color={color} shipId={shipId} />
      </Canvas>
    </div>
  );
}

export type UpgradeIcon = "magnet" | "coins" | "trophy" | "timer" | "shield";

export function SpinningUpgradeMesh({ icon }: { icon: UpgradeIcon }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 1.4;
      ref.current.rotation.x = Math.sin(performance.now() * 0.001) * 0.2;
    }
  });
  if (icon === "magnet") {
    return (
      <group ref={ref}>
        <mesh rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.3, 0.09, 10, 22, Math.PI]} />
          <meshStandardMaterial color="#10b981" emissive="#064e3b" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[-0.3, -0.08, 0]}>
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.3, -0.08, 0]}>
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
      </group>
    );
  }
  if (icon === "coins") {
    return (
      <group ref={ref}>
        {[0, 0.1, 0.2].map((y, i) => (
          <mesh key={i} position={[0, y - 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.06, 24]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#ca8a04"
              emissiveIntensity={0.5}
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>
    );
  }
  if (icon === "trophy") {
    return (
      <group ref={ref}>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.26, 0.18, 0.36, 16]} />
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#78350f"
            emissiveIntensity={0.4}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, -0.12, 0]}>
          <boxGeometry args={[0.35, 0.08, 0.35]} />
          <meshStandardMaterial color="#7c2d12" emissive="#451a03" emissiveIntensity={0.3} />
        </mesh>
      </group>
    );
  }
  if (icon === "timer") {
    return (
      <group ref={ref}>
        <mesh>
          <torusGeometry args={[0.28, 0.05, 10, 24]} />
          <meshStandardMaterial color="#22d3ee" emissive="#0e7490" emissiveIntensity={0.6} />
        </mesh>
        {/* Clock hand */}
        <mesh position={[0.1, 0, 0.01]}>
          <boxGeometry args={[0.18, 0.04, 0.03]} />
          <meshStandardMaterial color="#06b6d4" emissive="#0e7490" emissiveIntensity={0.6} />
        </mesh>
      </group>
    );
  }
  // shield
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.3, 18, 12]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#1e3a8a"
          emissiveIntensity={0.5}
          wireframe
        />
      </mesh>
      <mesh scale={[0.75, 0.75, 0.75]}>
        <sphereGeometry args={[0.3, 14, 10]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#1e3a8a"
          emissiveIntensity={0.4}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

export function UpgradePreview({ icon }: { icon: UpgradeIcon }) {
  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
      <Canvas camera={{ position: [0, 0, 1.5], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={0.5} />
        <SpinningUpgradeMesh icon={icon} />
      </Canvas>
    </div>
  );
}

export type ConsumableIcon = "rocket" | "coins" | "heart" | "sparkles";

export function SpinningConsumableMesh({ icon }: { icon: ConsumableIcon }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 1.4;
      ref.current.rotation.x = Math.sin(performance.now() * 0.001) * 0.2;
    }
  });
  if (icon === "rocket") {
    return (
      <group ref={ref}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.16, 0.6, 12]} />
          <meshStandardMaterial color="#ec4899" emissive="#831843" emissiveIntensity={0.55} />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.9} />
        </mesh>
      </group>
    );
  }
  if (icon === "coins") {
    return (
      <group ref={ref}>
        {[0, 0.08, 0.16].map((y, i) => (
          <mesh key={i} position={[0, y - 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.26, 0.26, 0.05, 20]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#ca8a04"
              emissiveIntensity={0.55}
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
        ))}
      </group>
    );
  }
  if (icon === "heart") {
    return (
      <group ref={ref}>
        <mesh position={[-0.12, 0.06, 0]}>
          <sphereGeometry args={[0.16, 10, 10]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.12, 0.06, 0]}>
          <sphereGeometry args={[0.16, 10, 10]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, -0.14, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.28, 0.28, 0.16]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" emissiveIntensity={0.5} />
        </mesh>
      </group>
    );
  }
  // sparkles
  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={0.7} />
      </mesh>
      <mesh scale={0.55} position={[0.25, 0.2, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#fef08a" emissive="#ca8a04" emissiveIntensity={0.8} />
      </mesh>
      <mesh scale={0.4} position={[-0.25, -0.15, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

export function ConsumablePreview({ icon }: { icon: ConsumableIcon }) {
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
      <Canvas camera={{ position: [0, 0, 1.4], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={0.5} />
        <SpinningConsumableMesh icon={icon} />
      </Canvas>
    </div>
  );
}

export type CosmeticSlotKind = "hull" | "engine" | "deathFx";

export function SpinningCosmeticMesh({ slot, value }: { slot: CosmeticSlotKind; value: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 1.3;
      ref.current.rotation.x = Math.sin(performance.now() * 0.0009) * 0.2;
    }
  });
  if (slot === "hull") {
    // Mini ship tinted by the hull color
    return (
      <group ref={ref}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.22, 0.8, 10]} />
          <meshStandardMaterial
            color={value}
            emissive={value}
            emissiveIntensity={0.45}
            roughness={0.5}
          />
        </mesh>
        <mesh position={[0, -0.04, 0.08]}>
          <boxGeometry args={[0.9, 0.08, 0.24]} />
          <meshStandardMaterial
            color={value}
            emissive={value}
            emissiveIntensity={0.3}
            roughness={0.5}
          />
        </mesh>
      </group>
    );
  }
  if (slot === "engine") {
    // Flame cone in cosmetic color with hot white core
    return (
      <group ref={ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.22, 0.55, 16, 1, true]} />
          <meshStandardMaterial
            color={value}
            emissive={value}
            emissiveIntensity={1.2}
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.1, 12, 10]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} />
        </mesh>
      </group>
    );
  }
  // deathFx — abstract: torus knot representing the effect variant
  return (
    <group ref={ref}>
      <mesh>
        <torusKnotGeometry args={[0.22, 0.06, 48, 8]} />
        <meshStandardMaterial color="#a78bfa" emissive="#6d28d9" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

export function CosmeticPreview({ slot, value }: { slot: CosmeticSlotKind; value: string }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
      <Canvas camera={{ position: [0, 0, 1.4], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 2]} intensity={0.5} />
        <SpinningCosmeticMesh slot={slot} value={value} />
      </Canvas>
    </div>
  );
}
