import type { ComponentType } from "react";

export type EffectProps = {
  row: number;
  col: number;
  onDone: () => void;
};

export type EffectTheme = {
  name: string;
  BombFlip: ComponentType<EffectProps>;
  CoinReveal: ComponentType<EffectProps>;
  Win: ComponentType<{ onDone: () => void }>;
};

export const themes: Record<string, () => Promise<EffectTheme>> = {
  default: async () => (await import("./default")).theme,
};
