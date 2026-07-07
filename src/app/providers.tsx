"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
      {/* Chrome honors the OS prefers-reduced-motion preference; games opt out */}
      {/* of this via their own reducedMotion="never" wrapper (see game-loader.tsx, */}
      {/* sections/game.tsx) since motion is opt-in gameplay, not decoration. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  );
}
