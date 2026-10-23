import * as THREE from "three";

// Module-level cached radial glow texture — one soft white-to-transparent
// gradient reused by every additive halo sprite. Built lazily so this module
// never touches `document` at import time (SSR-safe).
let GLOW_TEXTURE: THREE.CanvasTexture | null = null;
export function glowTexture(): THREE.CanvasTexture {
  if (GLOW_TEXTURE) return GLOW_TEXTURE;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  GLOW_TEXTURE = tex;
  return tex;
}
