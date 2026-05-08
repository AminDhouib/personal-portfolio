"use client";

import { useRef, useMemo, useEffect, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function WireframeShape({
  geometry,
  position,
  speed,
  color,
  scrollVelocity,
}: {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  speed: number;
  color: string;
  scrollVelocity: RefObject<number>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const boost = 1 + Math.min(Math.abs(scrollVelocity.current ?? 0) * 4, 10);
    meshRef.current.rotation.x += delta * speed * 0.55 * boost;
    meshRef.current.rotation.y += delta * speed * 0.4 * boost;

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

function CameraRig({
  scrollY,
  scrollVelocity,
}: {
  scrollY: RefObject<number>;
  scrollVelocity: RefObject<number>;
}) {
  const { camera } = useThree();
  useFrame(() => {
    const target = -(scrollY.current ?? 0) * 0.0015;
    camera.position.y += (target - camera.position.y) * 0.04;
    scrollVelocity.current = (scrollVelocity.current ?? 0) * 0.9;
  });
  return null;
}

function Shapes({
  scrollY,
  scrollVelocity,
}: {
  scrollY: RefObject<number>;
  scrollVelocity: RefObject<number>;
}) {
  const geometries = useMemo(
    () => ({
      tetra:    new THREE.TetrahedronGeometry(1.1),      // 4 faces
      pyramid3: new THREE.ConeGeometry(1, 1.5, 3),      // 4 faces
      pyramid4: new THREE.ConeGeometry(1, 1.4, 4),      // 5 faces
    }),
    []
  );

  return (
    <>
      <CameraRig scrollY={scrollY} scrollVelocity={scrollVelocity} />
      {/* Hero band (y ≈ -3 to +4) — left side reinforced so it matches the
          right-side cluster behind the profile photo. */}
      <WireframeShape
        geometry={geometries.tetra}
        position={[3, 1, -2]}
        speed={0.4}
        color="#22c55e"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[-3, -1.5, -3]}
        speed={0.6}
        color="#6366f1"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[1, -2, -1.5]}
        speed={0.5}
        color="#a78bfa"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.tetra}
        position={[-2, 2.5, -4]}
        speed={0.3}
        color="#06b6d4"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[4, -3, -2.5]}
        speed={0.35}
        color="#22c55e"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[3.5, 3, -5]}
        speed={0.25}
        color="#f59e0b"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.tetra}
        position={[-4, -2, -3]}
        speed={0.45}
        color="#a78bfa"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[-1.5, 3.5, -6]}
        speed={0.28}
        color="#6366f1"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[2.5, -1, -4]}
        speed={0.55}
        color="#06b6d4"
        scrollVelocity={scrollVelocity}
      />
      {/* Extra hero left-side shapes — balances the right-side photo cluster */}
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[-3.5, 1.5, -2.5]}
        speed={0.42}
        color="#f59e0b"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.tetra}
        position={[-4.5, 0.5, -4]}
        speed={0.32}
        color="#22c55e"
        scrollVelocity={scrollVelocity}
      />
      {/* Mid-scroll band (y ≈ -8 to -4) — fills work/services/reviews section
          backgrounds so they don't go visually empty as the camera glides down. */}
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[3.2, -5, -3]}
        speed={0.5}
        color="#a78bfa"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.tetra}
        position={[-3.8, -6, -4.5]}
        speed={0.35}
        color="#06b6d4"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[1.5, -7.5, -2]}
        speed={0.45}
        color="#22c55e"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[-1.5, -8.5, -5]}
        speed={0.28}
        color="#6366f1"
        scrollVelocity={scrollVelocity}
      />
      {/* Deep band (y ≈ -14 to -10) — covers opensource/background/game/blog
          sections so the lower scroll positions still have ambient motion. */}
      <WireframeShape
        geometry={geometries.tetra}
        position={[3.8, -10, -3.5]}
        speed={0.4}
        color="#f59e0b"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[-3.5, -11, -2.5]}
        speed={0.55}
        color="#a78bfa"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[2, -12.5, -5]}
        speed={0.3}
        color="#06b6d4"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.tetra}
        position={[-2.5, -14, -3]}
        speed={0.5}
        color="#22c55e"
        scrollVelocity={scrollVelocity}
      />
      {/* Bottom band (y ≈ -18 to -16) — keeps beyond-code + contact alive. */}
      <WireframeShape
        geometry={geometries.pyramid4}
        position={[3, -16, -4]}
        speed={0.38}
        color="#6366f1"
        scrollVelocity={scrollVelocity}
      />
      <WireframeShape
        geometry={geometries.pyramid3}
        position={[-3, -17.5, -3.5]}
        speed={0.45}
        color="#f59e0b"
        scrollVelocity={scrollVelocity}
      />
    </>
  );
}

export function GeometricBackground() {
  const scrollY = useRef(0);
  const scrollVelocity = useRef(0);

  useEffect(() => {
    let lastY = window.scrollY;
    let lastTime = performance.now();
    const handler = () => {
      const now = performance.now();
      const dt = Math.max(now - lastTime, 1);
      scrollVelocity.current = (window.scrollY - lastY) / dt;
      scrollY.current = window.scrollY;
      lastY = window.scrollY;
      lastTime = now;
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <Shapes scrollY={scrollY} scrollVelocity={scrollVelocity} />
      </Canvas>
    </div>
  );
}
