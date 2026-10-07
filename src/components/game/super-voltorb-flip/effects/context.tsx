"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EffectTheme } from ".";
import { themes } from ".";

const EffectsCtx = createContext<EffectTheme | null>(null);

export function EffectsProvider({
  themeName = "default",
  children,
}: {
  themeName?: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<EffectTheme | null>(null);
  useEffect(() => {
    themes[themeName]?.().then(setTheme).catch(reportError);
  }, [themeName]);
  // Always render the Provider, with a null theme until the import lands:
  // swapping a Fragment for a Provider changes the root element type and
  // remounts every child (the whole board flickered once per load).
  return <EffectsCtx.Provider value={theme}>{children}</EffectsCtx.Provider>;
}

export function useEffectsTheme(): EffectTheme | null {
  return useContext(EffectsCtx);
}
