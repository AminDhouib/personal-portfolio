"use client";

import dynamic from "next/dynamic";
import { WebGLOnly } from "./webgl-only";

const GeometricBackgroundInner = dynamic(
  () => import("./geometric-background").then((m) => m.GeometricBackground),
  { ssr: false },
);

export function GeometricBackgroundLoader() {
  // Without WebGL nothing mounts, not even the three.js chunk: the CSS
  // background (BackgroundFX) underneath is the whole backdrop.
  return (
    <WebGLOnly>
      <GeometricBackgroundInner />
    </WebGLOnly>
  );
}
