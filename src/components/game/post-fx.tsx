"use client";

import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import { useMemo } from "react";

interface PostFxProps {
  enabled: boolean;
  intensity: number;
}

export function PostFx({ enabled, intensity }: PostFxProps) {
  const caOffset = useMemo(
    () => new THREE.Vector2(0.0008 * intensity, 0.0008 * intensity),
    [intensity],
  );
  if (!enabled) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.9 * intensity}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
      <ChromaticAberration
        offset={caOffset}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette eskil={false} offset={0.35} darkness={0.55} />
    </EffectComposer>
  );
}
