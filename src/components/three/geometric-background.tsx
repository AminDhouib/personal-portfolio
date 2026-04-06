"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function WireframeShape({
  geometry,
  position,
  speed,
  color,
}: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  speed: number;
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += delta * speed * 0.3;
    meshRef.current.rotation.y += delta * speed * 0.2;

    // Parallax on mouse
    meshRef.current.position.x =
      position[0] + pointer.x * 0.3;
    meshRef.current.position.y =
      position[1] + pointer.y * 0.2;
  });

  return (
    <mesh ref={meshRef} position={position} geometry={geometry}>
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.15}
      />
    </mesh>
  );
}

function Shapes() {
  const geometries = useMemo(
    () => ({
      circle: new THREE.TorusGeometry(1.2, 0.02, 16, 48),
      triangle: new THREE.ConeGeometry(1, 1.5, 3),
      diamond: new THREE.OctahedronGeometry(0.9),
    }),
    []
  );

  return (
    <>
      <WireframeShape
        geometry={geometries.circle}
        position={[3, 1, -2]}
        speed={0.4}
        color="#22c55e"
      />
      <WireframeShape
        geometry={geometries.triangle}
        position={[-3, -1.5, -3]}
        speed={0.6}
        color="#6366f1"
      />
      <WireframeShape
        geometry={geometries.diamond}
        position={[1, -2, -1.5]}
        speed={0.5}
        color="#a78bfa"
      />
      <WireframeShape
        geometry={geometries.circle}
        position={[-2, 2.5, -4]}
        speed={0.3}
        color="#06b6d4"
      />
      <WireframeShape
        geometry={geometries.diamond}
        position={[4, -3, -2.5]}
        speed={0.35}
        color="#22c55e"
      />
      <WireframeShape
        geometry={geometries.triangle}
        position={[3.5, 3, -5]}
        speed={0.25}
        color="#f59e0b"
      />
      <WireframeShape
        geometry={geometries.circle}
        position={[-4, -2, -3]}
        speed={0.45}
        color="#a78bfa"
      />
      <WireframeShape
        geometry={geometries.diamond}
        position={[-1.5, 3.5, -6]}
        speed={0.28}
        color="#6366f1"
      />
      <WireframeShape
        geometry={geometries.triangle}
        position={[2.5, -1, -4]}
        speed={0.55}
        color="#06b6d4"
      />
    </>
  );
}

export function GeometricBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <Shapes />
      </Canvas>
    </div>
  );
}
