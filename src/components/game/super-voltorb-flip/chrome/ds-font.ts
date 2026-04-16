import { Silkscreen } from "next/font/google";

/**
 * Pixel font used for React-rendered DS labels so their style matches the
 * sprite chrome. Silkscreen is a free bitmap font reminiscent of late-90s
 * handheld menu type and fits the ~6-8px label bands in the scoreboard.
 */
export const dsFont = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});
