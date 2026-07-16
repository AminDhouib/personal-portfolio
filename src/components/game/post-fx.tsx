"use client";

import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  HueSaturation,
  Vignette,
} from "@react-three/postprocessing";
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
      {/* Selective by threshold: only pixels with luminance approaching 1.0
          bloom, so sharp hull surfaces stay sharp while explosions, coin
          sparkles, bullet tracers, warp core etc. still glow. Materials that
          should bloom use toneMapped={false} with a color boost > 1.0. */}
      <Bloom
        intensity={0.55 * intensity}
        luminanceThreshold={0.65}
        luminanceSmoothing={0.12}
        mipmapBlur
      />
      {/* Subtle color grade: lift saturation and contrast a touch so the
          scene reads richer without shifting hue. */}
      <HueSaturation saturation={0.12} />
      <BrightnessContrast brightness={0} contrast={0.06} />
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
